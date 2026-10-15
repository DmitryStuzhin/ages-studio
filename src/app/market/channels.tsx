import Link from "next/link";
import { Thumb } from "@/components/video-card";
import { compact } from "@/lib/market";
import { fmtDate } from "@/components/ui";
import type { ChannelStat } from "@/lib/server/niche";

/** Каналы, которые снимают похожее: сколько похожих роликов, как часто выходят, лучший ролик. */
export function ChannelsTable({ channels }: { channels: ChannelStat[] }) {
  if (!channels.length) return <p className="text-sm text-fog">Каналов с похожими роликами пока нет — появятся после синхронизации.</p>;
  return (
    <div className="panel overflow-x-auto">
      <table className="tbl min-w-[860px]">
        <thead>
          <tr><th>Канал</th><th className="text-right">Подписчики</th><th className="text-right">Похожих</th><th className="text-right">Медиана просм.</th><th className="text-right">Выпусков в мес.</th><th>Лучший похожий ролик</th></tr>
        </thead>
        <tbody>
          {channels.map((c, i) => (
            <tr key={c.id} className="reveal" style={{ ["--i" as string]: Math.min(i, 14) }}>
              <td>
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.thumb ? <img src={c.thumb} alt="" className="h-8 w-8 shrink-0 rounded-full" loading="lazy" /> : <div className="h-8 w-8 shrink-0 rounded-full bg-ink-3" />}
                  <div className="min-w-0">
                    <a href={`https://www.youtube.com/channel/${c.id}`} target="_blank" rel="noreferrer" className="block max-w-56 truncate text-bone hover:text-lapis">{c.title}</a>
                    <div className="text-[0.75rem] text-fog">{c.videos != null ? `${compact(c.videos)} роликов` : ""}{c.lastAt ? ` · последний ${fmtDate(c.lastAt)}` : ""}</div>
                  </div>
                </div>
              </td>
              <td className="text-right tabular-nums">{compact(c.subs)}</td>
              <td className="text-right tabular-nums text-bone">{c.similar}</td>
              <td className="text-right tabular-nums">{compact(c.medianViews)}</td>
              <td className="text-right tabular-nums">{c.perMonth ? c.perMonth.toFixed(1).replace(".", ",") : "—"}</td>
              <td>
                {c.best ? (
                  <Link href={`/market/v/${c.best.id}`} className="flex items-center gap-2.5 hover:text-lapis">
                    <Thumb videoId={c.best.videoId} />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[0.84rem] text-mist">{c.best.title}</span>
                      <span className="text-[0.75rem] text-fog">{compact(c.best.views)} просм. · сила {c.best.power}</span>
                    </span>
                  </Link>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
