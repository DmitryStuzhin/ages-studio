import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { RetentionPoint, SyncLogLine } from "@/db/schema";
import { getSettings, saveSettings } from "./repo";
import {
  YouTubeData, YouTubeAnalytics, accessToken, oauthConfigured, videoIdFromUrl, ApiError,
} from "@/lib/integrations/youtube";

// Синхронизация с YouTube: по расписанию раз в N часов (по умолчанию 12) и по кнопке.
// Данные сохраняются в базу, шаги конвейера читают уже готовую сводку — повторно ничего не запрашивается.

export type GoogleAuth = {
  refreshToken: string; channelId: string | null; channelTitle: string | null; connectedAt: string;
  /** Когда обнаружено, что Google отозвал доступ (истёк срок в режиме Testing или доступ отозван вручную). */
  expiredAt?: string | null;
};

export const TESTING_TOKEN_DAYS = 7;

/** Состояние входа для интерфейса: ok / скоро истечёт / истёк / нет входа. */
export async function googleAuthState() {
  const auth = await getGoogleAuth();
  const settings = await getSettings();
  if (!auth) return { kind: "none" as const, auth: null, hoursLeft: null };
  if (auth.expiredAt) return { kind: "expired" as const, auth, hoursLeft: 0 };
  if (settings.google.testingMode) {
    const until = new Date(auth.connectedAt).getTime() + TESTING_TOKEN_DAYS * 86400000;
    const hoursLeft = Math.round((until - Date.now()) / 3600000);
    if (hoursLeft <= 0) return { kind: "expired" as const, auth, hoursLeft: 0 };
    if (hoursLeft <= 48) return { kind: "expiring" as const, auth, hoursLeft };
    return { kind: "ok" as const, auth, hoursLeft };
  }
  return { kind: "ok" as const, auth, hoursLeft: null };
}

function isRevoked(e: unknown) {
  return e instanceof ApiError && (e.status === 400 || e.status === 401) && /invalid_grant|expired|revoked/i.test(e.message);
}

export async function getGoogleAuth(): Promise<GoogleAuth | null> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "google_oauth") });
  return (row?.value as GoogleAuth | undefined) ?? null;
}
export async function setGoogleAuth(v: GoogleAuth | null) {
  const db = await getDb();
  if (!v) { await db.delete(schema.settings).where(eq(schema.settings.key, "google_oauth")); return; }
  await db.insert(schema.settings).values({ key: "google_oauth", value: v })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: v } });
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
/** Analytics отдаёт данные с задержкой ~2–3 дня. */
const ANALYTICS_LAG_DAYS = 3;
const MILESTONES = [2, 7, 28];

type Log = { lines: SyncLogLine[]; ok: (t: string) => void; warn: (t: string) => void; error: (t: string) => void };
function makeLog(): Log {
  const lines: SyncLogLine[] = [];
  return {
    lines,
    ok: (text) => lines.push({ level: "ok", text }),
    warn: (text) => lines.push({ level: "warn", text }),
    error: (text) => lines.push({ level: "error", text }),
  };
}

async function upsertSnapshot(subscribers: number, watchHours: number | null) {
  const db = await getDb();
  const today = day(new Date());
  const existing = await db.select().from(schema.channelSnapshots)
    .where(and(eq(schema.channelSnapshots.day, today), eq(schema.channelSnapshots.source, "api")));
  if (existing[0]) {
    await db.update(schema.channelSnapshots)
      .set({ subscribers, ...(watchHours != null ? { watchHours12m: +watchHours.toFixed(1) } : {}) })
      .where(eq(schema.channelSnapshots.id, existing[0].id));
  } else {
    await db.insert(schema.channelSnapshots).values({ day: today, subscribers, watchHours12m: watchHours != null ? +watchHours.toFixed(1) : null, source: "api" });
  }
}

// ---------- Data API: свой канал ----------

async function syncChannel(yt: YouTubeData, channelId: string, log: Log) {
  const db = await getDb();
  const ch = await yt.channel(channelId);
  if (ch.subscribers != null) await upsertSnapshot(ch.subscribers, null);
  log.ok(`Канал «${ch.title}»: ${ch.subscribers ?? "скрыто"} подписчиков, ${ch.views?.toLocaleString("ru")} просмотров, ${ch.videos} видео.`);

  const ids = await yt.playlistVideoIds(ch.uploads);
  const vids = await yt.videos(ids);
  for (const v of vids) {
    const row = {
      title: v.title, publishedAt: new Date(v.publishedAt), durationSec: v.durationSec, views: v.views, likes: v.likes,
      comments: v.comments, isShort: v.durationSec != null && v.durationSec <= 180, updatedAt: new Date(),
    };
    await db.insert(schema.channelVideos).values({ videoId: v.id, ...row })
      .onConflictDoUpdate({ target: schema.channelVideos.videoId, set: row });
    // История по дням: из неё считаются просмотры за сутки и неделю по каждому ролику.
    const h = { views: v.views, likes: v.likes, comments: v.comments };
    await db.insert(schema.videoHistory).values({ videoId: v.id, day: day(new Date()), ...h })
      .onConflictDoUpdate({ target: [schema.videoHistory.videoId, schema.videoHistory.day], set: h });
  }
  log.ok(`Статистика ${vids.length} роликов канала обновлена.`);

  // Привязка проектов к роликам: по ссылке или по точному совпадению названия.
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.kind, "long"));
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
  let linked = 0;
  for (const p of projects) {
    const byUrl = videoIdFromUrl(p.youtubeUrl);
    const v = byUrl ? vids.find((x) => x.id === byUrl) : vids.find((x) => norm(x.title) === norm(p.title) && x.durationSec != null && x.durationSec > 180);
    if (!v) continue;
    const patch: Partial<typeof schema.projects.$inferInsert> = {};
    if (!p.youtubeUrl) patch.youtubeUrl = `https://youtu.be/${v.id}`;
    // Дата с канала — источник правды, даже если в проекте была вписана вручную.
    if (!p.publishedAt || p.publishedAt.getTime() !== new Date(v.publishedAt).getTime()) patch.publishedAt = new Date(v.publishedAt);
    if (p.status !== "published" && p.status !== "archived") patch.status = "published";
    if (Object.keys(patch).length) {
      await db.update(schema.projects).set({ ...patch, updatedAt: new Date() }).where(eq(schema.projects.id, p.id));
      linked++;
      log.ok(`Проект «${p.title}» привязан к ролику на канале${patch.status ? " и отмечен опубликованным" : ""}.`);
    }
  }
  if (!linked) log.ok("Новых привязок проектов к роликам нет.");
  return ch;
}

// ---------- Data API: сводка ниши ----------

// Запросы под формат канала: ищут именно «24 часа как…» и «выжил бы ты…», а не всю историю подряд.
const FORMAT_QUERIES = [
  "why you wouldn't survive 24 hours as a",
  "24 hours as a medieval",
  "would you survive as a",
  "what it was like to be a",
  "a day in the life of a",
];

type FoundVideo = Awaited<ReturnType<YouTubeData["videos"]>>[number];
type ChannelInfo = Awaited<ReturnType<YouTubeData["channelsStats"]>> extends Map<string, infer V> ? V : never;

async function upsertMarketVideo(v: FoundVideo, query: string, ch: ChannelInfo | undefined) {
  const db = await getDb();
  const values = {
    kind: "competitor_video" as const, title: v.title, channel: v.channelTitle, url: `https://www.youtube.com/watch?v=${v.id}`,
    views: v.views, publishedAt: v.publishedAt.slice(0, 10), publishedTs: new Date(v.publishedAt), tags: query, source: "api" as const,
    externalId: `yt:${v.id}`, updatedAt: new Date(), channelId: v.channelId, channelSubs: ch?.subscribers ?? null,
    channelVideos: ch?.videos ?? null, channelViews: ch?.views ?? null, channelThumb: ch?.thumb ?? null,
    durationSec: v.durationSec, likes: v.likes, comments: v.comments,
    description: v.description, ytTags: v.tags.join(", "), categoryId: v.categoryId, language: v.language,
  };
  const { kind: _k, source: _s, externalId: _e, tags: _t, ...update } = values;
  await db.insert(schema.marketItems).values(values).onConflictDoUpdate({ target: schema.marketItems.externalId, set: update });
  const h = { views: v.views, likes: v.likes, comments: v.comments };
  await db.insert(schema.videoHistory).values({ videoId: v.id, day: day(new Date()), ...h })
    .onConflictDoUpdate({ target: [schema.videoHistory.videoId, schema.videoHistory.day], set: h });
}

async function syncNiche(yt: YouTubeData, ownChannelId: string, log: Log) {
  const settings = await getSettings();
  const db = await getDb();
  const queries = [...FORMAT_QUERIES, ...settings.sync.nicheQueries];
  if (settings.sync.addProjectRoles) {
    const active = await db.select().from(schema.projects)
      .where(and(eq(schema.projects.kind, "long"), eq(schema.projects.legacy, false), inArray(schema.projects.status, ["draft", "in_progress"])))
      .orderBy(desc(schema.projects.updatedAt));
    for (const p of active.slice(0, 2)) if (p.params.role) queries.push(`24 hours as a ${p.params.role}`);
  }
  const unique = [...new Set(queries.map((q) => q.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  const after = addDays(new Date(), -settings.sync.publishedWithinDays).toISOString();
  const found = new Map<string, string>(); // videoId → запрос
  for (const q of unique) {
    try {
      const ids = await yt.search(q, { maxResults: settings.sync.resultsPerQuery, publishedAfter: after });
      for (const id of ids) if (!found.has(id)) found.set(id, q);
    } catch (e) {
      log.warn(`Запрос «${q}»: ${e instanceof Error ? e.message : e}`);
      if (e instanceof ApiError && e.status === 403) break; // квота кончилась — дальше бессмысленно
    }
  }
  // Освежаем и уже известные ролики (не скрытые): просмотры растут, это видно по «скорости».
  const known = await db.select({ ext: schema.marketItems.externalId, tags: schema.marketItems.tags }).from(schema.marketItems)
    .where(and(eq(schema.marketItems.source, "api"), eq(schema.marketItems.hidden, false)));
  const knownIds = new Set(known.map((k) => k.ext?.replace(/^yt:/, "")).filter(Boolean));
  for (const k of known) {
    const id = k.ext?.replace(/^yt:/, "");
    if (id && !found.has(id) && found.size < 500) found.set(id, k.tags);
  }
  const vids = (await yt.videos([...found.keys()])).filter((v) => v.channelId !== ownChannelId);
  const channels = await yt.channelsStats([...new Set(vids.map((v) => v.channelId))]);
  for (const v of vids) await upsertMarketVideo(v, found.get(v.id) ?? "", channels.get(v.channelId));
  log.ok(`Сводка ниши: ${unique.length} запросов, ${vids.length} роликов конкурентов обновлено.`);

  // Каналы формата: забираем их последние загрузки целиком — 1–2 единицы квоты на канал вместо 100 за поиск.
  try {
    const { enrichedMarket } = await import("./niche");
    const { all } = await enrichedMarket();
    const fmt = new Map<string, number>();
    for (const e of all) if (e.formatChannel && e.channelId && e.channelId !== ownChannelId && !e.hidden) fmt.set(e.channelId, (fmt.get(e.channelId) ?? 0) + e.sim);
    const top = [...fmt].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
    const chInfo = await yt.channelsStats(top);
    let added = 0;
    for (const id of top) {
      const uploads = chInfo.get(id)?.uploads;
      if (!uploads) continue;
      const ids = (await yt.playlistVideoIds(uploads, 50)).filter((x) => !knownIds.has(x) && !found.has(x));
      if (!ids.length) continue;
      const fresh = (await yt.videos(ids)).filter((v) => new Date(v.publishedAt) >= new Date(after));
      for (const v of fresh) await upsertMarketVideo(v, `канал формата: ${v.channelTitle}`, chInfo.get(id));
      added += fresh.length;
    }
    if (top.length) log.ok(`Каналы формата: ${top.length}, новых роликов из их загрузок — ${added}.`);
  } catch (e) {
    log.warn(`Каналы формата: ${e instanceof Error ? e.message : e}`);
  }

  // Комментарии под сильными похожими роликами: из них совет берёт просьбы зрителей.
  try {
    const { nicheModel } = await import("./niche");
    const { similar } = await nicheModel();
    const fresh = new Set((await db.select({ v: schema.marketComments.videoId, t: schema.marketComments.fetchedAt }).from(schema.marketComments))
      .filter((r) => Date.now() - new Date(r.t).getTime() < 3 * 86400000).map((r) => r.v));
    const targets = similar.filter((e) => e.videoId && !fresh.has(e.videoId) && (e.comments ?? 0) > 0).slice(0, 12);
    let n = 0;
    for (const e of targets) {
      try {
        const rows = await yt.topComments(e.videoId!, 40);
        for (const c of rows) {
          const v = { id: c.id, videoId: e.videoId!, author: c.author, text: c.text, likes: c.likes, replies: c.replies, publishedAt: new Date(c.publishedAt), fetchedAt: new Date() };
          await db.insert(schema.marketComments).values(v).onConflictDoUpdate({ target: schema.marketComments.id, set: { likes: v.likes, replies: v.replies, fetchedAt: v.fetchedAt } });
          n++;
        }
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 403)) throw err; // комментарии отключены — пропускаем ролик
      }
    }
    if (targets.length) log.ok(`Комментарии: ${n} под ${targets.length} похожими роликами.`);
  } catch (e) {
    log.warn(`Комментарии: ${e instanceof Error ? e.message : e}`);
  }
}

// ---------- Analytics ----------

function downsample(points: { ratio: number; watch: number }[], durationSec: number, max = 24): RetentionPoint[] {
  if (!points.length) return [];
  const step = Math.max(1, Math.floor(points.length / max));
  const out: RetentionPoint[] = [];
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    out.push({ t: Math.round(p.ratio * durationSec), pct: Math.round(p.watch * 1000) / 10 });
  }
  const last = points.at(-1)!;
  if (out.at(-1)!.t !== Math.round(last.ratio * durationSec)) out.push({ t: Math.round(last.ratio * durationSec), pct: Math.round(last.watch * 1000) / 10 });
  return out;
}

async function syncAnalytics(auth: GoogleAuth, log: Log) {
  const db = await getDb();
  let token: string;
  try {
    token = await accessToken(auth.refreshToken);
  } catch (e) {
    if (isRevoked(e)) {
      await setGoogleAuth({ ...auth, expiredAt: new Date().toISOString() });
      log.error("Доступ Google истёк или отозван — нажми «Войти через Google» ещё раз. Пропущенные снимки метрик досчитаются после входа.");
      return;
    }
    throw e;
  }
  const ya = new YouTubeAnalytics(token);
  const now = new Date();

  try {
    const wh = await ya.watchHours12m(day(addDays(now, -365)), day(now));
    const subsRow = await db.select().from(schema.channelSnapshots).orderBy(desc(schema.channelSnapshots.day), desc(schema.channelSnapshots.id)).limit(1);
    await upsertSnapshot(subsRow[0]?.subscribers ?? 0, wh.hours);
    log.ok(`Часы просмотра за 12 месяцев: ${wh.hours.toFixed(1)}${wh.withoutShorts ? " (без Shorts, как в YPP)" : " (включая Shorts — разбивка недоступна)"}.`);
  } catch (e) {
    log.warn(`Часы канала: ${e instanceof Error ? e.message : e}`);
  }

  const projects = await db.select().from(schema.projects).where(eq(schema.projects.status, "published"));
  let added = 0;
  for (const p of projects) {
    const vid = videoIdFromUrl(p.youtubeUrl);
    if (!vid || !p.publishedAt) continue;
    const video = await db.query.channelVideos.findFirst({ where: eq(schema.channelVideos.videoId, vid) });
    const existing = await db.select({ day: schema.metrics.day }).from(schema.metrics)
      .where(and(eq(schema.metrics.projectId, p.id), eq(schema.metrics.source, "api")));
    for (const m of MILESTONES) {
      if (existing.some((e) => e.day === m)) continue;
      if (addDays(p.publishedAt, m + ANALYTICS_LAG_DAYS) > now) continue;
      const start = day(p.publishedAt);
      const end = day(addDays(p.publishedAt, m));
      try {
        const t = await ya.videoTotals(vid, start, end);
        const traffic = await ya.videoTraffic(vid, start, end);
        const curve = video?.durationSec ? downsample(await ya.retention(vid, start, end), video.durationSec) : [];
        const browse = (traffic.SUBSCRIBER ?? 0) + (traffic.RELATED_VIDEO ?? 0);
        await db.insert(schema.metrics).values({
          projectId: p.id, day: m, source: "api",
          views: t ? Number(t.engagedViews ?? t.views) : null,
          browseViews: browse,
          shortsViews: traffic.SHORTS ?? 0,
          avgViewPct: t ? Math.round(Number(t.averageViewPercentage) * 10) / 10 : null,
          avgViewSec: t ? Math.round(Number(t.averageViewDuration)) : null,
          subsGained: t ? Number(t.subscribersGained) : null,
          watchHours: t ? Math.round((Number(t.estimatedMinutesWatched) / 60) * 10) / 10 : null,
          retention: curve,
          notes: `YouTube Analytics. Главная и подписки: ${traffic.SUBSCRIBER ?? 0}, рекомендации: ${traffic.RELATED_VIDEO ?? 0}, Shorts: ${traffic.SHORTS ?? 0}, страница канала: ${traffic.YT_CHANNEL ?? 0}, поиск: ${traffic.YT_SEARCH ?? 0}. CTR показов API не отдаёт — впиши из Studio.`,
        }).onConflictDoNothing();
        added++;
        log.ok(`«${p.title}»: снимок дня ${m} сохранён.`);
      } catch (e) {
        log.warn(`«${p.title}», день ${m}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  await syncChannelReports(ya, log);
  if (!added) log.ok("Новых снимков метрик нет: следующие появятся на 2, 7 и 28 день после выхода (с задержкой данных ~3 дня).");
}

// ---------- Отчёты канала (YouTube Analytics) ----------

export type ReportKey = "daily" | "traffic" | "country" | "demographics" | "device" | "topVideos" | "subscribed" | "playback";

async function saveReport(key: ReportKey, data: unknown) {
  const db = await getDb();
  await db.insert(schema.channelReports).values({ key, data, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: schema.channelReports.key, set: { data, fetchedAt: new Date() } });
}

/** Всё, что отдаёт Analytics API по каналу: каждый отчёт отдельно, падение одного не мешает остальным. */
async function syncChannelReports(ya: YouTubeAnalytics, log: Log) {
  // Для шортсов YouTube с апреля 2025 считает в views каждый запуск; engagedViews — по-старому,
  // только просмотры, которые реально посмотрели (они и идут в зачёт монетизации). Для лонгов они равны.
  // Если отчёт с engagedViews не поддерживается, берём без него.
  const rep = async (q: Record<string, string>) => {
    if (!/(^|,)views(,|$)/.test(q.metrics)) return ya.report(q);
    try { return await ya.report({ ...q, metrics: q.metrics.replace(/(^|,)views(,|$)/, "$1engagedViews,views$2") }); } catch { return ya.report(q); }
  };

  const now = new Date();
  const end = day(now);
  const start365 = day(addDays(now, -365));
  const start90 = day(addDays(now, -90));
  const jobs: [ReportKey, string, () => Promise<unknown>][] = [
    ["daily", "динамика по дням (лонги и шортсы)", () => rep({ startDate: start365, endDate: end, dimensions: "day,creatorContentType", metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost", sort: "day" })],
    ["traffic", "источники трафика", () => rep({ startDate: start90, endDate: end, dimensions: "insightTrafficSourceType", metrics: "views,estimatedMinutesWatched", sort: "-views" })],
    ["country", "география", () => rep({ startDate: start90, endDate: end, dimensions: "country", metrics: "views,estimatedMinutesWatched,averageViewDuration", sort: "-views", maxResults: "12" })],
    ["demographics", "возраст и пол", () => ya.report({ startDate: start90, endDate: end, dimensions: "ageGroup,gender", metrics: "viewerPercentage" })],
    ["device", "устройства", () => rep({ startDate: start90, endDate: end, dimensions: "deviceType", metrics: "views,estimatedMinutesWatched", sort: "-views" })],
    ["topVideos", "топ роликов по времени просмотра", () => rep({ startDate: start90, endDate: end, dimensions: "video", metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,shares", sort: "-estimatedMinutesWatched", maxResults: "25" })],
    ["subscribed", "подписчики и новые зрители", () => rep({ startDate: start90, endDate: end, dimensions: "subscribedStatus", metrics: "views,estimatedMinutesWatched,averageViewDuration" })],
    ["playback", "где смотрят", () => rep({ startDate: start90, endDate: end, dimensions: "insightPlaybackLocationType", metrics: "views,estimatedMinutesWatched", sort: "-views" })],
  ];
  const ok: string[] = [];
  for (const [key, label, fn] of jobs) {
    try {
      await saveReport(key, await fn());
      ok.push(label);
    } catch (e) {
      log.warn(`Отчёт «${label}»: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (ok.length) log.ok(`Отчёты Analytics: ${ok.join(", ")}.`);
}

export async function reports() {
  const db = await getDb();
  const rows = await db.select().from(schema.channelReports);
  const out: Partial<Record<ReportKey, { data: Record<string, string | number>[]; fetchedAt: Date }>> = {};
  for (const r of rows) out[r.key as ReportKey] = { data: r.data as Record<string, string | number>[], fetchedAt: r.fetchedAt };
  return out;
}

// ---------- Запуск ----------

const g = globalThis as unknown as { __agesSync?: Promise<number> | null };

export async function runSync(trigger: "schedule" | "manual" | "startup"): Promise<number> {
  if (g.__agesSync) return g.__agesSync; // уже идёт — не запускаем второй раз
  g.__agesSync = (async () => {
    const db = await getDb();
    // Защита от параллельного запуска из другого процесса или вкладки: незавершённый запуск младше 10 минут.
    const [running] = await db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(1);
    if (running && !running.finishedAt && Date.now() - new Date(running.startedAt).getTime() < 600000) return running.id;
    const [run] = await db.insert(schema.syncRuns).values({ trigger }).returning();
    const log = makeLog();
    let units = 0;
    try {
      const settings = await getSettings();
      const key = process.env.YOUTUBE_API_KEY;
      const auth = await getGoogleAuth();
      if (!key && !auth) throw new Error("Нет ключа YOUTUBE_API_KEY и не выполнен вход в YouTube.");
      const channelId = auth?.channelId ?? settings.channel.channelId;
      if (key) {
        const yt = new YouTubeData(key);
        try {
          await syncChannel(yt, channelId, log);
          await syncNiche(yt, channelId, log);
        } finally {
          units = yt.units;
        }
      } else log.warn("YOUTUBE_API_KEY не задан — сводка ниши и статистика роликов пропущены.");
      if (auth?.expiredAt) log.error("Доступ Google истёк — Analytics не обновлялся. Нажми «Войти через Google».");
      else if (auth && oauthConfigured()) await syncAnalytics(auth, log);
      else log.warn("YouTube Analytics не подключён — удержание, источники трафика и часы не обновлялись.");
      const ok = !log.lines.some((l) => l.level === "error");
      await db.update(schema.syncRuns).set({ finishedAt: new Date(), ok, quotaUnits: units, log: log.lines }).where(eq(schema.syncRuns.id, run.id));
      if (settings.channel.channelId !== channelId) await saveSettings({ ...settings, channel: { ...settings.channel, channelId } });
    } catch (e) {
      log.error(e instanceof Error ? e.message : String(e));
      await db.update(schema.syncRuns).set({ finishedAt: new Date(), ok: false, quotaUnits: units, log: log.lines }).where(eq(schema.syncRuns.id, run.id));
    }
    return run.id;
  })();
  try {
    return await g.__agesSync;
  } finally {
    g.__agesSync = null;
  }
}

export async function lastRuns(limit = 10) {
  const db = await getDb();
  return db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(limit);
}

export async function quotaToday() {
  const db = await getDb();
  // Квота сбрасывается в полночь по тихоокеанскому времени.
  const pt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const offset = new Date().getTime() - pt.getTime();
  const midnightPt = new Date(new Date(pt.getFullYear(), pt.getMonth(), pt.getDate()).getTime() + offset);
  const [r] = (await db.execute(sql`select coalesce(sum(quota_units),0)::int as u from sync_runs where started_at >= ${midnightPt.toISOString()}`)).rows as { u: number }[];
  return r?.u ?? 0;
}

/** Вызывается таймером: запускает синхронизацию, если с последнего удачного запуска прошло intervalHours. */
export async function maybeSync() {
  if (!process.env.YOUTUBE_API_KEY && !(await getGoogleAuth())) return;
  const settings = await getSettings();
  const db = await getDb();
  const [last] = await db.select().from(schema.syncRuns).where(eq(schema.syncRuns.ok, true)).orderBy(desc(schema.syncRuns.id)).limit(1);
  const [lastAny] = await db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(1);
  const due = !last || Date.now() - new Date(last.startedAt).getTime() >= settings.sync.intervalHours * 3600000;
  // После неудачи (например, кончилась квота) повторяем не чаще раза в час, а не каждые 15 минут.
  const backoff = lastAny && lastAny.ok === false && Date.now() - new Date(lastAny.startedAt).getTime() < 3600000;
  if (due && !backoff) await runSync(last ? "schedule" : "startup");
}
