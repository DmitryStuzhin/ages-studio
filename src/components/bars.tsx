// Полосы для разбивок (трафик, страны, устройства, возраст). Без "use client": рендерятся на сервере,
// анимация — CSS-класс bar-grow, поэтому форматирующие функции можно передавать прямо из страницы.
import { SERIES } from "./series";

/** Горизонтальные полосы с подписями и значениями — для источников трафика, стран, устройств. */
export function BarList({ items, color = SERIES.long, valueFmt, max: maxIn }: {
  items: { label: React.ReactNode; value: number; sub?: string; key: string }[];
  color?: string;
  valueFmt?: (v: number) => string;
  max?: number;
}) {
  const max = maxIn ?? Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, i) => a + i.value, 0);
  return (
    <ul className="space-y-2.5">
      {items.map((it, idx) => (
        <li key={it.key} className="group" title={`${typeof it.label === "string" ? it.label : ""}: ${it.value.toLocaleString("ru")}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[0.85rem]">
            <span className="min-w-0 truncate text-mist group-hover:text-bone">{it.label}</span>
            <span className="shrink-0 tabular-nums text-bone">
              {valueFmt ? valueFmt(it.value) : it.value.toLocaleString("ru")}
              <span className="ml-2 text-fog">{total ? Math.round((it.value / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink">
            <div className="bar-grow h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: color, animationDelay: `${idx * 60}ms` }} />
          </div>
          {it.sub && <div className="mt-0.5 text-[0.75rem] text-fog">{it.sub}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Возраст × пол: две серии в одной полосе. */
export function AgeGender({ rows }: { rows: { age: string; male: number; female: number; other: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.male + r.female + r.other));
  return (
    <div>
      <div className="mb-3 flex gap-4 text-[0.78rem] text-mist">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERIES.long }} />мужчины</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERIES.fifth }} />женщины</span>
      </div>
      <ul className="space-y-2">
        {rows.map((r, idx) => (
          <li key={r.age} className="grid grid-cols-[52px_1fr_52px] items-center gap-3 text-[0.82rem]">
            <span className="text-mist">{r.age}</span>
            <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-ink">
              <div className="bar-grow h-full" style={{ width: `${(r.male / max) * 100}%`, background: SERIES.long, animationDelay: `${idx * 60}ms` }} title={`мужчины ${r.male.toFixed(1)}%`} />
              <div className="bar-grow h-full" style={{ width: `${(r.female / max) * 100}%`, background: SERIES.fifth, animationDelay: `${idx * 60 + 30}ms` }} title={`женщины ${r.female.toFixed(1)}%`} />
            </div>
            <span className="text-right tabular-nums text-bone">{(r.male + r.female + r.other).toFixed(1).replace(".", ",")}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
