import Link from "next/link";
import clsx from "clsx";
import { PageHeader, Section, Empty, fmtDate } from "@/components/ui";
import { listProjects, metricsFor } from "@/lib/server/repo";
import { SnapshotForm, SnapshotList } from "./client";
import { SyncStatus } from "@/components/sync-status";
import { GoogleBanner } from "@/components/google-banner";
import { googleAuthState } from "@/lib/server/sync";
import { fmtTime } from "@/lib/pipeline/parse";
import { compact, videoIdOf } from "@/lib/market";
import { ChannelVideos } from "./channel-videos";
import { Thumb } from "@/components/video-card";
import { analyticsModel } from "@/lib/server/analytics";
import { hoursFmt, pct } from "@/lib/stats";
import { CountUp, Sparkline, DailyViewsChart, ForecastChart, SubsChart, WeekdayChart } from "@/components/charts";
import { BarList, AgeGender } from "@/components/bars";
import { SERIES } from "@/components/series";

export const dynamic = "force-dynamic";

function Delta({ d }: { d: number | null }) {
  if (d == null) return <span className="text-fog">нет базы для сравнения</span>;
  const up = d >= 0;
  return <span className={up ? "text-malachite" : "text-cinnabar"}>{up ? "▲" : "▼"} {pct(Math.abs(d))} к прошлым 28 дням</span>;
}

function Kpi({ i, label, children, foot, spark, color }: { i: number; label: string; children: React.ReactNode; foot?: React.ReactNode; spark?: number[]; color?: string }) {
  return (
    <div className="reveal panel flex min-w-0 flex-col p-4" style={{ ["--i" as string]: i }}>
      <div className="text-[0.8rem] text-fog">{label}</div>
      <div className="mt-1 text-[1.9rem] font-semibold leading-tight text-bone">{children}</div>
      {foot && <div className="mt-1 text-[0.78rem]">{foot}</div>}
      {spark && spark.length > 1 && <div className="mt-auto pt-2"><Sparkline data={spark} color={color} /></div>}
    </div>
  );
}

function ForecastCard({ i, title, unit, f, fmt }: { i: number; title: string; unit: string; f: NonNullable<Awaited<ReturnType<typeof analyticsModel>>["hoursForecast"]>; fmt: (v: number) => string }) {
  return (
    <section className="reveal panel p-5" style={{ ["--i" as string]: i }}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[1.2rem]">{title}</h2>
        <span className={clsx("chip", f.onTrack ? "border-malachite/60 text-malachite" : "border-ochre/60 text-ochre")}>{f.onTrack ? "успеваем" : "не успеваем"}</span>
      </div>
      <p className="mb-3 text-[0.88rem] text-mist">
        Сейчас <b className="text-bone">{fmt(f.now)}</b> из {fmt(f.goal)}. Темп за 28 дней — <b className="text-bone">{fmt(f.pacePerDay)}</b> {unit}/день:{" "}
        {f.eta ? <>цель будет <b className="text-bone">{fmtDate(f.eta)}</b>.</> : <>при таком темпе цель недостижима.</>}{" "}
        Чтобы успеть к {fmtDate(f.deadline)}, нужно <b className={f.onTrack ? "text-bone" : "text-ochre"}>{fmt(f.neededPerDay)}</b> {unit}/день.
      </p>
      <ForecastChart data={f.series} goal={f.goal} deadline={f.deadline} unit={` ${unit}`} />
      <p className="mt-2 text-[0.75rem] text-fog">Прогноз — прямая по среднему за последние 28 дней. Для молодого канала окно в 12 месяцев почти не теряет старые часы, поэтому прямая честная.</p>
    </section>
  );
}

export default async function AnalyticsPage() {
  const [m, projects, auth] = await Promise.all([analyticsModel(), listProjects(), googleAuthState()]);
  const published = projects.filter((p) => p.status === "published");
  const rows = await Promise.all(published.map(async (p) => ({ p, m: (await metricsFor(p.id)).at(-1) ?? null })));
  const last90 = m.points.slice(-90);
  const last28 = m.points.slice(-28);
  const subsDelta = m.subs28.gained.cur - m.subs28.lost.cur;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Аналитика" lead="Всё, что отдают YouTube Data API и YouTube Analytics API: динамика по дням, прогноз выхода на порог монетизации, откуда приходят зрители и какие ролики держат. CTR показов API не отдаёт — его вносишь из Studio в разборе ролика." />
      {auth.kind === "none" && <GoogleBanner showNotConnected />}
      <section className="panel mb-6 p-5"><SyncStatus /></section>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi i={0} label="Подписчики" foot={m.hasReports ? <span className={subsDelta >= 0 ? "text-malachite" : "text-cinnabar"}>{subsDelta >= 0 ? "+" : ""}{subsDelta} за 28 дней</span> : undefined}
          spark={last28.map((p) => p.subsGained - p.subsLost)} color={SERIES.long}>
          <CountUp value={m.subsNow} /><span className="text-base font-normal text-fog"> / {m.settings.goal.subscribers}</span>
        </Kpi>
        <Kpi i={1} label="Часы лонгов за 12 мес." foot={<span className="text-fog">{pct(m.hoursNow / m.settings.goal.watchHours, 1)} пути до {m.settings.goal.watchHours}</span>}
          spark={last28.map((p) => p.longHours)} color={SERIES.long}>
          <CountUp value={m.hoursNow} decimals={m.hoursNow < 100 ? 1 : 0} />
        </Kpi>
        <Kpi i={2} label="Просмотры лонгов, 28 дн." foot={<Delta d={m.views28.long.delta} />} spark={last28.map((p) => p.longViews)} color={SERIES.long}>
          <CountUp value={m.views28.long.cur} />
        </Kpi>
        <Kpi i={3} label="Просмотры шортсов, 28 дн." foot={<Delta d={m.views28.short.delta} />} spark={last28.map((p) => p.shortViews)} color={SERIES.short}>
          <CountUp value={m.views28.short.cur} />
        </Kpi>
        <Kpi i={4} label="Средний % досмотра лонгов" foot={<span className="text-fog">за 90 дней, взвешено по просмотрам</span>}>
          {m.avgViewPctLong != null ? <CountUp value={m.avgViewPctLong} decimals={1} suffix="%" /> : "—"}
        </Kpi>
      </div>

      {!m.hasReports ? (
        <div className="mb-6"><Empty title="Отчётов YouTube Analytics пока нет">{auth.kind === "none" ? "Войди через Google в Настройках — графики, прогноз и разбивки появятся после первого обновления." : "Нажми «Обновить данные» — отчёты подтянутся за несколько секунд."}</Empty></div>
      ) : (
        <>
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            {m.hoursForecast && <ForecastCard i={5} title="Часы просмотра → 4000" unit="ч" f={m.hoursForecast} fmt={hoursFmt} />}
            {m.subsForecast && <ForecastCard i={6} title="Подписчики → 1000" unit="подп." f={m.subsForecast} fmt={(v) => (Math.abs(v) < 10 ? v.toFixed(1).replace(".", ",") : Math.round(v).toLocaleString("ru"))} />}
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <section className="reveal panel p-5" style={{ ["--i" as string]: 7 }}>
              <h2 className="mb-1 text-[1.2rem]">Просмотры по дням</h2>
              <p className="mb-2 text-[0.82rem] text-fog">90 дней · всего {compact(last90.reduce((a, p) => a + p.longViews + p.shortViews, 0))}, из них шортсы {pct(last90.reduce((a, p) => a + p.shortViews, 0) / Math.max(1, last90.reduce((a, p) => a + p.longViews + p.shortViews, 0)))}</p>
              <DailyViewsChart data={last90} />
            </section>
            <section className="reveal panel p-5" style={{ ["--i" as string]: 8 }}>
              <h2 className="mb-1 text-[1.2rem]">Подписки по дням</h2>
              <p className="mb-2 text-[0.82rem] text-fog">90 дней · +{last90.reduce((a, p) => a + p.subsGained, 0)} / −{last90.reduce((a, p) => a + p.subsLost, 0)}</p>
              <SubsChart data={last90} />
            </section>
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Section title="Откуда приходят" className="reveal" aside={<span className="text-xs text-fog">90 дней</span>}>
              {m.traffic.length ? <BarList items={m.traffic} valueFmt={(v) => compact(v)} /> : <p className="text-sm text-fog">Нет данных.</p>}
              <p className="mt-3 text-[0.78rem] text-fog">Главная + рекомендации — это то, что YouTube продвигает сам. Только по ним делаются выводы об удержании.</p>
            </Section>
            <Section title="Где смотрят" className="reveal" aside={<span className="text-xs text-fog">90 дней</span>}>
              {m.playback.length ? <BarList items={m.playback} color={SERIES.third} valueFmt={(v) => compact(v)} /> : <p className="text-sm text-fog">Нет данных.</p>}
            </Section>
            <Section title="Страны" className="reveal" aside={<span className="text-xs text-fog">топ по просмотрам</span>}>
              {m.countries.length ? <BarList items={m.countries} color={SERIES.sixth} valueFmt={(v) => compact(v)} /> : <p className="text-sm text-fog">Нет данных.</p>}
            </Section>
            <Section title="Возраст и пол" className="reveal" aside={<span className="text-xs text-fog">доля зрителей</span>}>
              {m.ages.length ? <AgeGender rows={m.ages} /> : <p className="text-sm text-fog">YouTube показывает демографию, когда зрителей достаточно для анонимности.</p>}
            </Section>
            <Section title="Устройства" className="reveal">
              {m.devices.length ? <BarList items={m.devices} color={SERIES.fourth} valueFmt={(v) => compact(v)} /> : <p className="text-sm text-fog">Нет данных.</p>}
              {m.subscribed.SUBSCRIBED && m.subscribed.UNSUBSCRIBED && (
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-center">
                  <div><div className="text-[1.4rem] font-semibold tabular-nums">{pct(m.subscribed.UNSUBSCRIBED.views / Math.max(1, m.subscribed.UNSUBSCRIBED.views + m.subscribed.SUBSCRIBED.views))}</div><div className="text-[0.78rem] text-fog">просмотров от неподписанных</div></div>
                  <div><div className="text-[1.4rem] font-semibold tabular-nums">{fmtTime(m.subscribed.SUBSCRIBED.avg)}</div><div className="text-[0.78rem] text-fog">смотрят подписчики в среднем</div></div>
                </div>
              )}
            </Section>
            <Section title="Лучший день недели" className="reveal" aside={<span className="text-xs text-fog">средние просмотры, 90 дней</span>}>
              <div className="text-[0.8rem] text-mist">Длинные ролики</div>
              <WeekdayChart data={m.weekday} k="long" color={SERIES.long} name="Лонги" />
              <div className="mt-2 text-[0.8rem] text-mist">Шортсы</div>
              <WeekdayChart data={m.weekday} k="short" color={SERIES.short} name="Шортсы" />
            </Section>
          </div>

          {m.topVideos.length > 0 && (
            <Section title="Что держит зрителя" className="reveal mb-6" aside={<span className="text-xs text-fog">топ по времени просмотра, 90 дней</span>}>
              <div className="overflow-x-auto">
                <table className="tbl min-w-[820px]">
                  <thead><tr><th>Ролик</th><th>Часы</th><th>Просмотры</th><th>Досмотр</th><th>Ср. время</th><th>Подписки</th><th>Лайки</th><th>Репосты</th></tr></thead>
                  <tbody>
                    {m.topVideos.slice(0, 15).map((v) => (
                      <tr key={v.id}>
                        <td><a href={`https://youtu.be/${v.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-lapis"><Thumb videoId={v.id} /><span className="line-clamp-2 text-bone">{v.title}</span>{v.isShort && <span className="chip shrink-0">шортс</span>}</a></td>
                        <td className="tabular-nums text-bone">{hoursFmt(v.hours)}</td>
                        <td className="tabular-nums">{compact(v.views)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink"><div className="bar-grow h-full rounded-full" style={{ width: `${Math.min(100, v.avgPct)}%`, background: v.isShort ? SERIES.short : SERIES.long }} /></div>
                            <span className="tabular-nums">{v.avgPct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="tabular-nums text-mist">{fmtTime(v.avgSec)}</td>
                        <td className="tabular-nums">{v.subs ? `+${v.subs}` : "—"}</td>
                        <td className="tabular-nums text-mist">{v.likes || "—"}</td>
                        <td className="tabular-nums text-mist">{v.shares || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}

      {m.videos.length > 0 && (
        <section className="mb-6">
          <ChannelVideos
            longs={m.videos.filter((v) => !v.isShort).map((v) => ({ id: v.videoId, title: v.title, published: v.publishedAt ? fmtDate(v.publishedAt) : null, duration: v.durationSec != null ? fmtTime(v.durationSec) : null, views: v.views, likes: v.likes, comments: v.comments, d1: m.deltaFor(v.videoId, 1), d7: m.deltaFor(v.videoId, 7), project: projects.find((p) => videoIdOf(p.youtubeUrl) === v.videoId)?.id ?? null }))}
            shorts={m.videos.filter((v) => v.isShort).map((v) => ({ id: v.videoId, title: v.title, published: v.publishedAt ? fmtDate(v.publishedAt) : null, duration: v.durationSec != null ? fmtTime(v.durationSec) : null, views: v.views, likes: v.likes, comments: v.comments, d1: m.deltaFor(v.videoId, 1), d7: m.deltaFor(v.videoId, 7), project: null }))}
          />
        </section>
      )}

      <Section title="Проекты на канале" className="mb-6">
        {rows.length === 0 ? <Empty title="Опубликованных роликов нет" /> : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[760px]">
              <thead><tr><th>Ролик</th><th>Снимок</th><th>CTR</th><th>Ср. просмотр</th><th>Из главной</th><th>Пригоден для выводов</th></tr></thead>
              <tbody>
                {rows.map(({ p, m: mm }) => (
                  <tr key={p.id}>
                    <td><div className="flex items-center gap-3"><Thumb videoId={videoIdOf(p.youtubeUrl)} />
                      <div className="min-w-0"><Link className="text-bone hover:text-lapis" href={`/projects/${p.id}${p.legacy ? "" : "?step=review"}`}>{p.title}</Link>
                      <div className="text-xs text-fog">{p.kind === "short" ? "шортс" : p.format === "survive24" ? "серия «24 часа»" : "другой формат"}</div></div></div></td>
                    <td className="text-fog">{mm ? `день ${mm.day}` : "—"}</td>
                    <td className="tabular-nums">{mm?.ctr != null ? `${mm.ctr}%` : "—"}</td>
                    <td className="tabular-nums">{mm?.avgViewPct != null ? `${mm.avgViewPct}%` : "—"}</td>
                    <td className="tabular-nums">{mm?.browseViews ?? "—"}</td>
                    <td>{mm?.browseViews != null && mm.browseViews >= 100 ? <span className="text-malachite">да</span> : <span className="text-fog">нет, меньше 100 из главной</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <details className="panel p-5">
        <summary className="cursor-pointer text-mist hover:text-bone">Ручной снимок канала — если API недоступен</summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <SnapshotForm />
          {m.snaps.length > 0 && <SnapshotList items={[...m.snaps].reverse().slice(0, 12).map((s) => ({ id: s.id, day: fmtDate(String(s.day)), subs: s.subscribers, hours: s.watchHours12m, shorts: s.shortsViews90d }))} />}
        </div>
      </details>
    </div>
  );
}
