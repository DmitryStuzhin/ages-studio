"use client";
// Графики Аналитики и Пульта. Палитра проверена валидатором dataviz на поверхности #15232c
// (тёмная тема): все слоты ≥3:1 к фону, соседние пары различимы при дальтонизме.
import { useEffect, useRef, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Scatter, ScatterChart, ZAxis, ReferenceArea,
} from "recharts";
import clsx from "clsx";
import { SERIES } from "./series";

export { SERIES };

const AXIS = { stroke: "var(--color-line)", tick: { fill: "var(--color-fog)", fontSize: 11 }, tickLine: false, axisLine: false };
const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const compactNum = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(Math.round(n)));

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

/** Число, которое «набегает» от 0 при первом показе. */
export function CountUp({ value, decimals = 0, suffix = "", className }: { value: number; decimals?: number; suffix?: string; className?: string }) {
  const reduced = useReducedMotion();
  // Стартуем с итогового значения: если вкладка в фоне и requestAnimationFrame не тикает,
  // число всё равно верное. Анимация 0 → value идёт только когда кадры реально рисуются.
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reduced || document.hidden) { setShown(value); return; }
    let raf = 0;
    let startTs = -1;
    const dur = 900;
    const tick = (t: number) => {
      if (startTs < 0) startTs = t;
      const k = Math.min(1, (t - startTs) / dur);
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const done = setTimeout(() => { cancelAnimationFrame(raf); setShown(value); }, dur + 400);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [value, reduced]);
  return (
    <span ref={ref} className={clsx("tabular-nums", className)}>
      {shown.toLocaleString("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}

function TooltipBox({ active, payload, label, unit, labelFmt }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; unit?: string; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line-2 bg-ink px-3 py-2 text-[0.8rem] shadow-xl">
      <div className="mb-1 text-fog">{label ? (labelFmt ? labelFmt(label) : label) : ""}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-mist">{p.name}</span>
          <span className="ml-auto pl-3 tabular-nums text-bone">{Math.abs(p.value).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}{unit ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

const legendStyle = { fontSize: 12, color: "var(--color-mist)", paddingTop: 8 };

/** Просмотры по дням: лонги и шортсы стопкой. */
export function DailyViewsChart({ data }: { data: { day: string; longViews: number; shortViews: number }[] }) {
  const reduced = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap={1}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" strokeOpacity={0.6} />
        <XAxis dataKey="day" {...AXIS} tickFormatter={fmtDay} minTickGap={28} />
        <YAxis {...AXIS} tickFormatter={compactNum} width={44} />
        <Tooltip content={<TooltipBox labelFmt={fmtDay} />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
        <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
        <Bar dataKey="longViews" name="Длинные ролики" stackId="v" fill={SERIES.long} isAnimationActive={!reduced} animationDuration={700} />
        <Bar dataKey="shortViews" name="Шортсы" stackId="v" fill={SERIES.short} radius={[3, 3, 0, 0]} isAnimationActive={!reduced} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Нарастающий итог + прогноз до дедлайна + «нужный темп». */
export function ForecastChart({ data, goal, deadline, unit }: { data: { day: string; actual: number | null; forecast: number | null; need: number | null }[]; goal: number; deadline: string; unit: string }) {
  const reduced = useReducedMotion();
  const max = Math.max(goal * 1.05, ...data.map((d) => Math.max(d.actual ?? 0, d.forecast ?? 0)));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.long} stopOpacity={0.35} />
            <stop offset="100%" stopColor={SERIES.long} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--color-line)" strokeOpacity={0.6} />
        <XAxis dataKey="day" {...AXIS} tickFormatter={fmtDay} minTickGap={36} />
        <YAxis {...AXIS} tickFormatter={compactNum} width={44} domain={[0, Math.ceil(max)]} />
        <Tooltip content={<TooltipBox labelFmt={fmtDay} unit={unit} />} />
        <ReferenceLine y={goal} stroke="var(--color-ochre)" strokeDasharray="4 4" label={{ value: `цель ${goal.toLocaleString("ru")}`, fill: "var(--color-ochre)", fontSize: 11, position: "insideTopLeft" }} />
        <ReferenceLine x={deadline} stroke="var(--color-fog)" strokeDasharray="2 4" label={{ value: "заявка", fill: "var(--color-fog)", fontSize: 11, position: "insideTopRight" }} />
        <Area type="monotone" dataKey="actual" name="Факт" stroke={SERIES.long} strokeWidth={2} fill="url(#actualFill)" connectNulls={false} isAnimationActive={!reduced} animationDuration={900} />
        <Line type="linear" dataKey="forecast" name="Прогноз при текущем темпе" stroke={SERIES.long} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={!reduced} animationDuration={900} />
        <Line type="linear" dataKey="need" name="Нужный темп" stroke={SERIES.fourth} strokeWidth={2} strokeDasharray="2 4" dot={false} isAnimationActive={!reduced} animationDuration={900} />
        <Legend wrapperStyle={legendStyle} iconType="plainline" iconSize={14} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Подписки и отписки по дням: вверх — пришли, вниз — ушли. */
export function SubsChart({ data }: { data: { day: string; subsGained: number; subsLost: number }[] }) {
  const reduced = useReducedMotion();
  const rows = data.map((d) => ({ day: d.day, gained: d.subsGained, lost: -d.subsLost }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} stackOffset="sign" barCategoryGap={1}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" strokeOpacity={0.6} />
        <XAxis dataKey="day" {...AXIS} tickFormatter={fmtDay} minTickGap={28} />
        <YAxis {...AXIS} width={36} allowDecimals={false} />
        <ReferenceLine y={0} stroke="var(--color-line-2)" />
        <Tooltip content={<TooltipBox labelFmt={fmtDay} />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
        <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
        <Bar dataKey="gained" name="Подписались" stackId="s" fill={SERIES.long} radius={[3, 3, 0, 0]} isAnimationActive={!reduced} />
        <Bar dataKey="lost" name="Отписались" stackId="s" fill={SERIES.short} radius={[0, 0, 3, 3]} isAnimationActive={!reduced} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Средние просмотры по дням недели — одна серия на график (масштабы лонгов и шортсов несравнимы). */
export function WeekdayChart({ data, k, color, name }: { data: { name: string; long: number; short: number }[]; k: "long" | "short"; color: string; name: string }) {
  const reduced = useReducedMotion();
  const best = data.reduce((a, d) => (d[k] > a[k] ? d : a), data[0]);
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 16, right: 0, left: -24, bottom: 0 }}>
        <XAxis dataKey="name" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={compactNum} width={40} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
        <Bar dataKey={k} name={name} radius={[3, 3, 0, 0]} isAnimationActive={!reduced}
          shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { name: string } }) => (
            <rect x={props.x} y={props.y} width={props.width} height={Math.max(0, props.height ?? 0)} rx={3} fill={color} fillOpacity={props.payload?.name === best?.name ? 1 : 0.45} />
          )} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Маленький график-тренд для плиток. */
export function Sparkline({ data, color = SERIES.long, height = 36 }: { data: number[]; color?: string; height?: number }) {
  const reduced = useReducedMotion();
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#sp-${color.slice(1)})`} isAnimationActive={!reduced} animationDuration={900} />
      </AreaChart>
    </ResponsiveContainer>
  );
}


type NichePoint = { x: number; y: number; z: number; title: string; channel: string; href?: string; views: number };

function NicheTip({ active, payload }: { active?: boolean; payload?: { payload: NichePoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="max-w-72 rounded-md border border-line-2 bg-ink px-3 py-2 text-[0.8rem] shadow-xl">
      <div className="line-clamp-2 text-bone">{p.title}</div>
      <div className="mt-0.5 text-fog">{p.channel}</div>
      <div className="mt-1 tabular-nums text-mist">{p.x.toFixed(1).replace(".", ",")} мин · {compactNum(p.views)} просм. · ×{p.y >= 10 ? Math.round(p.y) : p.y.toFixed(1).replace(".", ",")} к подписчикам</div>
    </div>
  );
}

/** Длина ролика против «обогнал свой канал»: где лежат сильные похожие и где твои. Ось Y логарифмическая. */
export function NicheScatter({ similar, mine, band }: { similar: NichePoint[]; mine: NichePoint[]; band?: [number, number] }) {
  const reduced = useReducedMotion();
  const ys = [...similar, ...mine].map((p) => p.y).filter((y) => y > 0);
  const lo = Math.max(0.001, Math.min(...ys, 1) / 1.5), hi = Math.max(...ys, 1) * 1.5;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 12, left: -6, bottom: 4 }}>
        <CartesianGrid stroke="var(--color-line)" strokeOpacity={0.5} />
        {band && <ReferenceArea x1={band[0]} x2={band[1]} fill={SERIES.long} fillOpacity={0.08} stroke="none" label={{ value: "длина сильных", fill: "var(--color-fog)", fontSize: 11, position: "insideTop" }} />}
        <XAxis type="number" dataKey="x" name="Длина" unit=" мин" {...AXIS} domain={[0, "dataMax + 2"]} allowDecimals={false} />
        <YAxis type="number" dataKey="y" name="×" scale="log" domain={[lo, hi]} {...AXIS} width={44} tickFormatter={(v: number) => `×${v >= 1 ? Math.round(v) : v.toFixed(2).replace(/0+$/, "")}`} allowDataOverflow />
        <ZAxis type="number" dataKey="z" range={[30, 260]} />
        <ReferenceLine y={1} stroke="var(--color-line-2)" strokeDasharray="3 3" />
        <Tooltip content={<NicheTip />} cursor={{ strokeDasharray: "3 3", stroke: "var(--color-line-2)" }} />
        <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
        <Scatter name="Похожие ролики" data={similar} fill={SERIES.long} fillOpacity={0.7} stroke="var(--color-ink-2)" strokeWidth={1} isAnimationActive={!reduced}
          onClick={(p) => { const h = (p as unknown as { payload?: NichePoint }).payload?.href; if (h) window.location.href = h; }} cursor="pointer" />
        {mine.length > 0 && <Scatter name="Твои ролики" data={mine} fill={SERIES.short} stroke="var(--color-ink-2)" strokeWidth={1.5} shape="diamond" isAnimationActive={!reduced} />}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Рост просмотров ролика по снимкам синхронизации. */
export function ViewsHistoryChart({ data }: { data: { day: string; views: number }[] }) {
  const reduced = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="vh" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.long} stopOpacity={0.35} />
            <stop offset="100%" stopColor={SERIES.long} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--color-line)" strokeOpacity={0.6} />
        <XAxis dataKey="day" {...AXIS} tickFormatter={fmtDay} minTickGap={28} />
        <YAxis {...AXIS} tickFormatter={compactNum} width={48} domain={["dataMin", "auto"]} />
        <Tooltip content={<TooltipBox labelFmt={fmtDay} />} />
        <Area type="monotone" dataKey="views" name="Просмотры" stroke={SERIES.long} strokeWidth={2} fill="url(#vh)" isAnimationActive={!reduced} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
