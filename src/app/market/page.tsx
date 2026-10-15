import Link from "next/link";
import { PageHeader, Section, Empty, fmtDate } from "@/components/ui";
import { marketItems, snapshots } from "@/lib/server/repo";
import { MarketForm, CardActions, ListToolbar, Pager } from "./client";
import { SyncStatus } from "@/components/sync-status";
import { VideoCard, OverlayChip } from "@/components/video-card";
import { compact, isHistoryRelevant } from "@/lib/market";
import { nicheModel } from "@/lib/server/niche";
import { isSimilar } from "@/lib/niche";
import { AdvicePanel } from "./advice";
import { ChannelsTable } from "./channels";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { competitor_video: "ролик конкурента", query: "поисковый запрос", comment_theme: "тема комментариев", note: "заметка" };
const PER_PAGE = 24;

type SP = { q?: string; src?: string; sort?: string; show?: string; page?: string };

export default async function MarketPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [raw, nm, snaps] = await Promise.all([marketItems(), nicheModel(), snapshots()]);
  const show = sp.show ?? "similar";
  const sort = sp.sort ?? "power";
  const all = nm.all;
  const notes = raw.filter((m) => m.kind !== "competitor_video");
  const counts = {
    similar: nm.similar.length,
    channels: nm.channels.length,
    relevant: all.filter((m) => !m.hidden && isHistoryRelevant(m)).length,
    pinned: all.filter((m) => m.pinned && !m.hidden).length,
    other: all.filter((m) => !m.hidden && !isHistoryRelevant(m)).length,
    hidden: all.filter((m) => m.hidden).length,
  };
  const sources = [...new Set(all.map((m) => m.tags).filter(Boolean))].sort();

  let list = all.filter((m) => {
    if (show === "hidden") return m.hidden;
    if (m.hidden) return false;
    if (show === "similar") return isSimilar(m);
    if (show === "pinned") return m.pinned;
    if (show === "other") return !isHistoryRelevant(m);
    if (show === "relevant") return isHistoryRelevant(m);
    return true;
  });
  if (sp.src) list = list.filter((m) => m.tags === sp.src);
  if (sp.q) {
    const q = sp.q.toLowerCase();
    list = list.filter((m) => `${m.title} ${m.channel ?? ""} ${m.role ?? ""}`.toLowerCase().includes(q));
  }
  list.sort((a, b) =>
    sort === "date" ? String(b.publishedTs ?? b.publishedAt ?? "").localeCompare(String(a.publishedTs ?? a.publishedAt ?? ""))
      : sort === "views" ? (b.views ?? 0) - (a.views ?? 0)
        : sort === "outlier" ? b.outlier - a.outlier
          : sort === "speed" ? b.vpd - a.vpd
            : sort === "sim" ? b.sim - a.sim || b.power - a.power
              : b.power - a.power);
  list.sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const speeds = list.map((m) => m.vpd).filter((x) => x > 0).sort((a, b) => a - b);
  const median = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 0;
  const hot = (v: number) => median > 0 && v >= median * 3;

  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const shown = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const mySubs = snaps.at(-1)?.subscribers ?? 0;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Ниша"
        lead="Ролики, похожие на твои: тот же формат, история, длина, анимация. Из сильных собирается совет — он же уходит в шаги «Выбор роли», «Разведка» и «Упаковка»."
      />
      <section className="panel mb-6 p-5"><SyncStatus /></section>

      {show === "similar" && !sp.q && !sp.src && page === 1 && (
        <div className="mb-8">
          <AdvicePanel advice={nm.advice} similar={nm.similar} mine={nm.mine} mySubs={mySubs} formatChannels={nm.channels.filter((c) => c.similar >= 2).length} comments={nm.commentsCount} />
        </div>
      )}

      <section className="mb-6">
        <ListToolbar
          tabs={[
            { key: "similar", label: "Похожие на мои", count: counts.similar },
            { key: "channels", label: "Каналы формата", count: counts.channels },
            { key: "relevant", label: "Вся история", count: counts.relevant },
            { key: "pinned", label: "Закреплённые", count: counts.pinned },
            { key: "other", label: "Не по теме", count: counts.other },
            { key: "hidden", label: "Скрытые", count: counts.hidden },
          ]}
          sources={sources as string[]}
          sorts={[{ key: "power", label: "Сильнее всего" }, { key: "sim", label: "Похожее всего" }, { key: "outlier", label: "Обогнали канал" }, { key: "speed", label: "Просмотры в день" }, { key: "views", label: "Всего просмотров" }, { key: "date", label: "Сначала новые" }]}
          total={list.length}
        />
        {show === "channels" ? (
          <div className="mt-4"><ChannelsTable channels={nm.channels} /></div>
        ) : shown.length === 0 ? (
          <div className="mt-4"><Empty title="Ничего не найдено">{sp.q || sp.src ? "Сбрось поиск или фильтр по запросу." : show === "similar" ? "Похожих пока нет. Нажми «Обновить данные» — синхронизация ищет ролики твоего формата и каналы, которые его снимают." : show === "pinned" ? "Закрепляй сильные ролики — они всегда попадают в промпты и считаются похожими." : "Нажми «Обновить данные»."}</Empty></div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((m, i) => (
              <div key={m.id} className="reveal flex" style={{ ["--i" as string]: Math.min(i, 12) }}>
                <VideoCard
                  videoId={m.videoId}
                  href={`/market/v/${m.id}`}
                  internal
                  title={m.title}
                  muted={m.hidden}
                  badge={<>
                    {m.pinned && <OverlayChip tone="ochre">закреплён</OverlayChip>}
                    <OverlayChip tone={m.sim >= 75 ? "lapis" : "dark"}>сходство {m.sim}%</OverlayChip>
                    {hot(m.vpd) && <OverlayChip tone="ochre">взлёт</OverlayChip>}
                    {m.outlier >= 3 && <OverlayChip>×{m.outlier >= 10 ? Math.round(m.outlier) : m.outlier.toFixed(1).replace(".", ",")}</OverlayChip>}
                  </>}
                  actions={<CardActions id={m.id} pinned={m.pinned} hidden={m.hidden} manual={false} />}
                  meta={<>{m.channel ?? "—"}{m.channelSubs != null ? ` · ${compact(m.channelSubs)} подп.` : ""}{m.publishedAt ? ` · ${fmtDate(String(m.publishedAt))}` : ""}</>}
                  stats={<>
                    <span title="Всего просмотров"><span className="text-bone">{compact(m.views)}</span> просм.</span>
                    {m.vpd > 0 && <span title="Средние просмотры в день с момента выхода">{compact(m.vpd)}/день</span>}
                    {m.durationSec ? <span>{Math.floor(m.durationSec / 60)}:{String(m.durationSec % 60).padStart(2, "0")}</span> : null}
                    <span className="ml-auto flex items-center gap-1.5" title="Сила: насколько ролик обогнал свой канал и как быстро набирает">
                      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-ink"><span className="block h-full rounded-full bg-lapis" style={{ width: `${m.power}%` }} /></span>
                      <span className="tabular-nums text-fog">{m.power}</span>
                    </span>
                  </>}
                  footer={m.reasons.length > 0 && <div className="mt-1.5 line-clamp-2 border-t border-line/60 pt-1.5 text-[0.72rem] text-fog">{m.reasons.slice(0, 3).join(" · ")}</div>}
                />
              </div>
            ))}
          </div>
        )}
        {show !== "channels" && <Pager page={page} pages={pages} />}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Section title="Добавить вручную"><MarketForm /></Section>
        <Section title={`Запросы и заметки · ${notes.length}`}>
          {notes.length === 0 ? <p className="text-sm text-fog">Поисковые запросы, темы комментариев и заметки о нише, добавленные вручную.</p> : (
            <ul className="divide-y divide-line/70">
              {notes.map((m) => (
                <li key={m.id} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.9rem] text-bone">{m.title}</div>
                    <div className="text-xs text-fog">{KIND[m.kind]}{m.angle && ` · ${m.angle}`}</div>
                  </div>
                  <CardActions id={m.id} pinned={m.pinned} hidden={m.hidden} manual inline />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
