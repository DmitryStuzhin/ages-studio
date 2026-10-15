"use client";
import { useState } from "react";
import clsx from "clsx";
import { Check, Save } from "lucide-react";
import type { ProjectParams } from "@/db/schema";
import { useAction } from "@/components/use-action";
import { saveParamsAction } from "@/app/actions";

type Opt = { key: string; name: string; recent: boolean };

export function ParamsForm(props: {
  projectId: number;
  kind: "long" | "short";
  params: ProjectParams;
  defaults: { durationMin: number; language: string; styleBlock: string };
  structures: (Opt & { idea: string; fits: string })[];
  hooks: (Opt & { how: string })[];
  recent: { id: number; title: string; structure?: string; hook?: string }[];
  parents: { id: number; title: string }[];
  approved: boolean;
}) {
  const { pending, run } = useAction();
  const [p, setP] = useState<ProjectParams>({
    durationMin: props.defaults.durationMin, language: props.defaults.language, styleBlock: props.defaults.styleBlock, ...props.params,
  });
  const set = (k: keyof ProjectParams) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setP((x) => ({ ...x, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  const firstFree = (list: Opt[]) => list.find((o) => !o.recent)?.key;
  const missing = props.kind === "long"
    ? [!p.role && "роль", !p.structureKey && "структура", !p.hookTypeKey && "тип хука", !p.styleBlock?.trim() && "блок стиля"].filter(Boolean)
    : [!p.parentId && "родительский ролик"].filter(Boolean);

  const save = (approve: boolean) => run(() => saveParamsAction(props.projectId, p, approve));

  if (props.kind === "short") {
    return (
      <div className="panel space-y-4 p-5">
        <div>
          <label className="label" htmlFor="parent">Длинный ролик</label>
          <select id="parent" className="field" value={p.parentId ?? ""} onChange={(e) => setP((x) => ({ ...x, parentId: Number(e.target.value) || undefined }))}>
            <option value="">— выбери —</option>
            {props.parents.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="threat">Угроза шортса</label>
          <input id="threat" className="field" value={p.threat ?? ""} onChange={set("threat")} placeholder="Впиши после шага «Отбор угроз» и утверди параметры снова — отбор не сбросится" />
        </div>
        <div>
          <label className="label" htmlFor="notes">Заметки для модели</label>
          <textarea id="notes" className="field min-h-20" value={p.notes ?? ""} onChange={set("notes")} />
        </div>
        <Actions pending={pending} missing={missing as string[]} approved={props.approved} onSave={save} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="panel grid gap-4 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="role">Роль</label>
          <input id="role" className="field" value={p.role ?? ""} onChange={set("role")} placeholder="Victorian Chimney Sweep" />
        </div>
        <div>
          <label className="label" htmlFor="place">Место</label>
          <input id="place" className="field" value={p.place ?? ""} onChange={set("place")} placeholder="London" />
        </div>
        <div>
          <label className="label" htmlFor="era">Год или династия</label>
          <input id="era" className="field" value={p.era ?? ""} onChange={set("era")} placeholder="1840" />
        </div>
        <div>
          <label className="label" htmlFor="dur">Длительность, мин</label>
          <input id="dur" type="number" min={5} max={25} step={0.5} className="field" value={p.durationMin ?? 9} onChange={set("durationMin")} />
          <p className="mt-1 text-xs text-fog">Сначала удержание на 9–10 минутах, потом удлинять.</p>
        </div>
        <div>
          <label className="label" htmlFor="next">Следующая роль (для мостика)</label>
          <input id="next" className="field" value={p.nextRole ?? ""} onChange={set("nextRole")} placeholder="a Roman gladiator" />
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h3 className="text-[1.25rem]">Структура драматургии</h3>
          <button type="button" className="text-sm text-lapis hover:underline" onClick={() => setP((x) => ({ ...x, structureKey: firstFree(props.structures) }))}>выбрать свободную</button>
        </div>
        <p className="mb-3 text-sm text-fog">Каркас серии один, ход событий разный. Структура последних роликов: {props.recent.map((r) => r.structure).filter(Boolean).join(", ") || "—"}.</p>
        <div className="grid gap-2.5 md:grid-cols-2">
          {props.structures.map((s) => (
            <label key={s.key} className={clsx("cursor-pointer rounded-lg border p-3.5 transition-colors", p.structureKey === s.key ? "border-lapis bg-lapis/10" : "border-line hover:border-line-2")}>
              <div className="flex items-start gap-2.5">
                <input type="radio" name="structure" className="mt-1.5 accent-[var(--color-lapis)]" checked={p.structureKey === s.key} onChange={() => setP((x) => ({ ...x, structureKey: s.key }))} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-bone">{s.name}</span>
                    {s.recent && <span className="chip border-ochre/60 text-ochre">была недавно</span>}
                  </div>
                  <p className="mt-1 text-[0.82rem] text-mist">{s.idea}</p>
                  <p className="mt-1 text-[0.78rem] text-fog">Подходит: {s.fits}</p>
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-[1.25rem]">Тип хука</h3>
          <button type="button" className="text-sm text-lapis hover:underline" onClick={() => setP((x) => ({ ...x, hookTypeKey: firstFree(props.hooks) }))}>выбрать свободный</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {props.hooks.map((h) => (
            <label key={h.key} className={clsx("cursor-pointer rounded-lg border p-3 transition-colors", p.hookTypeKey === h.key ? "border-lapis bg-lapis/10" : "border-line hover:border-line-2")}>
              <div className="flex items-start gap-2.5">
                <input type="radio" name="hook" className="mt-1.5 accent-[var(--color-lapis)]" checked={p.hookTypeKey === h.key} onChange={() => setP((x) => ({ ...x, hookTypeKey: h.key }))} />
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className="text-bone">{h.name}</span>{h.recent && <span className="chip border-ochre/60 text-ochre">был недавно</span>}</div>
                  <p className="mt-1 text-[0.8rem] text-fog">{h.how}</p>
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <label className="label" htmlFor="style">Блок стиля — вставляется во все промпты картинок дословно</label>
        <textarea id="style" className="field min-h-28 font-mono text-[0.84rem]" value={p.styleBlock ?? ""} onChange={set("styleBlock")} placeholder="Вставь свой БЛОК СТИЛЯ. Значение по умолчанию задаётся в Настройках." />
        <label className="label mt-4" htmlFor="notes">Заметки для модели</label>
        <textarea id="notes" className="field min-h-20" value={p.notes ?? ""} onChange={set("notes")} placeholder="Что важно учесть в этом ролике" />
        <label className="label mt-4" htmlFor="range">Диапазон кадров для шага 8 (если выдаёшь пачками)</label>
        <input id="range" className="field" value={p.frameRange ?? ""} onChange={set("frameRange")} placeholder="001–050" />
      </section>

      <Actions pending={pending} missing={missing as string[]} approved={props.approved} onSave={save} />
    </div>
  );
}

function Actions({ pending, missing, approved, onSave }: { pending: boolean; missing: string[]; approved: boolean; onSave: (approve: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn btn-approve" disabled={pending || missing.length > 0} onClick={() => onSave(true)}>
        <Check size={16} />{approved ? "Сохранить и утвердить заново" : "Утвердить параметры"}
      </button>
      <button className="btn" disabled={pending} onClick={() => onSave(false)}><Save size={15} />Сохранить черновик</button>
      {missing.length > 0 && <span className="text-sm text-fog">Не хватает: {missing.join(", ")}</span>}
      {approved && <span className="text-sm text-fog">Повторное утверждение снимет утверждения следующих шагов.</span>}
    </div>
  );
}
