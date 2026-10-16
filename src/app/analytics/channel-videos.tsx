"use client";
import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { VideoCard, OverlayChip } from "@/components/video-card";
import { compact } from "@/lib/market";

type V = { id: string; title: string; published: string | null; duration: string | null; views: number | null; likes: number | null; comments: number | null; d1: number | null; d7: number | null; project: number | null };

const SORTS = { date: "Сначала новые", views: "Больше просмотров", week: "Растут за неделю" } as const;

/** Ролики канала карточками: вкладки «Ролики / Шортсы», сортировка, показ порциями. */
export function ChannelVideos({ longs, shorts }: { longs: V[]; shorts: V[] }) {
  const [tab, setTab] = useState<"long" | "short">("long");
  const [sort, setSort] = useState<keyof typeof SORTS>("date");
  const [limit, setLimit] = useState(12);
  const src = tab === "long" ? longs : shorts;
  const list = [...src].sort((a, b) => (sort === "views" ? (b.views ?? 0) - (a.views ?? 0) : sort === "week" ? (b.d7 ?? -1) - (a.d7 ?? -1) : 0));
  const total = src.reduce((a, v) => a + (v.views ?? 0), 0);
  const step = tab === "long" ? 12 : 18;

  return (
    <div className="panel p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-1 border-b border-line" role="tablist">
          {([["long", "Ролики", longs.length], ["short", "Шортсы", shorts.length]] as const).map(([k, label, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setLimit(k === "long" ? 12 : 18); }}
              className={clsx("-mb-px border-b-2 px-3 py-2 text-[0.95rem]", tab === k ? "border-ochre text-bone" : "border-transparent text-fog hover:text-mist")}>
              {label} <span className="text-fog">{n}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-fog">
          <span title={tab === "short" ? "Публичный счётчик YouTube: у шортсов это все запуски, включая пролистанные. Засчитанные просмотры — в графиках выше." : undefined}>{compact(total)} {tab === "short" ? "запусков" : "просмотров"}</span>
          <select className="field !w-auto !py-1.5" value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} aria-label="Сортировка">
            {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
      <div className={clsx("grid gap-4", tab === "long" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6")}>
        {list.slice(0, limit).map((v) => (
          <VideoCard
            key={v.id}
            videoId={v.id}
            href={`https://youtu.be/${v.id}`}
            title={v.title}
            vertical={tab === "short"}
            badge={v.duration ? <OverlayChip>{v.duration}</OverlayChip> : undefined}
            meta={v.published}
            stats={<>
              <span title={tab === "short" ? "Счётчик YouTube: все запуски, включая пролистанные" : undefined}><span className="text-bone">{compact(v.views)}</span> {tab === "short" ? "запусков" : "просм."}</span>
              {v.d1 != null && v.d1 > 0 && <span className="text-malachite" title="Просмотров за последние сутки">+{compact(v.d1)} за сутки</span>}
              {v.d1 == null && v.d7 != null && v.d7 > 0 && <span className="text-malachite" title="Просмотров за неделю">+{compact(v.d7)} за неделю</span>}
              {tab === "long" && <span>♥ {v.likes ?? "—"}</span>}
              {tab === "long" && <span>💬 {v.comments ?? "—"}</span>}
              {v.project && <Link href={`/projects/${v.project}`} className="text-lapis hover:underline">проект</Link>}
            </>}
          />
        ))}
      </div>
      {list.length > limit && (
        <div className="mt-4 text-center">
          <button className="btn btn-sm" onClick={() => setLimit((l) => l + step)}>Показать ещё {Math.min(step, list.length - limit)} из {list.length - limit}</button>
        </div>
      )}
    </div>
  );
}
