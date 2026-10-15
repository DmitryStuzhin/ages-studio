import Link from "next/link";
import { PageHeader, Section, Empty, fmtDate } from "@/components/ui";
import { listProjects, metricsFor, snapshots, getSettings } from "@/lib/server/repo";
import { SnapshotForm, SnapshotList } from "./client";
import { GrowthChart } from "@/components/growth-chart";
import { SyncStatus } from "@/components/sync-status";
import { GoogleBanner } from "@/components/google-banner";
import { googleAuthState } from "@/lib/server/sync";
import { getDb, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import { fmtTime } from "@/lib/pipeline/parse";
import { videoIdOf } from "@/lib/market";
import { ChannelVideos } from "./channel-videos";
import { Thumb } from "@/components/video-card";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [projects, snaps, settings] = await Promise.all([listProjects(), snapshots(), getSettings()]);
  const published = projects.filter((p) => p.status === "published");
  const rows = await Promise.all(published.map(async (p) => ({ p, m: (await metricsFor(p.id)).at(-1) ?? null })));
  const db = await getDb();
  const videos = await db.select().from(schema.channelVideos).orderBy(desc(schema.channelVideos.publishedAt));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Аналитика" lead="Снимки канала и метрики роликов. Подписчики и просмотры приходят из YouTube Data API; удержание, источники трафика и часы — из YouTube Analytics после входа в Настройках. CTR показов вносится из Studio вручную." />
      {(await googleAuthState()).kind === "none" && <GoogleBanner showNotConnected />}
      <section className="panel mb-6 p-5"><SyncStatus /></section>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Section title="Рост канала">
          {snaps.length >= 2 ? (
            <GrowthChart points={snaps.map((s) => ({ day: String(s.day), subs: s.subscribers, hours: s.watchHours12m ?? null }))} goalSubs={settings.goal.subscribers} goalHours={settings.goal.watchHours} />
          ) : (
            <Empty title="Нужно хотя бы два снимка">Вноси подписчиков и часы раз в неделю, например по пятницам, — здесь появится график с контрольными точками.</Empty>
          )}
        </Section>
        <Section title="Снимок канала">
          <SnapshotForm />
          {snaps.length > 0 && <div className="mt-5"><SnapshotList items={[...snaps].reverse().map((s) => ({ id: s.id, day: fmtDate(String(s.day)), subs: s.subscribers, hours: s.watchHours12m, shorts: s.shortsViews90d }))} /></div>}
        </Section>
      </div>

      {videos.length > 0 && (
        <section className="mb-6">
          <ChannelVideos
            longs={videos.filter((v) => !v.isShort).map((v) => ({ id: v.videoId, title: v.title, published: v.publishedAt ? fmtDate(v.publishedAt) : null, duration: v.durationSec != null ? fmtTime(v.durationSec) : null, views: v.views, likes: v.likes, comments: v.comments, project: projects.find((p) => videoIdOf(p.youtubeUrl) === v.videoId)?.id ?? null }))}
            shorts={videos.filter((v) => v.isShort).map((v) => ({ id: v.videoId, title: v.title, published: v.publishedAt ? fmtDate(v.publishedAt) : null, duration: v.durationSec != null ? fmtTime(v.durationSec) : null, views: v.views, likes: v.likes, comments: v.comments, project: null }))}
          />
        </section>
      )}

      <Section title="Проекты на канале">
        {rows.length === 0 ? <Empty title="Опубликованных роликов нет" /> : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[760px]">
              <thead><tr><th>Ролик</th><th>Снимок</th><th>CTR</th><th>Ср. просмотр</th><th>Из главной</th><th>Пригоден для выводов</th></tr></thead>
              <tbody>
                {rows.map(({ p, m }) => (
                  <tr key={p.id}>
                    <td><div className="flex items-center gap-3"><Thumb videoId={videoIdOf(p.youtubeUrl)} />
                      <div className="min-w-0"><Link className="text-bone hover:text-lapis" href={`/projects/${p.id}${p.legacy ? "" : "?step=review"}`}>{p.title}</Link>
                      <div className="text-xs text-fog">{p.kind === "short" ? "шортс" : p.format === "survive24" ? "серия «24 часа»" : "другой формат"}</div></div></div></td>
                    <td className="text-fog">{m ? `день ${m.day}` : "—"}</td>
                    <td className="tabular-nums">{m?.ctr != null ? `${m.ctr}%` : "—"}</td>
                    <td className="tabular-nums">{m?.avgViewPct != null ? `${m.avgViewPct}%` : "—"}</td>
                    <td className="tabular-nums">{m?.browseViews ?? "—"}</td>
                    <td>{m?.browseViews != null && m.browseViews >= 100 ? <span className="text-malachite">да</span> : <span className="text-fog">нет, меньше 100 из главной</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
