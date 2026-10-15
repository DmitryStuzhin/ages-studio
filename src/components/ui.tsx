import clsx from "clsx";
import type { GateResult } from "@/db/schema";
import { CircleCheck, CircleAlert, CircleX, Info } from "lucide-react";

export function PageHeader({ title, lead, children }: { title: string; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-[1.85rem] leading-[1.15] text-bone">{title}</h1>
        {lead && <p className="mt-2 text-mist">{lead}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}

export function Section({ title, aside, children, className }: { title?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("panel p-5", className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h2 className="text-[1.3rem] text-bone">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "черновик", cls: "text-fog border-line-2" },
  in_progress: { label: "в работе", cls: "text-lapis border-lapis/50" },
  ready: { label: "готов к сборке", cls: "text-ochre border-ochre/50" },
  published: { label: "опубликован", cls: "text-malachite border-malachite/50" },
  archived: { label: "архив", cls: "text-fog border-line" },
};
export function ProjectStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.draft;
  return <span className={clsx("chip", s.cls)}>{s.label}</span>;
}

export function KindBadge({ kind }: { kind: string }) {
  return <span className="chip">{kind === "short" ? "шортс 9:16" : "ролик 16:9"}</span>;
}

const GATE_ICON = {
  pass: { Icon: CircleCheck, cls: "text-malachite", label: "пройден" },
  warn: { Icon: CircleAlert, cls: "text-ochre", label: "внимание" },
  fail: { Icon: CircleX, cls: "text-cinnabar", label: "не пройден" },
  info: { Icon: Info, cls: "text-fog", label: "справка" },
} as const;

export function GateList({ gates }: { gates: GateResult[] }) {
  if (!gates.length) return <p className="text-sm text-fog">Для этого шага кодовых проверок нет — смысловой гейт в конце ответа модели.</p>;
  const order = { fail: 0, warn: 1, pass: 2, info: 3 } as const;
  const sorted = [...gates].sort((a, b) => order[a.status] - order[b.status]);
  const counts = gates.reduce((m, g) => ({ ...m, [g.status]: (m[g.status] ?? 0) + 1 }), {} as Record<string, number>);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {(["fail", "warn", "pass"] as const).map((k) => counts[k] ? (
          <span key={k} className={clsx("chip", GATE_ICON[k].cls)}>{counts[k]} {GATE_ICON[k].label}</span>
        ) : null)}
      </div>
      <ul className="space-y-2">
        {sorted.map((g) => {
          const { Icon, cls, label } = GATE_ICON[g.status];
          return (
            <li key={g.id} className="flex gap-2.5">
              <Icon size={17} className={clsx("mt-0.5 shrink-0", cls)} aria-label={label} />
              <div className="min-w-0">
                <div className="text-[0.88rem] text-bone">{g.label}</div>
                <div className="whitespace-pre-wrap break-words text-[0.8rem] text-fog">{g.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Линейка из 24 делений — прогресс как часы суток. */
export function HourRuler({ value, max, marks = [] }: { value: number; max: number; marks?: { at: number; label: string }[] }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div className="relative h-9" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="absolute inset-x-0 top-3 flex justify-between">
        {Array.from({ length: 25 }, (_, i) => (
          <span key={i} className={clsx("w-px", i % 6 === 0 ? "h-4 bg-line-2" : "h-2.5 bg-line", pct > 0 && i / 24 <= pct && "!bg-ochre")} />
        ))}
      </div>
      <div className="absolute left-0 top-[11px] h-[3px] rounded bg-ochre" style={{ width: `${pct * 100}%` }} />
      {marks.map((m) => (
        <div key={m.label} className="absolute top-0 -translate-x-1/2 text-[0.68rem] text-fog" style={{ left: `${Math.min(1, m.at / max) * 100}%` }}>
          <div className="mx-auto h-7 w-px border-l border-dashed border-mist/50" />
          <div className="mt-0.5 whitespace-nowrap">{m.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-2 px-5 py-8 text-center">
      <div className="font-display text-xl text-mist">{title}</div>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-fog">{children}</div>}
    </div>
  );
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}
