"use client";
import { useState } from "react";
import clsx from "clsx";
import { Check, X, RotateCcw } from "lucide-react";
import { useAction } from "@/components/use-action";
import { activateVersionAction, resolveProposalAction, savePromptAction } from "@/app/actions";

export function PromptEditor({ constitution, steps, titles }: { constitution: string; steps: Record<string, string>; titles: Record<string, string> }) {
  const { pending, run } = useAction();
  const [tab, setTab] = useState<string>("__constitution");
  const [c, setC] = useState(constitution);
  const [s, setS] = useState<Record<string, string>>(steps);
  const [log, setLog] = useState("");
  const keys = Object.keys(steps);
  const changed = c !== constitution || keys.some((k) => s[k] !== steps[k]);
  const value = tab === "__constitution" ? c : s[tab] ?? "";
  const dirtyTab = (k: string) => (k === "__constitution" ? c !== constitution : s[k] !== steps[k]);

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
      <nav className="panel h-fit p-2" aria-label="Модули промпта">
        {[["__constitution", "Конституция"], ...keys.map((k) => [k, titles[k] ?? k])].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[0.88rem]", tab === k ? "bg-ink-3 text-bone" : "text-mist hover:bg-ink-3/50")}>
            <span>{label}</span>{dirtyTab(k) && <span className="h-1.5 w-1.5 rounded-full bg-ochre" aria-label="изменено" />}
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-3">
        <textarea
          className="page min-h-[560px] w-full resize-y p-5 outline-none focus:ring-2 focus:ring-lapis"
          value={value}
          onChange={(e) => (tab === "__constitution" ? setC(e.target.value) : setS((x) => ({ ...x, [tab]: e.target.value })))}
          aria-label="Текст модуля"
        />
        <div className="panel flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-64 flex-1">
            <label className="label" htmlFor="log">Что изменилось и почему</label>
            <input id="log" className="field" value={log} onChange={(e) => setLog(e.target.value)} placeholder="Например: вторая угроза до 0:20 — по разбору Pirate" />
          </div>
          <button className="btn btn-primary" disabled={!changed || pending} onClick={() => run(() => savePromptAction(c, s, log), () => setLog(""))}>Сохранить как новую версию</button>
          {changed && <button className="btn btn-ghost" onClick={() => { setC(constitution); setS(steps); }}><RotateCcw size={14} />Сбросить</button>}
        </div>
      </div>
    </div>
  );
}

export function VersionList({ items }: { items: { id: number; version: string; status: string; changelog: string; date: string }[] }) {
  const { pending, run } = useAction();
  return (
    <ul className="divide-y divide-line/70">
      {items.map((v) => (
        <li key={v.id} className="flex flex-wrap items-start gap-3 py-3">
          <div className="w-20 font-display text-xl">{v.version}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-fog">{v.date}</div>
            <p className="text-[0.9rem] text-mist">{v.changelog || "—"}</p>
          </div>
          {v.status === "active" ? <span className="chip border-malachite/60 text-malachite">активна</span> : (
            <button className="btn btn-sm" disabled={pending} onClick={() => run(() => activateVersionAction(v.id))}>Сделать активной</button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProposalList({ items }: { items: { id: number; text: string; project: number | null }[] }) {
  const { pending, run } = useAction();
  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li key={p.id} className="flex flex-wrap items-start gap-3 rounded-md border border-line px-4 py-3">
          <p className="min-w-0 flex-1 text-[0.92rem] text-bone">{p.text}{p.project && <span className="text-fog"> · из проекта #{p.project}</span>}</p>
          <button className="btn btn-approve btn-sm" disabled={pending} onClick={() => run(() => resolveProposalAction(p.id, true))}><Check size={14} />Принять</button>
          <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => resolveProposalAction(p.id, false))}><X size={14} />Отклонить</button>
        </li>
      ))}
    </ul>
  );
}
