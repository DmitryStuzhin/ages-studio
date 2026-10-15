import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Heart, MessageCircle, Plus, Sparkles } from "lucide-react";
import { videoDetail } from "@/lib/server/niche";
import { compact, thumbUrl } from "@/lib/market";
import { extractRequests } from "@/lib/niche";
import { ViewsHistoryChart, CountUp } from "@/components/charts";
import { Thumb } from "@/components/video-card";
import { CardActions } from "../../client";

export const dynamic = "force-dynamic";

const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const pct = (a: number | null | undefined, b: number | null | undefined, d = 1) => (a != null && b ? ((a / b) * 100).toFixed(d).replace(".", ",") : "—");

function Tile({ label, children, sub, i }: { label: string; children: React.ReactNode; sub?: React.ReactNode; i: number }) {
  return (
    <div className="reveal rounded-lg border border-line bg-ink-2 p-3.5" style={{ ["--i" as string]: i }}>
      <div className="text-[0.75rem] text-fog">{label}</div>
      <div className="mt-1 font-display text-[1.55rem] leading-none text-bone">{children}</div>
      {sub && <div className="mt-1.5 text-[0.75rem] text-fog">{sub}</div>}
    </div>
  );
}

function Mini({ items, title }: { items: { id: number; videoId: string | null; title: string; views: number | null; power: number; channel: string | null }[]; title: string }) {
  if (!items.length) return null;
  return (
    <section className="panel p-5">
      <h3 className="mb-3 text-[1.05rem] text-bone">{title}</h3>
      <ul className="space-y-2.5">
        {items.map((x) => (
          <li key={x.id}>
            <Link href={`/market/v/${x.id}`} className="flex items-center gap-3 hover:text-lapis">
              <Thumb videoId={x.videoId} />
              <span className="min-w-0">
                <span className="line-clamp-2 text-[0.84rem] text-mist">{x.title}</span>
                <span className="text-[0.75rem] text-fog">{x.channel} · {compact(x.views)} просм. · сила {x.power}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await videoDetail(Number(id));
  if (!d) notFound();
  const { e, history, comments } = d;
  const ts = e.publishedTs ?? e.publishedAt;
  const published = ts ? new Date(ts) : null;
  const avgChannel = e.channelViews && e.channelVideos ? e.channelViews / e.channelVideos : null;
  const requests = extractRequests(comments);
  const tags = (e.ytTags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const hist = history.map((h) => ({ day: String(h.day), views: h.views ?? 0 }));
  const gained = hist.length >= 2 ? hist.at(-1)!.views - hist[0].views : null;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/market" className="mb-4 inline-flex items-center gap-1.5 text-sm text-fog hover:text-bone"><ArrowLeft size={15} />Ниша</Link>

      <div className="reveal grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <a href={e.url ?? "#"} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border border-line bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {e.videoId && <img src={thumbUrl(e.videoId, "hq")} alt="" className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />}
          {e.durationSec ? <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[0.75rem] text-white">{mm(e.durationSec)}</span> : null}
        </a>
        <div className="min-w-0">
          <h1 className="text-[1.6rem] leading-snug text-bone">{e.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.9rem] text-mist">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {e.channelThumb && <img src={e.channelThumb} alt="" className="h-6 w-6 rounded-full" />}
            <a href={`https://www.youtube.com/channel/${e.channelId}`} target="_blank" rel="noreferrer" className="hover:text-lapis">{e.channel}</a>
            <span className="text-fog">· {compact(e.channelSubs)} подп.</span>
          </div>
          {published && <div className="mt-1 text-[0.85rem] text-fog">Вышел {published.toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>}
          <div className="mt-4 flex flex-wrap gap-2">
            {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm"><ExternalLink size={14} />Открыть на YouTube</a>}
            {e.role && <Link href={`/projects?new=long&role=${encodeURIComponent(e.role)}`} className="btn btn-sm"><Plus size={14} />Ролик про «{e.role}»</Link>}
            <CardActions id={e.id} pinned={e.pinned} hidden={e.hidden} manual={false} inline />
          </div>
          <div className="mt-5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.85rem] text-mist"><Sparkles size={14} className="text-lapis" />Сходство с твоими роликами — {e.sim}%</div>
            <div className="h-2 overflow-hidden rounded-full bg-ink"><div className="bar-grow h-full rounded-full bg-lapis" style={{ width: `${e.sim}%` }} /></div>
            <div className="mt-2 flex flex-wrap gap-1.5">{e.reasons.map((r) => <span key={r} className="chip text-[0.75rem]">{r}</span>)}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile i={1} label="Просмотры" sub={gained != null ? `+${compact(gained)} за ${hist.length - 1} дн. наблюдения` : undefined}><CountUp value={e.views ?? 0} /></Tile>
        <Tile i={2} label="В день с выхода" sub={d.rank.vpd != null ? `быстрее ${d.rank.vpd}% похожих` : undefined}><CountUp value={e.vpd} /></Tile>
        <Tile i={3} label="К подписчикам канала" sub={avgChannel ? `×${((e.views ?? 0) / avgChannel).toFixed(1).replace(".", ",")} к среднему ролику канала` : undefined}>×{e.outlier >= 10 ? Math.round(e.outlier) : e.outlier.toFixed(1).replace(".", ",")}</Tile>
        <Tile i={4} label="Сила" sub={d.rank.power != null ? `сильнее ${d.rank.power}% из ${d.poolSize} похожих` : undefined}>{e.power}<span className="text-base text-fog">/100</span></Tile>
        <Tile i={5} label="Лайки" sub={`${pct(e.likes, e.views)} на 100 просмотров`}>{compact(e.likes)}</Tile>
        <Tile i={6} label="Комментарии" sub={`${pct(e.comments, e.views, 2)} на 100 просмотров`}>{compact(e.comments)}</Tile>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="panel p-5">
            <h3 className="mb-2 text-[1.05rem] text-bone">Рост просмотров</h3>
            {hist.length >= 2 ? <ViewsHistoryChart data={hist} /> : <p className="text-sm text-fog">История копится с каждой синхронизацией — через пару дней здесь будет график.</p>}
          </section>

          <section className="panel p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-[1.05rem] text-bone">Комментарии зрителей</h3>
              <span className="text-[0.78rem] text-fog">самые залайканные · {comments.length}</span>
            </div>
            {requests.length > 0 && (
              <div className="mb-4 rounded-lg border border-malachite/30 bg-malachite/10 p-3 text-[0.85rem]">
                <span className="text-malachite">Просят: </span><span className="text-bone">{requests.map((r) => r.topic).join(", ")}</span>
              </div>
            )}
            {comments.length === 0 ? <p className="text-sm text-fog">Комментарии собираются для 12 самых сильных похожих роликов при синхронизации.</p> : (
              <ul className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {comments.slice(0, 40).map((c) => (
                  <li key={c.id} className="border-b border-line/60 pb-3 last:border-0">
                    <div className="mb-0.5 flex items-center gap-2 text-[0.75rem] text-fog">
                      <span className="text-mist">{c.author}</span>
                      <span className="flex items-center gap-1"><Heart size={11} />{compact(c.likes)}</span>
                      {c.replies > 0 && <span className="flex items-center gap-1"><MessageCircle size={11} />{c.replies}</span>}
                    </div>
                    <p className="whitespace-pre-line text-[0.86rem] leading-relaxed text-bone">{c.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="panel p-5">
            <h3 className="mb-3 text-[1.05rem] text-bone">Канал</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[0.85rem]">
              <dt className="text-fog">Подписчики</dt><dd className="text-right tabular-nums text-bone">{compact(e.channelSubs)}</dd>
              <dt className="text-fog">Роликов</dt><dd className="text-right tabular-nums text-bone">{compact(e.channelVideos)}</dd>
              <dt className="text-fog">Всего просмотров</dt><dd className="text-right tabular-nums text-bone">{compact(e.channelViews)}</dd>
              <dt className="text-fog">В среднем на ролик</dt><dd className="text-right tabular-nums text-bone">{compact(avgChannel ? Math.round(avgChannel) : null)}</dd>
              <dt className="text-fog">Формат канала</dt><dd className="text-right text-bone">{e.formatChannel ? "снимает похожее" : "разное"}</dd>
            </dl>
          </section>

          {tags.length > 0 && (
            <section className="panel p-5">
              <h3 className="mb-3 text-[1.05rem] text-bone">Теги ролика</h3>
              <div className="flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="chip text-[0.75rem]">{t}</span>)}</div>
            </section>
          )}

          {e.description && (
            <section className="panel p-5">
              <h3 className="mb-2 text-[1.05rem] text-bone">Описание</h3>
              <details>
                <summary className="cursor-pointer list-none text-[0.85rem] text-mist"><span className="line-clamp-3 whitespace-pre-line">{e.description}</span><span className="mt-1 inline-block text-lapis">показать целиком</span></summary>
                <p className="mt-2 whitespace-pre-line text-[0.85rem] text-mist">{e.description}</p>
              </details>
            </section>
          )}

          <Mini title={e.role ? `Ещё про «${e.role}»` : "Та же роль"} items={d.sameRole} />
          <Mini title="Другие ролики этого канала" items={d.sameChannel} />
        </div>
      </div>
    </div>
  );
}
