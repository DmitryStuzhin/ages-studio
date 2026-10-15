import "server-only";
import { desc, eq, inArray, asc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { enrich, isSimilar, buildAdvice, median, type Enriched } from "@/lib/niche";

export type MarketRow = typeof schema.marketItems.$inferSelect;

async function mineAndItems() {
  const db = await getDb();
  const [items, mine] = await Promise.all([
    db.select().from(schema.marketItems).where(eq(schema.marketItems.kind, "competitor_video")).orderBy(desc(schema.marketItems.views)),
    db.select().from(schema.channelVideos),
  ]);
  return { items, mine: mine.map((v) => ({ title: v.title, durationSec: v.durationSec, isShort: v.isShort, views: v.views, publishedAt: v.publishedAt })) };
}

export async function enrichedMarket() {
  const { items, mine } = await mineAndItems();
  return { all: enrich(items, mine), mine };
}

export type ChannelStat = {
  id: string; title: string; thumb: string | null; subs: number | null; videos: number | null; views: number | null;
  similar: number; medianViews: number; bestPower: number; best: Enriched<MarketRow> | null; perMonth: number; lastAt: string | null;
};

/** Всё для вкладки «Похожие»: список, совет, каналы формата. */
export async function nicheModel() {
  const db = await getDb();
  const { all, mine } = await enrichedMarket();
  const similar = all.filter(isSimilar).sort((a, b) => b.power - a.power);
  const topIds = similar.slice(0, 40).map((e) => e.videoId).filter((x): x is string => Boolean(x));
  const comments = topIds.length ? await db.select().from(schema.marketComments).where(inArray(schema.marketComments.videoId, topIds)) : [];
  const advice = buildAdvice(similar, mine, comments);

  const chMap = new Map<string, Enriched<MarketRow>[]>();
  for (const e of all) if (e.channelId && !e.hidden && !e.isShort) chMap.set(e.channelId, [...(chMap.get(e.channelId) ?? []), e]);
  const channels: ChannelStat[] = [...chMap].map(([id, xs]) => {
    const sim = xs.filter(isSimilar);
    const best = [...sim].sort((a, b) => b.power - a.power)[0] ?? null;
    const dates = xs.map((x) => new Date(x.publishedTs ?? x.publishedAt ?? 0).getTime()).filter((t) => t > 0).sort((a, b) => a - b);
    const spanMonths = dates.length > 1 ? Math.max(1, (dates.at(-1)! - dates[0]) / (30 * 86400000)) : 1;
    return {
      id, title: xs[0].channel ?? id, thumb: xs[0].channelThumb ?? null, subs: xs[0].channelSubs, videos: xs[0].channelVideos ?? null, views: xs[0].channelViews ?? null,
      similar: sim.length, medianViews: median(sim.map((x) => x.views ?? 0)), bestPower: best?.power ?? 0, best,
      perMonth: dates.length > 1 ? (dates.length - 1) / spanMonths : 0, lastAt: dates.length ? new Date(dates.at(-1)!).toISOString() : null,
    };
  }).filter((c) => c.similar > 0).sort((a, b) => b.similar - a.similar || b.bestPower - a.bestPower);

  return { all, similar, advice, channels, mine, commentsCount: comments.length };
}

export async function videoDetail(id: number) {
  const db = await getDb();
  const { all } = await enrichedMarket();
  const e = all.find((x) => x.id === id);
  if (!e) return null;
  const [history, comments] = await Promise.all([
    e.videoId ? db.select().from(schema.videoHistory).where(eq(schema.videoHistory.videoId, e.videoId)).orderBy(asc(schema.videoHistory.day)) : [],
    e.videoId ? db.select().from(schema.marketComments).where(eq(schema.marketComments.videoId, e.videoId)).orderBy(desc(schema.marketComments.likes)) : [],
  ]);
  const sameChannel = all.filter((x) => x.channelId && x.channelId === e.channelId && x.id !== e.id && !x.hidden).sort((a, b) => b.power - a.power).slice(0, 8);
  const sameRole = e.role ? all.filter((x) => x.role === e.role && x.id !== e.id && !x.hidden).sort((a, b) => b.power - a.power).slice(0, 6) : [];
  const similarPool = all.filter(isSimilar);
  const pct = (k: "power" | "sim" | "vpd") => similarPool.length ? Math.round((similarPool.filter((x) => x[k] <= e[k]).length / similarPool.length) * 100) : null;
  return { e, history, comments, sameChannel, sameRole, rank: { power: pct("power"), vpd: pct("vpd") }, poolSize: similarPool.length };
}
