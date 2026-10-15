"use client";
import { useRef } from "react";
import { Check, Plus, Archive, Trash2, RotateCcw } from "lucide-react";
import { useAction } from "@/components/use-action";
import { addLessonAction, confirmLessonAction, deleteLessonAction, lessonStatusAction } from "@/app/actions";

type L = { id: number; text: string; evidence: string; confirmations: number; status: string; scope: string; source: string | null };
const SCOPE: Record<string, string> = { long: "ролики", short: "шортсы", both: "всё" };

export function LessonList({ items, mode }: { items: L[]; mode: "proposed" | "active" | "retired" }) {
  const { pending, run } = useAction();
  if (!items.length) return <p className="text-sm text-fog">Пусто.</p>;
  return (
    <ul className="divide-y divide-line/70">
      {items.map((l) => (
        <li key={l.id} className="flex flex-wrap gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.95rem] text-bone">{l.text}</p>
            <p className="mt-1 text-[0.8rem] text-fog">
              {l.evidence && <>{l.evidence} · </>}{SCOPE[l.scope]}{l.source && <> · {l.source}</>}
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-1.5">
            {mode === "active" && (
              <>
                <span className={l.status === "confirmed" ? "chip border-malachite/60 text-malachite" : "chip"} title="На скольких роликах подтверждён">
                  {l.status === "confirmed" ? "подтверждён" : "гипотеза"} · {l.confirmations}
                </span>
                <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => confirmLessonAction(l.id))} title="Подтвердился ещё на одном ролике"><Plus size={14} />1</button>
                <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => lessonStatusAction(l.id, "retired"))} title="Снять: перестал подтверждаться"><Archive size={14} /></button>
              </>
            )}
            {mode === "proposed" && (
              <>
                <button className="btn btn-approve btn-sm" disabled={pending} onClick={() => run(() => lessonStatusAction(l.id, "hypothesis"))}><Check size={14} />Принять как гипотезу</button>
                <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => deleteLessonAction(l.id))} aria-label="Отклонить"><Trash2 size={14} /></button>
              </>
            )}
            {mode === "retired" && (
              <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => lessonStatusAction(l.id, "hypothesis"))}><RotateCcw size={14} />Вернуть</button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AddLesson() {
  const { pending, run } = useAction();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} className="grid gap-3 sm:grid-cols-[1fr_160px]" action={(fd) => run(() => addLessonAction(fd), () => form.current?.reset())}>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="l-text">Урок</label>
        <input id="l-text" name="text" className="field" required placeholder="Что работает или не работает" />
      </div>
      <div>
        <label className="label" htmlFor="l-ev">Доказательство: ролик, таймкод, метрика</label>
        <input id="l-ev" name="evidence" className="field" placeholder="Pirate, 1:40–2:35, −18%" />
      </div>
      <div>
        <label className="label" htmlFor="l-scope">Для чего</label>
        <select id="l-scope" name="scope" className="field" defaultValue="long">
          <option value="long">ролики</option><option value="short">шортсы</option><option value="both">всё</option>
        </select>
      </div>
      <div><button className="btn btn-primary" disabled={pending}>Добавить</button></div>
    </form>
  );
}
