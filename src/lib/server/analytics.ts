import "server-only";
import { desc, gte } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSettings, snapshots } from "./repo";
import { reports } from "./sync";
import {
  dailySeries, forecast, windowDelta, weekdayProfile, sum,
  TRAFFIC_LABELS, DEVICE_LABELS, PLAYBACK_LABELS, AGE_LABELS, countryName, humanCode, type Row,
} from "@/lib/stats";

const n = (v: unknown) => Number(v ?? 0) || 0;
/** Засчитываемые просмотры: engagedViews, если YouTube их отдал, иначе views. */
const ev = (r: Row) => (r.engagedViews != null ? n(r.engagedViews) : n(r.views));

/** Всё для Аналитики и Пульта одним вызовом. */
export async function analyticsModel() {
  const [settings, snaps, reps] = await Promise.all([getSettings(), snapshots(), reports()]);
  const db = await getDb();
  const videos = await db.select().from(schema.channelVideos).orderBy(desc(schema.channelVideos.publishedAt));
  const shortIds = new Set(videos.filter((v) => v.isShort).map((v) => v.videoId));

  const points = dailySeries(reps.daily?.data as Row[] | undefined);
  const last = snaps.at(-1);
  const subsNow = last?.subscribers ?? 0;
  const hoursNow = last?.watchHours12m ?? (points.length ? sum(points, "longHours") : 0);

  const hoursForecast = points.length
    ? forecast({ points, pick: (p) => p.longHours, now: hoursNow, goal: settings.goal.watchHours, deadline: settings.goal.deadline })
    : null;
  const subsForecast = points.length
    ? forecast({ points, pick: (p) => p.subsGained - p.subsLost, now: subsNow, goal: settings.goal.subscribers, deadline: settings.goal.deadline })
    : null;

  const views28 = { long: windowDelta(points, "longViews"), short: windowDelta(points, "shortViews") };
  const subs28 = { gained: windowDelta(points, "subsGained"), lost: windowDelta(points, "subsLost") };
  const shorts90 = sum(points.slice(-90), "shortViews");
  const shortStarts28 = sum(points.slice(-28), "shortStarts");
  const hasEngaged = ((reps.daily?.data ?? []) as Row[]).some((r) => r.engagedViews != null);

  const traffic = ((reps.traffic?.data ?? []) as Row[]).map((r) => ({
    key: String(r.insightTrafficSourceType), label: TRAFFIC_LABELS[String(r.insightTrafficSourceType)] ?? humanCode(String(r.insightTrafficSourceType)),
    value: ev(r), hours: n(r.estimatedMinutesWatched) / 60,
  })).filter((r) => r.value > 0);

  const playback = ((reps.playback?.data ?? []) as Row[]).map((r) => ({
    key: String(r.insightPlaybackLocationType), label: PLAYBACK_LABELS[String(r.insightPlaybackLocationType)] ?? humanCode(String(r.insightPlaybackLocationType)), value: ev(r),
  })).filter((r) => r.value > 0);

  const devices = ((reps.device?.data ?? []) as Row[]).map((r) => ({
    key: String(r.deviceType), label: DEVICE_LABELS[String(r.deviceType)] ?? humanCode(String(r.deviceType)), value: ev(r),
  })).filter((r) => r.value > 0);

  const countries = ((reps.country?.data ?? []) as Row[]).map((r) => ({
    key: String(r.country), label: countryName(String(r.country)), value: ev(r),
    sub: `${(n(r.estimatedMinutesWatched) / 60).toFixed(1).replace(".", ",")} ч · ${Math.round(n(r.averageViewDuration))} с в среднем`,
  }));

  const ageMap = new Map<string, { age: string; male: number; female: number; other: number }>();
  for (const r of (reps.demographics?.data ?? []) as Row[]) {
    const age = AGE_LABELS[String(r.ageGroup)] ?? String(r.ageGroup);
    const a = ageMap.get(age) ?? { age, male: 0, female: 0, other: 0 };
    const g = String(r.gender).toLowerCase();
    if (g === "male") a.male += n(r.viewerPercentage);
    else if (g === "female") a.female += n(r.viewerPercentage);
    else a.other += n(r.viewerPercentage);
    ageMap.set(age, a);
  }
  const ages = [...ageMap.values()].sort((a, b) => a.age.localeCompare(b.age));

  const subscribed = Object.fromEntries(((reps.subscribed?.data ?? []) as Row[]).map((r) => [String(r.subscribedStatus), { views: ev(r), hours: n(r.estimatedMinutesWatched) / 60, avg: n(r.averageViewDuration) }]));

  const titles = new Map(videos.map((v) => [v.videoId, v]));
  const topVideos = ((reps.topVideos?.data ?? []) as Row[]).map((r) => {
    const id = String(r.video);
    const v = titles.get(id);
    return {
      id, title: v?.title ?? id, isShort: shortIds.has(id), views: ev(r), starts: n(r.views), hours: n(r.estimatedMinutesWatched) / 60,
      avgPct: n(r.averageViewPercentage), avgSec: n(r.averageViewDuration), subs: n(r.subscribersGained), likes: n(r.likes), shares: n(r.shares),
    };
  });
  const longTop = topVideos.filter((v) => !v.isShort);
  const avgViewPctLong = longTop.length ? longTop.reduce((a, v) => a + v.avgPct * v.views, 0) / Math.max(1, longTop.reduce((a, v) => a + v.views, 0)) : null;

  // Просмотры роликов за сутки и неделю — из истории снимков Data API.
  const since = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10);
  const hist = await db.select().from(schema.videoHistory).where(gte(schema.videoHistory.day, since));
  const byVideo = new Map<string, { day: string; views: number }[]>();
  for (const h of hist) {
    const list = byVideo.get(h.videoId) ?? [];
    list.push({ day: String(h.day), views: h.views ?? 0 });
    byVideo.set(h.videoId, list);
  }
  const deltaFor = (id: string, days: number) => {
    const list = (byVideo.get(id) ?? []).sort((a, b) => a.day.localeCompare(b.day));
    if (list.length < 2) return null;
    const lastP = list.at(-1)!;
    const target = new Date(new Date(lastP.day).getTime() - days * 86400000).toISOString().slice(0, 10);
    const base = [...list].reverse().find((p) => p.day <= target) ?? list[0];
    if (base.day === lastP.day) return null;
    return lastP.views - base.views;
  };

  return {
    settings, snaps, points, hasReports: points.length > 0, fetchedAt: reps.daily?.fetchedAt ?? null,
    subsNow, hoursNow, hoursForecast, subsForecast, views28, subs28, shorts90, shortStarts28, hasEngaged,
    traffic, playback, devices, countries, ages, subscribed, topVideos, avgViewPctLong,
    weekday: weekdayProfile(points),
    videos, deltaFor,
  };
}
