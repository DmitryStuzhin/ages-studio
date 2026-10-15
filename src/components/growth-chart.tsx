/** Подписчики и часы как доля от цели — на одной шкале 0–100%. */
export function GrowthChart({ points, goalSubs, goalHours }: { points: { day: string; subs: number; hours: number | null }[]; goalSubs: number; goalHours: number }) {
  const w = 560, h = 220, pad = { l: 38, r: 12, t: 14, b: 26 };
  const t0 = new Date(points[0].day).getTime();
  const t1 = Math.max(t0 + 86400000, new Date(points.at(-1)!.day).getTime());
  const x = (d: string) => pad.l + ((new Date(d).getTime() - t0) / (t1 - t0)) * (w - pad.l - pad.r);
  const y = (frac: number) => pad.t + (1 - Math.min(1, frac)) * (h - pad.t - pad.b);
  const line = (vals: { day: string; v: number | null }[]) => vals.filter((p) => p.v != null).map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.v!).toFixed(1)}`).join(" ");
  const subs = line(points.map((p) => ({ day: p.day, v: p.subs / goalSubs })));
  const hours = line(points.map((p) => ({ day: p.day, v: p.hours != null ? p.hours / goalHours : null })));
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Рост подписчиков и часов просмотра к цели">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}><line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" /><text x={pad.l - 6} y={y(v) + 3.5} fontSize="10" textAnchor="end" fill="var(--color-fog)">{v * 100}%</text></g>
        ))}
        <path d={subs} fill="none" stroke="var(--color-lapis)" strokeWidth="2" />
        {hours && <path d={hours} fill="none" stroke="var(--color-ochre)" strokeWidth="2" />}
        <text x={pad.l} y={h - 6} fontSize="10" fill="var(--color-fog)">{points[0].day}</text>
        <text x={w - pad.r} y={h - 6} fontSize="10" textAnchor="end" fill="var(--color-fog)">{points.at(-1)!.day}</text>
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-mist">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-lapis" />подписчики / {goalSubs}</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-ochre" />часы / {goalHours}</span>
      </figcaption>
    </figure>
  );
}
