import Link from "next/link";
import { PageHeader, Section, Empty, fmtDate } from "@/components/ui";
import { marketItems } from "@/lib/server/repo";
import { MarketForm, CardActions, ListToolbar, Pager } from "./client";
import { SyncStatus } from "@/components/sync-status";
import { VideoCard, OverlayChip } from "@/components/video-card";
import { compact, isHistoryRelevant, videoIdOf, viewsPerDay } from "@/lib/market";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { competitor_video: "ролик конкурента", query: "поисковый запрос", comment_theme: "тема комментариев", note: "заметка" };
const PER_PAGE = 24;

type SP = { q?: string; src?: string; sort?: string; show?: string; page?: string };

export default async function MarketPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const all = await marketItems();
  const show = sp.show ?? "relevant";
  const sort = sp.sort ?? "speed";

  const videos = all.filter((m) => m.kind === "competitor_video");
  const notes = all.filter((m) => m.kind !== "competitor_video");
  const counts = {
    relevant: videos.filter((m) => !m.hidden && isHistoryRelevant(m)).length,
    pinned: videos.filter((m) => m.pinned && !m.hidden).length,
    other: videos.filter((m) => !m.hidden && !isHistoryRelevant(m)).length,
    hidden: videos.filter((m) => m.hidden).length,
  };
  const sources = [...new Set(videos.map((m) => m.tags).filter(Boolean))].sort();

  let list = videos.filter((m) => {
    if (show === "hidden") return m.hidden;
    if (m.hidden) return false;
    if (show === "pinned") return m.pinned;
    if (show === "other") return !isHistoryRelevant(m);
    if (show === "relevant") return isHistoryRelevant(m);
    return true;
  });
  if (sp.src) list = list.filter((m) => m.tags === sp.src);
  if (sp.q) {
    const q = sp.q.toLowerCase();
    list = list.filter((m) => `${m.title} ${m.channel ?? ""} ${m.angle}`.toLowerCase().includes(q));
  }
  const speed = (m: (typeof list)[number]) => viewsPerDay(m.views, m.publishedAt ? String(m.publishedAt) : null) ?? 0;
  list.sort((a, b) =>
    sort === "date" ? String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? ""))
      : sort === "views" ? (b.views ?? 0) - (a.views ?? 0)
        : speed(b) - speed(a));
  list.sort((a, b) => Number(b.pinned) - Number(a.pinned));

  // «Взлёт» — ролик набирает в день втрое больше медианы по сводке: сигнал, что тема сейчас растёт.
  const speeds = list.map(speed).filter((x) => x > 0).sort((a, b) => a - b);
  const median = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 0;
  const hot = (v: number) => median > 0 && v >= median * 3;

  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const shown = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Ниша"
        lead="Ролики конкурентов, которые видят шаги «Выбор роли», «Разведка» и «Упаковка». В промпты уходят только закреплённые и исторические ролики — скрытые и прочие туда не попадают."
      />
      <section className="panel mb-6 p-5"><SyncStatus /></section>

      <section className="mb-6">
        <ListToolbar
          tabs={[
            { key: "relevant", label: "История", count: counts.relevant },
            { key: "pinned", label: "Закреплённые", count: counts.pinned },
            { key: "other", label: "Не по теме", count: counts.other },
            { key: "hidden", label: "Скрытые", count: counts.hidden },
          ]}
          sources={sources as string[]}
          sorts={[{ key: "speed", label: "Просмотры в день" }, { key: "views", label: "Всего просмотров" }, { key: "date", label: "Сначала новые" }]}
          total={list.length}
        />
        {shown.length === 0 ? (
          <div className="mt-4"><Empty title="Ничего не найдено">{sp.q || sp.src ? "Сбрось поиск или фильтр по запросу." : show === "pinned" ? "Закрепляй сильные ролики конкурентов — они всегда попадают в промпты первыми." : "Нажми «Обновить данные» — ролики подтянутся по поисковым запросам из Настроек."}</Empty></div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((m) => {
              const vid = videoIdOf(m.url);
              const vpd = speed(m);
              return (
                <VideoCard
                  key={m.id}
                  videoId={vid}
                  href={m.url}
                  title={m.title}
                  muted={m.hidden}
                  badge={<>
                    {m.pinned && <OverlayChip tone="ochre">закреплён</OverlayChip>}
                    {hot(vpd) && <OverlayChip tone="lapis">взлёт</OverlayChip>}
                  </>}
                  actions={<CardActions id={m.id} pinned={m.pinned} hidden={m.hidden} manual={m.source !== "api"} />}
                  meta={<>{m.channel ?? "—"}{m.publishedAt ? ` · ${fmtDate(String(m.publishedAt))}` : ""}</>}
                  stats={<>
                    <span title="Всего просмотров"><span className="text-bone">{compact(m.views)}</span> просм.</span>
                    {vpd > 0 && <span title="Средние просмотры в день с момента выхода">{compact(vpd)}/день</span>}
                    {m.tags && <Link href={`?${new URLSearchParams({ ...sp, src: m.tags, page: "1" } as Record<string, string>)}`} className="truncate text-fog hover:text-mist" title="Показать только этот запрос">«{m.tags}»</Link>}
                  </>}
                />
              );
            })}
          </div>
        )}
        <Pager page={page} pages={pages} />
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
