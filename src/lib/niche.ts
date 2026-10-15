// Похожие ролики и совет из них. Чистые функции без базы — всё считается при чтении из того,
// что уже собрано синхронизацией, поэтому правка весов не требует перезагрузки данных.
//
// Сходство (0–100) — насколько ролик похож на ролики канала Illustrated Ages:
//   формат названия (24 часа как…, выжил бы ты…, день из жизни…)  до 40
//   историческая тема                                             до 20
//   та же роль или пересечение слов с твоими названиями           до 15
//   длительность в твоём диапазоне                                до 15
//   анимация или иллюстрации                                      до 10
//   +10 — канал, который снимает этот формат постоянно
// «Сила» ролика — во сколько раз он обогнал размер своего канала (views / подписчики),
// с поправкой на просмотры в день. Сильные ролики и есть материал для совета.

import { isHistoryRelevant, viewsPerDay } from "./market";

export type NicheItem = {
  id: number; title: string; channel: string | null; channelId: string | null; url: string | null;
  views: number | null; likes: number | null; comments: number | null; durationSec: number | null;
  publishedAt: string | Date | null; publishedTs?: string | Date | null;
  channelSubs: number | null; channelVideos?: number | null; channelViews?: number | null; channelThumb?: string | null;
  description?: string | null; ytTags?: string | null; tags: string; hidden: boolean; pinned: boolean; externalId: string | null;
};
export type MyVideo = { title: string; durationSec: number | null; isShort: boolean; views: number | null; publishedAt: string | Date | null };

export type Enriched<T extends NicheItem = NicheItem> = T & {
  videoId: string | null; sim: number; reasons: string[]; role: string | null; era: string | null;
  vpd: number; outlier: number; power: number; isShort: boolean; formatChannel: boolean; mineRole: boolean; history: boolean;
};

const STOP = new Set("a an the of in as to and or for on at by with you your yours would wouldnt could couldnt can why how what was were is be this that it its from into one hours hour 24 day days life survive surviving".split(" "));
export const words = (t: string) => t.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

const FORMATS: { re: RegExp; score: number; label: string }[] = [
  { re: /\b24\s*hours?\b.*\bas\s+an?\b/i, score: 40, label: "тот же формат: «24 часа как…»" },
  { re: /\b(wouldn'?t|would you|could you|can you|couldn'?t)\s+(?:even\s+)?survive\b/i, score: 35, label: "формат «выжил бы ты…»" },
  { re: /\bday in the life\b|\b(a|one) day as an?\b|\blife (as|of) an?\b/i, score: 28, label: "формат «день из жизни»" },
  { re: /\bworst jobs?\b|\bwhat (it|life) was (really )?like\b|\bwhy (being|life as)\b/i, score: 22, label: "формат «каково было»" },
  { re: /\b24\s*hours?\b/i, score: 20, label: "«24 часа»" },
  { re: /\bsurviv/i, score: 15, label: "тема выживания" },
];
const STYLE = /\b(animat\w*|cartoon|illustrat\w*|explained|storytime|2d)\b/i;

const ERAS: [string, RegExp][] = [
  ["Каменный век", /\b(stone age|prehistoric|caveman|neanderthal|ice age)\b/i],
  ["Древний Египет", /\b(egypt\w*|pharaoh|pyramid|nile|mummy)\b/i],
  ["Древняя Греция", /\b(greek|greece|sparta\w*|athens|athenian)\b/i],
  ["Древний Рим", /\b(roman|rome|gladiator|legion\w*|caesar|pompeii)\b/i],
  ["Викинги", /\b(viking|norse)\b/i],
  ["Средневековье", /\b(medieval|middle ages|knight|castle|plague|peasant|serf|crusade\w*)\b/i],
  ["Пираты", /\b(pirate|buccaneer|caribbean)\b/i],
  ["Самураи и Азия", /\b(samurai|ninja|shogun|japan\w*|mongol\w*|china|chinese)\b/i],
  ["Ацтеки и майя", /\b(aztec|maya\w*|inca)\b/i],
  ["Викторианская эпоха", /\b(victorian|industrial|1800s|chimney)\b/i],
  ["Дикий Запад", /\b(wild west|cowboy|frontier|outlaw)\b/i],
  ["Мировые войны", /\b(ww1|ww2|wwi|wwii|world war|trench|d-?day|nazi|soldier)\b/i],
];

export function eraOf(text: string) {
  return ERAS.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** Роль из названия: «…24 Hours as a Medieval Executioner» → «medieval executioner». */
export function roleOf(title: string): string | null {
  const m = title.match(/\b(?:as|being|be|of|like)\s+(?:an?|the)\s+([A-Za-z][A-Za-z' -]{2,40}?)(?=\s*(?:[(\[|:!?.,—–-]|\b(?:in|during|for|was|were|is|who|that|would|and|at|on|vs|from|before|after)\b|$))/i);
  if (!m) return null;
  const r = m[1].trim().toLowerCase().replace(/\s+/g, " ").replace(/s$/, (x) => (/(ss|us)$/.test(m[1].toLowerCase()) ? x : ""));
  // Не роль, а описание: «cold war explained», «girl married too young», «woman caught».
  if (/\b(explained|married|caught|young|old|too|very|real|true|story|stories|documentary|history|life|day|time|world|war)\b/.test(r) && !/\b(soldier|warrior|knight|nun|monk|doctor)\b/.test(r)) return null;
  return r.split(" ").length <= 3 ? r : null;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
const quant = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};
export { median, quant };

export type Profile = { roles: Set<string>; tokens: Set<string>; longMedian: number; longMin: number; longMax: number; eras: Set<string> };

export function profileOf(mine: MyVideo[]): Profile {
  const long = mine.filter((v) => !v.isShort);
  const src = long.length ? long : mine;
  const durs = long.map((v) => v.durationSec ?? 0).filter((x) => x > 0);
  const med = median(durs) || 600;
  return {
    roles: new Set(src.map((v) => roleOf(v.title)).filter((x): x is string => Boolean(x))),
    tokens: new Set(src.flatMap((v) => words(v.title))),
    longMedian: med,
    longMin: Math.max(240, Math.min(...(durs.length ? durs : [med])) * 0.6),
    longMax: Math.max(...(durs.length ? durs : [med])) * 1.8,
    eras: new Set(src.map((v) => eraOf(v.title)).filter((x): x is string => Boolean(x))),
  };
}

const idOf = (m: NicheItem) => m.externalId?.replace(/^yt:/, "") ?? m.url?.match(/[?&]v=([\w-]{11})/)?.[1] ?? null;

export function enrich<T extends NicheItem>(items: T[], mine: MyVideo[]): Enriched<T>[] {
  const prof = profileOf(mine);
  const base = items.map((m) => {
    const text = `${m.title} ${(m.description ?? "").slice(0, 300)}`;
    const reasons: string[] = [];
    let sim = 0;
    const f = FORMATS.find((x) => x.re.test(m.title));
    const history = isHistoryRelevant({ title: m.title, channel: m.channel });
    // Формат без истории — это челленджи блогеров («24 часа в домике на дереве»): засчитываем вполсилы.
    if (f) { sim += history ? f.score : Math.round(f.score / 2); reasons.push(f.label); }
    if (history) { sim += 20; reasons.push("историческая тема"); }
    const role = roleOf(m.title);
    const mineRole = Boolean(role && prof.roles.has(role));
    if (mineRole) { sim += 15; reasons.push(`та же роль, что у тебя: ${role}`); }
    else {
      const w = new Set(words(m.title));
      const common = [...w].filter((x) => prof.tokens.has(x));
      if (common.length) { sim += Math.min(10, common.length * 4); reasons.push(`общие слова: ${common.slice(0, 3).join(", ")}`); }
    }
    const era = eraOf(m.title);
    const d = m.durationSec ?? 0;
    const isShort = d > 0 && d <= 180;
    if (!isShort && d >= prof.longMin && d <= prof.longMax) { sim += 15; reasons.push(`длина ${Math.round(d / 60)} мин — как у тебя`); }
    if (STYLE.test(text)) { sim += 10; reasons.push("анимация или иллюстрации"); }
    const vpd = viewsPerDay(m.views, m.publishedTs ?? m.publishedAt) ?? 0;
    const outlier = m.views != null ? m.views / Math.max(m.channelSubs ?? 0, 1000) : 0;
    return { ...m, videoId: idOf(m), sim, reasons, role, era, vpd, outlier, power: 0, isShort, formatChannel: false, mineRole, history };
  });
  // Каналы формата: снимают похожее постоянно — их ролики ближе всего к твоим.
  const byChannel = new Map<string, number[]>();
  for (const b of base) if (b.channelId) byChannel.set(b.channelId, [...(byChannel.get(b.channelId) ?? []), b.sim]);
  const formatChannels = new Set([...byChannel].filter(([, sims]) => sims.filter((x) => x >= 55).length >= 2 || sims.some((x) => x >= 80)).map(([id]) => id));
  // Сила: ранг по «обогнал канал» и ранг по просмотрам в день, среднее — чтобы не победили только гиганты или только свежие.
  const rank = (key: "outlier" | "vpd") => {
    const s = [...base].sort((a, b) => a[key] - b[key]);
    return new Map(s.map((x, i) => [x.id, s.length > 1 ? i / (s.length - 1) : 1]));
  };
  const ro = rank("outlier"), rv = rank("vpd");
  return base.map((b) => {
    const formatChannel = Boolean(b.channelId && formatChannels.has(b.channelId));
    const sim = Math.min(100, b.sim + (formatChannel ? 10 : 0));
    const reasons = formatChannel ? [...b.reasons, "канал снимает этот формат постоянно"] : b.reasons;
    return { ...b, sim, reasons, formatChannel, power: Math.round(((ro.get(b.id)! * 0.6 + rv.get(b.id)! * 0.4) * 100)) };
  });
}

export const SIMILAR_MIN = 55;
/** Похожий = исторический, не шортс, не часовая документалка и набрал порог сходства. Закреплённые — всегда. */
export const isSimilar = (e: Enriched) => !e.hidden && (e.pinned || (!e.isShort && e.history && (e.durationSec ?? 0) <= 40 * 60 && e.sim >= SIMILAR_MIN));

// ---------- Совет ----------

export type Feature = { key: string; label: string; top: number; rest: number; lift: number; nTop: number };
export type RoleStat = { role: string; era: string | null; count: number; best: number; medianVpd: number; bestTitle: string; bestId: string | null; recent: number; mine: boolean };
export type Request = { topic: string; mentions: number; likes: number; example: string };
export type Advice = {
  n: number; nTop: number; enough: boolean;
  duration: { top: number; rest: number; lo: number; hi: number; mine: number | null };
  titleLen: { top: number; rest: number; mine: number | null };
  features: Feature[];
  roles: RoleStat[]; ideas: RoleStat[]; saturated: RoleStat[];
  eras: { era: string; count: number; medianPower: number; mine: boolean }[];
  weekday: { day: string; share: number } | null; hourUtc: number | null;
  engagement: { likeTop: number; likeRest: number; commentTop: number; commentRest: number };
  tags: { tag: string; count: number }[];
  requests: Request[];
  tips: { text: string; why: string; strength: "сильный" | "средний" | "слабый" }[];
};

const TITLE_FEATURES: [string, string, RegExp][] = [
  ["24h", "«24 Hours» в названии", /\b24\s*hours?\b/i],
  ["why", "начинается с «Why…»", /^why\b/i],
  ["you", "обращение к зрителю «you»", /\byou\b/i],
  ["wouldnt", "«wouldn't / couldn't» — сомнение в зрителе", /\b(wouldn'?t|couldn'?t|can'?t)\b/i],
  ["number", "число в названии", /\d/],
  ["year", "год, век или «BC»", /\b1\d{3}s?\b|\bcentury\b|\bBC\b/i],
  ["caps", "слово КАПСОМ", /\b[A-Z]{3,}\b(?<!\bBC)/],
  ["question", "вопрос «?»", /\?/],
  ["colon", "двоеточие или тире", /\s[:—–|-]\s|:/],
  ["harsh", "жёсткое слово: worst, brutal, deadly, horrifying", /\b(worst|brutal\w*|horrif\w*|terrib\w*|deadl\w*|disgusting|insane|hell\w*|nightmare|gruesome)\b/i],
  ["realistic", "«really / actually / truth»", /\b(really|actually|truth|real)\b/i],
];
const DAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

// Только явные просьбы: «do a video on X», «make one about X», «do X next», «you should do X», «can you do X».
const REQ_RES = [
  /\b(?:do|make|cover)\s+(?:a|an|another)\s+(?:video|episode)\s+(?:on|about)\s+(?:an?\s+|the\s+)?([A-Za-z][A-Za-z' -]{2,40}?)(?=[.!?,\n]|\s+(?:next|please|pls|too)\b|$)/gi,
  /\b(?:do|make)\s+one\s+(?:on|about)\s+(?:an?\s+|the\s+)?([A-Za-z][A-Za-z' -]{2,40}?)(?=[.!?,\n]|\s+(?:next|please|pls|too)\b|$)/gi,
  /\b(?:please\s+)?do\s+(?:an?\s+|the\s+)?([A-Za-z][A-Za-z' -]{2,30}?)\s+next\b/gi,
  /\b(?:you should|can you|could you|pls|please)\s+(?:do|make|cover)\s+(?:an?\s+|the\s+)?([A-Za-z][A-Za-z' -]{2,40}?)(?=[.!?,\n]|\s+(?:next|please|pls|too)\b|$)/gi,
  /\bnext (?:video|episode|one)\s*(?:should be|:|-)\s*(?:an?\s+|the\s+)?([A-Za-z][A-Za-z' -]{2,40}?)(?=[.!?,\n]|$)/gi,
];
const NOT_TOPIC = /^(it|this|that|more|same|them|me|us|part|another|please|pls|plz|so|too|next|video|one|something|anything|everything|what|how|why|my|his|her|their|our|your|much|some|all|this one|that one)\b/;

export function extractRequests(comments: { text: string; likes: number }[]): Request[] {
  const map = new Map<string, Request>();
  for (const c of comments) {
    const seen = new Set<string>();
    for (const re of REQ_RES) {
      for (const m of c.text.matchAll(re)) {
        const topic = m[1].trim().toLowerCase().replace(/\s+/g, " ").replace(/\s+(video|episode|one|pls|please|sometime|someday|soon|again|next|too|maybe)$/, "").trim();
        if (topic.length < 3 || topic.split(" ").length > 5 || STOP.has(topic) || NOT_TOPIC.test(topic) || seen.has(topic)) continue;
        seen.add(topic);
        const r = map.get(topic) ?? { topic, mentions: 0, likes: 0, example: c.text.slice(0, 160) };
        r.mentions += 1;
        r.likes += c.likes;
        map.set(topic, r);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.mentions * 3 + Math.log1p(b.likes) - (a.mentions * 3 + Math.log1p(a.likes))).slice(0, 10);
}

export function buildAdvice(similar: Enriched[], mine: MyVideo[], comments: { text: string; likes: number }[]): Advice {
  const long = similar.filter((e) => !e.isShort);
  const sorted = [...long].sort((a, b) => b.power - a.power);
  const nTop = Math.max(3, Math.round(sorted.length * 0.25));
  const top = sorted.slice(0, nTop), rest = sorted.slice(nTop);
  const myLong = mine.filter((v) => !v.isShort);
  const enough = long.length >= 8;

  const durs = (xs: Enriched[]) => xs.map((e) => e.durationSec ?? 0).filter((x) => x > 0);
  const duration = {
    top: median(durs(top)), rest: median(durs(rest)), lo: quant(durs(top), 0.25), hi: quant(durs(top), 0.75),
    mine: myLong.length ? median(myLong.map((v) => v.durationSec ?? 0).filter(Boolean)) : null,
  };
  const titleLen = { top: median(top.map((e) => e.title.length)), rest: median(rest.map((e) => e.title.length)), mine: myLong.length ? median(myLong.map((v) => v.title.length)) : null };

  const share = (xs: Enriched[], re: RegExp) => (xs.length ? xs.filter((e) => re.test(e.title)).length / xs.length : 0);
  const features: Feature[] = TITLE_FEATURES.map(([key, label, re]) => {
    const t = share(top, re), r = share(rest, re);
    return { key, label, top: t, rest: r, lift: r > 0 ? t / r : t > 0 ? 3 : 1, nTop: top.filter((e) => re.test(e.title)).length };
  }).sort((a, b) => Math.abs(Math.log(b.lift || 0.01)) - Math.abs(Math.log(a.lift || 0.01)));

  const myRoles = new Set(mine.map((v) => roleOf(v.title)).filter(Boolean) as string[]);
  const roleMap = new Map<string, Enriched[]>();
  for (const e of long) if (e.role) roleMap.set(e.role, [...(roleMap.get(e.role) ?? []), e]);
  const since = Date.now() - 120 * 86400000;
  const roles: RoleStat[] = [...roleMap].map(([role, xs]) => {
    const best = [...xs].sort((a, b) => b.power - a.power)[0];
    return {
      role, era: eraOf(role) ?? best.era, count: xs.length, best: best.power, medianVpd: median(xs.map((x) => x.vpd)),
      bestTitle: best.title, bestId: best.videoId, mine: myRoles.has(role),
      recent: xs.filter((x) => x.publishedAt && new Date(x.publishedTs ?? x.publishedAt).getTime() >= since).length,
    };
  }).sort((a, b) => b.best - a.best);
  const ideas = roles.filter((r) => !r.mine && r.best >= 60 && r.recent < 3 && (r.era || r.count >= 2)).slice(0, 6);
  const saturated = roles.filter((r) => r.recent >= 3).slice(0, 5);

  const eraMap = new Map<string, number[]>();
  for (const e of long) if (e.era) eraMap.set(e.era, [...(eraMap.get(e.era) ?? []), e.power]);
  const myEras = new Set(mine.map((v) => eraOf(v.title)).filter(Boolean) as string[]);
  const eras = [...eraMap].map(([era, ps]) => ({ era, count: ps.length, medianPower: median(ps), mine: myEras.has(era) }))
    .filter((x) => x.count >= 2).sort((a, b) => b.medianPower - a.medianPower);

  const wd = new Map<number, number>();
  const hours: number[] = [];
  for (const e of top) {
    const ts = e.publishedTs ?? null;
    if (!ts) continue;
    const d = new Date(ts);
    wd.set(d.getUTCDay(), (wd.get(d.getUTCDay()) ?? 0) + 1);
    hours.push(d.getUTCHours());
  }
  const bestWd = [...wd].sort((a, b) => b[1] - a[1])[0];
  const weekday = bestWd && top.length ? { day: DAYS[bestWd[0]], share: bestWd[1] / top.length } : null;

  const rate = (xs: Enriched[], k: "likes" | "comments") => median(xs.filter((e) => e.views && e[k] != null).map((e) => (e[k]! / e.views!) * 100));
  const engagement = { likeTop: rate(top, "likes"), likeRest: rate(rest, "likes"), commentTop: rate(top, "comments"), commentRest: rate(rest, "comments") };

  const tagCount = new Map<string, number>();
  for (const e of top) for (const t of (e.ytTags ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const tags = [...tagCount].map(([tag, count]) => ({ tag, count })).filter((t) => t.count >= 2).sort((a, b) => b.count - a.count).slice(0, 14);

  const requests = extractRequests(comments);

  // ---- Советы: только то, что держится на данных, с пометкой силы сигнала ----
  const tips: Advice["tips"] = [];
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const strength = (n: number): "сильный" | "средний" | "слабый" => (n >= 8 ? "сильный" : n >= 4 ? "средний" : "слабый");
  if (ideas[0]) {
    tips.push({
      text: `Следующая роль: ${ideas.slice(0, 3).map((r) => r.role).join(", ")}`,
      why: `У похожих каналов эти роли обогнали свой канал (сила ${ideas[0].best}/100), а у тебя их ещё не было и тема не перегрета: «${ideas[0].bestTitle}».`,
      strength: strength(ideas.slice(0, 3).reduce((a, r) => a + r.count, 0)),
    });
  }
  if (duration.top && top.length >= 3) {
    const diff = duration.mine != null ? duration.mine - duration.top : 0;
    tips.push({
      text: `Длина ${mm(duration.lo)}–${mm(duration.hi)}`,
      why: `Медиана у сильных похожих — ${mm(duration.top)}, у остальных — ${mm(duration.rest)}.${duration.mine != null ? ` Твои ролики — ${mm(duration.mine)}${Math.abs(diff) > 90 ? diff > 0 ? ", длиннее лучших" : ", короче лучших" : ", в диапазоне"}.` : ""}`,
      strength: strength(top.length),
    });
  }
  for (const f of features.filter((x) => x.nTop >= 2 && x.lift >= 1.4).slice(0, 2)) {
    tips.push({ text: `В названии: ${f.label}`, why: `Есть у ${Math.round(f.top * 100)}% сильных похожих и только у ${Math.round(f.rest * 100)}% остальных.`, strength: strength(f.nTop) });
  }
  const avoid = features.find((x) => x.lift <= 0.6 && x.rest >= 0.25);
  if (avoid) tips.push({ text: `Реже: ${avoid.label}`, why: `У сильных похожих ${Math.round(avoid.top * 100)}%, у остальных ${Math.round(avoid.rest * 100)}%.`, strength: strength(rest.length) });
  if (titleLen.top) tips.push({ text: `Название около ${Math.round(titleLen.top)} знаков`, why: `Медиана сильных — ${Math.round(titleLen.top)}, остальных — ${Math.round(titleLen.rest)}${titleLen.mine ? `, у тебя — ${Math.round(titleLen.mine)}` : ""}.`, strength: "слабый" });
  if (eras[0] && !eras[0].mine) tips.push({ text: `Эпоха, которой у тебя нет: ${eras[0].era}`, why: `Медианная сила похожих роликов про неё — ${Math.round(eras[0].medianPower)}/100 (${eras[0].count} ролика).`, strength: strength(eras[0].count) });
  if (saturated[0]) tips.push({ text: `Перегрето: ${saturated.map((s) => s.role).slice(0, 3).join(", ")}`, why: `По ${saturated[0].recent}+ похожих ролика за 4 месяца — без сильного нового угла не выделиться.`, strength: "средний" });
  if (requests[0]) tips.push({ text: `Зрители просят: ${requests.slice(0, 3).map((r) => r.topic).join(", ")}`, why: `Из комментариев под сильными похожими роликами: «${requests[0].example}»`, strength: strength(requests[0].mentions * 2) });
  if (weekday && top.length >= 8) tips.push({ text: `Публикация: ${weekday.day}`, why: `${Math.round(weekday.share * 100)}% сильных похожих вышли в этот день (UTC). Сигнал слабый — проверяй на своих цифрах в Аналитике.`, strength: "слабый" });

  return {
    n: long.length, nTop: top.length, enough, duration, titleLen, features, roles, ideas, saturated, eras, weekday,
    hourUtc: hours.length ? median(hours) : null, engagement, tags, requests, tips,
  };
}

/** Текст для промптов шагов «Выбор роли», «Разведка», «Упаковка». */
export function adviceText(a: Advice) {
  if (!a.n) return "";
  return [
    `СОВЕТ ИЗ ПОХОЖИХ РОЛИКОВ (${a.n} похожих, ${a.nTop} сильных; сигналы помечены по силе — слабые не выдавай за правило):`,
    ...a.tips.map((t) => `- ${t.text} [${t.strength}] — ${t.why}`),
    a.ideas.length ? `Свободные сильные роли: ${a.ideas.map((r) => `${r.role} (сила ${r.best}, ${r.count} шт.)`).join("; ")}` : "",
    a.saturated.length ? `Перегретые роли: ${a.saturated.map((r) => `${r.role} (${r.recent} за 4 мес.)`).join("; ")}` : "",
    a.requests.length ? `Просьбы зрителей в комментариях: ${a.requests.slice(0, 6).map((r) => `${r.topic} ×${r.mentions}`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}
