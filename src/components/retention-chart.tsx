import { fmtTime } from "@/lib/pipeline/parse";

/** Кривая удержания: доля зрителей по времени. Первая минута подсвечена — там теряется почти всё. */
export function RetentionChart({ points, height = 180 }: { points: { t: number; pct: number }[]; height?: number }) {
  const w = 360, h = height, pad = { l: 34, r: 10, t: 12, b: 24 };
  const maxT = Math.max(60, ...points.map((p) => p.t));
  const x = (t: number) => pad.l + (t / maxT) * (w - pad.l - pad.r);
  const y = (p: number) => pad.t + (1 - p / 100) * (h - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  return (
    <figure className="rounded-lg border border-line bg-ink p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Кривая удержания">
        <rect x={x(0)} y={pad.t} width={x(60) - x(0)} height={h - pad.t - pad.b} fill="var(--color-ochre)" opacity="0.08" />
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-fog)">{v}%</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--color-lapis)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.pct)} r="3" fill="var(--color-lapis)"><title>{`${fmtTime(p.t)} — ${p.pct}%`}</title></circle>)}
        <text x={x(0)} y={h - 6} fontSize="10" fill="var(--color-fog)">0:00</text>
        <text x={x(60)} y={h - 6} fontSize="10" fill="var(--color-ochre)" textAnchor="middle">1:00</text>
        <text x={w - pad.r} y={h - 6} fontSize="10" fill="var(--color-fog)" textAnchor="end">{fmtTime(maxT)}</text>
      </svg>
      <figcaption className="mt-1 text-xs text-fog">Охрой — первая минута.</figcaption>
    </figure>
  );
}
