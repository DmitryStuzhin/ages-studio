import Link from "next/link";
import clsx from "clsx";
import { Lightbulb, ArrowRight, MessageSquareQuote, Flame, Tag } from "lucide-react";
import type { Advice, Enriched } from "@/lib/niche";
import { adviceText } from "@/lib/niche";
import { NicheScatter } from "@/components/charts";
import { SERIES } from "@/components/series";
import { compact } from "@/lib/market";
import { CopyText } from "./client";

const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const STRENGTH: Record<string, string> = {
  сильный: "bg-malachite/15 text-malachite border-malachite/30",
  средний: "bg-ochre/15 text-ochre border-ochre/30",
  слабый: "bg-ink text-fog border-line",
};

function Card({ title, aside, children, className, i = 0 }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; i?: number }) {
  return (
    <section className={clsx("reveal panel min-w-0 p-5", className)} style={{ ["--i" as string]: i }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[1.08rem] text-bone">{title}</h3>
        {aside && <div className="text-[0.78rem] text-fog">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** Две полосы на признак: доля у сильных похожих и у остальных. */
function FeatureBars({ features }: { features: Advice["features"] }) {
  const shown = features.filter((f) => f.top > 0 || f.rest > 0).slice(0, 7);
  return (
    <div>
      <div className="mb-3 flex gap-4 text-[0.78rem] text-mist">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERIES.long }} />сильные похожие</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fog/60" />остальные</span>
      </div>
      <ul className="space-y-3">
        {shown.map((f) => (
          <li key={f.key}>
            <div className="mb-1 flex justify-between gap-2 text-[0.84rem]">
              <span className="text-mist">{f.label}</span>
              <span className={clsx("tabular-nums", f.lift >= 1.4 ? "text-malachite" : f.lift <= 0.6 ? "text-cinnabar" : "text-fog")}>
                {f.lift >= 1.4 ? `в ${f.lift.toFixed(1).replace(".", ",")} раза чаще` : f.lift <= 0.6 ? "реже у сильных" : "без разницы"}
              </span>
            </div>
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-ink"><div className="bar-grow h-full rounded-full" style={{ width: `${Math.round(f.top * 100)}%`, background: SERIES.long }} /></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink"><div className="bar-grow h-full rounded-full bg-fog/60" style={{ width: `${Math.round(f.rest * 100)}%` }} /></div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdvicePanel({ advice, similar, mine, mySubs, formatChannels, comments }: {
  advice: Advice; similar: Enriched[]; mine: { title: string; durationSec: number | null; isShort: boolean; views: number | null }[];
  mySubs: number; formatChannels: number; comments: number;
}) {
  const a = advice;
  const strong = [...similar].sort((x, y) => y.power - x.power).slice(0, a.nTop);
  const points = similar.filter((e) => e.durationSec && e.outlier > 0).map((e) => ({
    x: Math.round((e.durationSec! / 60) * 10) / 10, y: e.outlier, z: e.views ?? 0, title: e.title, channel: e.channel ?? "", href: `/market/v/${e.id}`, views: e.views ?? 0,
  }));
  const minePoints = mine.filter((v) => !v.isShort && v.durationSec && v.views).map((v) => ({
    x: Math.round((v.durationSec! / 60) * 10) / 10, y: Math.max(0.001, (v.views ?? 0) / Math.max(mySubs, 1000)), z: v.views ?? 0, title: v.title, channel: "Illustrated Ages", views: v.views ?? 0,
  }));
  const copy = [
    "Вот данные о роликах, похожих на мои (канал Illustrated Ages, формат «Why You Wouldn't Survive 24 Hours as…»).",
    "Найди закономерности у сильных роликов и предложи 3 темы и 3 варианта названия для моего следующего ролика. Опирайся только на данные.",
    "",
    "СИЛЬНЫЕ ПОХОЖИЕ:",
    ...strong.map((e) => `- ${e.title} · ${e.channel} (${e.channelSubs ?? "?"} подп.) · ${e.views ?? "?"} просм. · ${e.durationSec ? mm(e.durationSec) : "?"} · ×${e.outlier.toFixed(1)} к подписчикам`),
    "",
    adviceText(a),
  ].join("\n");

  return (
    <div className="space-y-5">
      <section className="reveal panel overflow-hidden">
        <div className="border-b border-line bg-gradient-to-r from-lapis/10 via-transparent to-transparent px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-lapis/15 text-lapis"><Lightbulb size={18} /></span>
              <div>
                <h2 className="text-[1.25rem] text-bone">Совет для следующего ролика</h2>
                <p className="text-[0.82rem] text-fog">Из {a.n} похожих роликов, {a.nTop} самых сильных против остальных · каналов формата {formatChannels} · комментариев {comments}</p>
              </div>
            </div>
            <CopyText text={copy} label="Скопировать разбор для Claude" />
          </div>
        </div>
        {!a.enough && (
          <p className="border-b border-line px-5 py-3 text-sm text-ochre">Похожих роликов пока мало ({a.n}) — выводы предварительные. Нажми «Обновить данные»: синхронизация ищет по формату «24 часа как…» и забирает каналы формата целиком.</p>
        )}
        {a.tips.length === 0 ? (
          <p className="px-5 py-5 text-sm text-fog">Совет появится после синхронизации — нужны хотя бы 3–4 похожих ролика.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {a.tips.map((t, i) => (
              <li key={i} className="reveal grid gap-1 px-5 py-3.5 sm:grid-cols-[1fr_auto] sm:gap-4" style={{ ["--i" as string]: i + 1 }}>
                <div className="min-w-0">
                  <div className="text-[0.98rem] text-bone">{t.text}</div>
                  <div className="mt-0.5 text-[0.84rem] text-mist">{t.why}</div>
                </div>
                <span className={clsx("h-fit w-fit rounded-full border px-2 py-0.5 text-[0.72rem]", STRENGTH[t.strength])} title="Сколько роликов стоит за выводом">сигнал {t.strength}</span>
              </li>
            ))}
          </ul>
        )}
        {a.ideas.length > 0 && (
          <div className="border-t border-line px-5 py-4">
            <div className="mb-2 text-[0.85rem] text-mist">Свободные сильные роли — начать ролик в один клик</div>
            <div className="flex flex-wrap gap-2">
              {a.ideas.map((r) => (
                <Link key={r.role} href={`/projects?new=long&role=${encodeURIComponent(r.role)}`}
                  className="group inline-flex items-center gap-2 rounded-full border border-line-2 bg-ink-2 px-3 py-1.5 text-[0.85rem] text-bone transition-colors hover:border-lapis hover:bg-lapis/10">
                  <span className="capitalize">{r.role}</span>
                  <span className="text-[0.75rem] text-fog">сила {r.best}</span>
                  <ArrowRight size={13} className="text-fog transition-transform group-hover:translate-x-0.5 group-hover:text-lapis" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Длина и сила" aside="точка — ролик; выше — сильнее обогнал свой канал" className="lg:col-span-2" i={1}>
          {points.length ? (
            <>
              <NicheScatter similar={points} mine={minePoints} band={a.duration.lo && a.duration.hi ? [a.duration.lo / 60, a.duration.hi / 60] : undefined} />
              <p className="mt-2 text-[0.82rem] text-fog">
                Сильные похожие: медиана {mm(a.duration.top)}, остальные {mm(a.duration.rest)}{a.duration.mine != null && <>, твои {mm(a.duration.mine)}</>}. Ось «×» — просмотры, делённые на подписчиков канала: так маленький канал с удачной темой виден наравне с гигантом. Нажми на точку — откроется ролик.
              </p>
            </>
          ) : <p className="text-sm text-fog">Нет данных о длине — появятся после синхронизации.</p>}
        </Card>

        <Card title="Что в названиях у сильных" aside={`медиана ${Math.round(a.titleLen.top)} знаков против ${Math.round(a.titleLen.rest)}`} i={2}>
          <FeatureBars features={a.features} />
        </Card>

        <Card title="Роли в нише" aside="сила лучшего ролика по роли" i={3}>
          {a.roles.length === 0 ? <p className="text-sm text-fog">Роли не распознаны в названиях.</p> : (
            <ul className="space-y-2">
              {a.roles.slice(0, 10).map((r) => {
                const state = r.mine ? "у тебя было" : r.recent >= 3 ? "перегрета" : r.best >= 60 ? "свободна" : "";
                return (
                  <li key={r.role} className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-center gap-3 text-[0.85rem]">
                    <Link href={r.bestId ? `/market?show=similar&q=${encodeURIComponent(r.role)}` : "#"} className="truncate capitalize text-bone hover:text-lapis" title={r.bestTitle}>{r.role} <span className="text-fog">· {r.count}</span></Link>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink"><div className="bar-grow h-full rounded-full" style={{ width: `${r.best}%`, background: SERIES.long }} /></div>
                    <span className={clsx("w-24 text-right text-[0.75rem]", state === "свободна" ? "text-malachite" : state === "перегрета" ? "text-cinnabar" : "text-fog")}>{state || `${r.best}`}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Эпохи" aside="медианная сила похожих" i={4}>
          {a.eras.length === 0 ? <p className="text-sm text-fog">Мало данных по эпохам.</p> : (
            <ul className="space-y-2">
              {a.eras.slice(0, 8).map((e) => (
                <li key={e.era} className="grid grid-cols-[minmax(0,1fr)_120px_36px] items-center gap-3 text-[0.85rem]">
                  <span className="truncate text-mist">{e.era} <span className="text-fog">· {e.count}</span>{e.mine && <span className="ml-1.5 text-[0.72rem] text-fog">у тебя есть</span>}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink"><div className="bar-grow h-full rounded-full" style={{ width: `${e.medianPower}%`, background: e.mine ? "var(--color-fog)" : SERIES.third }} /></div>
                  <span className="text-right tabular-nums text-bone">{Math.round(e.medianPower)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Просят в комментариях" aside="под сильными похожими" i={5}>
          {a.requests.length === 0 ? (
            <p className="text-sm text-fog">Просьб пока не найдено. Комментарии собираются под 12 самыми сильными похожими роликами при каждой синхронизации.</p>
          ) : (
            <ul className="space-y-2.5">
              {a.requests.slice(0, 6).map((r) => (
                <li key={r.topic} className="flex gap-2.5 text-[0.85rem]">
                  <MessageSquareQuote size={15} className="mt-0.5 shrink-0 text-fog" />
                  <div className="min-w-0">
                    <div className="text-bone"><span className="capitalize">{r.topic}</span> <span className="text-fog">· {r.mentions} {r.mentions === 1 ? "раз" : "раза"} · {compact(r.likes)} лайков</span></div>
                    <div className="truncate text-[0.78rem] text-fog">«{r.example}»</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Вовлечённость и теги" aside="медианы" i={6}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line bg-ink/50 p-3">
              <div className="text-[0.75rem] text-fog">Лайков на 100 просмотров</div>
              <div className="mt-1 font-display text-[1.6rem] leading-none text-bone">{a.engagement.likeTop.toFixed(1).replace(".", ",")}</div>
              <div className="mt-1 text-[0.75rem] text-fog">у остальных {a.engagement.likeRest.toFixed(1).replace(".", ",")}</div>
            </div>
            <div className="rounded-lg border border-line bg-ink/50 p-3">
              <div className="text-[0.75rem] text-fog">Комментариев на 100 просмотров</div>
              <div className="mt-1 font-display text-[1.6rem] leading-none text-bone">{a.engagement.commentTop.toFixed(2).replace(".", ",")}</div>
              <div className="mt-1 text-[0.75rem] text-fog">у остальных {a.engagement.commentRest.toFixed(2).replace(".", ",")}</div>
            </div>
          </div>
          {a.tags.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-[0.8rem] text-mist"><Tag size={13} />Теги, которые повторяются у сильных</div>
              <div className="flex flex-wrap gap-1.5">{a.tags.map((t) => <span key={t.tag} className="chip text-[0.75rem]">{t.tag} <span className="text-fog">{t.count}</span></span>)}</div>
            </div>
          )}
          {a.saturated.length > 0 && (
            <p className="mt-4 flex items-start gap-2 text-[0.82rem] text-ochre"><Flame size={14} className="mt-0.5 shrink-0" />Перегрето за 4 месяца: {a.saturated.map((s) => `${s.role} (${s.recent})`).join(", ")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
