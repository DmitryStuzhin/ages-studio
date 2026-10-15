import clsx from "clsx";
import { thumbUrl } from "@/lib/market";

/** Карточка ролика: обложка, название, мета. Обложка 16:9, для шортсов — вертикальная 9:16. */
export function VideoCard({
  videoId, href, title, meta, stats, badge, vertical = false, actions, muted = false,
}: {
  videoId: string | null;
  href?: string | null;
  title: string;
  meta?: React.ReactNode;
  stats?: React.ReactNode;
  badge?: React.ReactNode;
  vertical?: boolean;
  actions?: React.ReactNode;
  muted?: boolean;
}) {
  const img = videoId ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumbUrl(videoId, vertical ? "hq" : "mq")} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-xs text-fog">нет обложки</div>
  );
  return (
    <article className={clsx("group flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-ink-2 transition-colors hover:border-line-2", muted && "opacity-50")}>
      <div className={clsx("relative overflow-hidden bg-ink", vertical ? "aspect-[9/16]" : "aspect-video")}>
        {href ? <a href={href} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden>{img}</a> : img}
        {badge && <div className="absolute left-2 top-2 flex flex-wrap gap-1">{badge}</div>}
        {actions && <div className="absolute right-2 top-2 flex gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">{actions}</div>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-[0.88rem] font-medium leading-snug text-bone" title={title} style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
          {href ? <a href={href} target="_blank" rel="noreferrer" className="hover:text-lapis">{title}</a> : title}
        </h3>
        {meta && <div className="truncate text-[0.78rem] text-fog">{meta}</div>}
        {stats && <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[0.8rem] text-mist">{stats}</div>}
      </div>
    </article>
  );
}

export function OverlayChip({ children, tone = "dark" }: { children: React.ReactNode; tone?: "dark" | "ochre" | "lapis" }) {
  return (
    <span className={clsx("rounded px-1.5 py-0.5 text-[0.7rem] font-medium backdrop-blur",
      tone === "dark" && "bg-black/70 text-white", tone === "ochre" && "bg-ochre text-ink", tone === "lapis" && "bg-lapis text-white")}>
      {children}
    </span>
  );
}

/** Маленькая обложка для строк таблиц. Без ролика — пустая рамка той же формы, чтобы строки не прыгали. */
export function Thumb({ videoId, vertical = false }: { videoId: string | null; vertical?: boolean }) {
  return (
    <div className={clsx("shrink-0 overflow-hidden rounded border border-line bg-ink", vertical ? "h-16 w-9" : "h-[45px] w-20")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {videoId && <img src={thumbUrl(videoId, "mq")} alt="" loading="lazy" className="h-full w-full object-cover" />}
    </div>
  );
}
