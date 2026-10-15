"use client";
import { useState } from "react";
import clsx from "clsx";
import { Copy, Sparkles, FlaskConical, ClipboardPaste, Check, Undo2, RefreshCw, ChevronDown, TriangleAlert } from "lucide-react";
import type { GateResult } from "@/db/schema";
import { GateList } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toast";
import { approveAction, editRunAction, generateAction, recheckAction, saveOutputAction, unapproveAction } from "@/app/actions";

type Run = { id: number; output: string; gates: GateResult[]; approved: boolean; source: string; attempt: number; model: string | null };

const TIER: Record<string, string> = { opus: "Opus 5.5", sonnet: "Sonnet 5.5", haiku: "Haiku 5.5" };
const SOURCE: Record<string, string> = { manual: "вставлен вручную", mock: "демо", api: "Claude API" };

export function LlmStep(props: {
  projectId: number;
  step: { key: string; title: string; tier: string; authorAction: string | null; hasGates: boolean };
  prompt: string;
  promptVersion: string;
  run: Run | null;
  approvedId: number | null;
  attempts: number;
  apiConnected: boolean;
  cost: { inTokens: number; outTokens: number; cold: number; cached: number; typical: number; model: string } | null;
  hooks: { key: string; text: string }[];
  chosenHook: string | null;
  prevReady: boolean;
  prevTitle: string | null;
  reviewNeedsData: boolean;
}) {
  const { run, step } = props;
  const toast = useToast();
  const { pending, run: act } = useAction();
  const [text, setText] = useState(run?.output ?? "");
  const [pasting, setPasting] = useState(!run);
  const [fresh, setFresh] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [override, setOverride] = useState(false);
  const [hook, setHook] = useState<string>(props.chosenHook ?? props.hooks[0]?.text ?? "");
  const dirty = run && text !== run.output;
  const fails = run?.gates.filter((g) => g.status === "fail").length ?? 0;

  const copy = async () => {
    await navigator.clipboard.writeText(props.prompt);
    toast("Промпт скопирован — вставь его в чат Claude");
  };

  return (
    <div className="space-y-5">
      {!props.prevReady && (
        <div className="flex gap-2.5 rounded-lg border border-ochre/50 bg-ochre/10 px-4 py-3 text-sm text-bone">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-ochre" />
          <span>{props.prevTitle === "ролик не отмечен опубликованным" ? "Ролик ещё не отмечен опубликованным — отметь выход в шаге «Пакет видео», затем вноси метрики." : <>Предыдущий шаг «{props.prevTitle}» не утверждён — в контекст этого шага попадёт неполная информация.</>}</span>
        </div>
      )}
      {props.reviewNeedsData && (
        <div className="flex gap-2.5 rounded-lg border border-ochre/50 bg-ochre/10 px-4 py-3 text-sm text-bone">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-ochre" />
          <span>Нет снимка со 100+ просмотрами из главной и рекомендаций. Разбор можно запустить, но уроки будут только наблюдениями.</span>
        </div>
      )}

      <section className="panel">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
          <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
            <div className="text-bone">Промпт шага</div>
            <div className="text-[0.8rem] text-fog">
              Конституция {props.promptVersion} + инструкция шага + контекст из базы
              {props.cost && <> · ≈{props.cost.inTokens.toLocaleString("ru")} токенов на вход · {TIER[step.tier]} · обычно ≈${props.cost.typical.toFixed(2)}, максимум ${props.cost.cold.toFixed(2)}</>}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPrompt((x) => !x)} aria-expanded={showPrompt}>
            <ChevronDown size={15} className={clsx("transition-transform", showPrompt && "rotate-180")} />{showPrompt ? "Скрыть" : "Показать"}
          </button>
          <button className="btn btn-sm" onClick={copy}><Copy size={15} />Скопировать промпт</button>
          <button
            className="btn btn-primary btn-sm"
            disabled={!props.apiConnected || pending}
            title={props.apiConnected ? undefined : "Claude API не подключён — см. Настройки"}
            onClick={() => act(() => generateAction(props.projectId, step.key, "api"))}
          >
            <Sparkles size={15} />Сгенерировать
          </button>
          <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => act(() => generateAction(props.projectId, step.key, "mock"))} title="Заглушка в правильном формате — чтобы проверить конвейер">
            <FlaskConical size={15} />Демо
          </button>
        </div>
        {showPrompt && (
          <pre className="page mx-5 mb-5 max-h-[460px] overflow-auto whitespace-pre-wrap p-4">{props.prompt}</pre>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
        <section className="panel min-w-0 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-bone">{run ? `Ответ · попытка ${run.attempt} из ${props.attempts}` : "Ответ"}</div>
              {run && <div className="text-[0.8rem] text-fog">{SOURCE[run.source] ?? run.source}{run.model && run.model !== "demo" ? ` · ${run.model}` : ""}{run.approved ? " · утверждён" : ""}</div>}
            </div>
            {run && !pasting && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPasting(true)}><ClipboardPaste size={15} />Вставить новый ответ</button>
            )}
          </div>

          {pasting ? (
            <div>
              <textarea
                className="page min-h-[340px] w-full resize-y p-4 outline-none focus:ring-2 focus:ring-lapis"
                placeholder="Скопируй промпт, отправь его в чат Claude и вставь ответ сюда целиком. Платформа разберёт формат и посчитает гейты."
                value={fresh}
                onChange={(e) => setFresh(e.target.value)}
                aria-label="Новый ответ модели"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={pending || !fresh.trim()} onClick={() => act(() => saveOutputAction(props.projectId, step.key, fresh), () => { setFresh(""); setPasting(false); })}>
                  Сохранить ответ и проверить
                </button>
                {run && <button className="btn btn-ghost" onClick={() => setPasting(false)}>Отмена</button>}
              </div>
            </div>
          ) : run ? (
            <div>
              <textarea
                className="page min-h-[560px] w-full resize-y p-4 outline-none read-only:opacity-90 focus:ring-2 focus:ring-lapis"
                value={text}
                readOnly={run.approved}
                onChange={(e) => setText(e.target.value)}
                aria-label="Ответ модели, можно править"
              />
              {!run.approved && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn" disabled={!dirty || pending} onClick={() => act(() => editRunAction(run.id, text))}>Сохранить правку</button>
                  {dirty && <button className="btn btn-ghost" onClick={() => setText(run.output)}>Отменить правку</button>}
                </div>
              )}
              {run.approved && <p className="mt-2 text-xs text-fog">Утверждённый текст не редактируется. Чтобы поправить — сними утверждение; следующие шаги тоже потеряют утверждение.</p>}
            </div>
          ) : null}
        </section>

        <aside className="space-y-5">
          <section className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-bone">Кодовые гейты</div>
              {run && step.hasGates && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => act(() => recheckAction(run.id))} title="Пересчитать"><RefreshCw size={14} /></button>}
            </div>
            {run ? <GateList gates={run.gates} /> : <p className="text-sm text-fog">Появятся после первого ответа.</p>}
          </section>

          {run && (
            <section className="panel p-5">
              <div className="mb-2 text-bone">Решение автора</div>
              {step.authorAction && <p className="mb-3 text-sm text-mist">{step.authorAction}</p>}
              {props.hooks.length > 0 && !run.approved && (
                <fieldset className="mb-4 space-y-2">
                  <legend className="label">Хук для сценария</legend>
                  {props.hooks.map((h) => (
                    <label key={h.key} className={clsx("flex cursor-pointer gap-2.5 rounded-md border px-3 py-2 text-sm", hook === h.text ? "border-lapis bg-lapis/10" : "border-line")}>
                      <input type="radio" name="hook" className="mt-1 accent-[var(--color-lapis)]" checked={hook === h.text} onChange={() => setHook(h.text)} />
                      <span><span className="text-fog">{h.key}.</span> {h.text}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {run.approved ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-malachite"><Check size={17} />Утверждено</div>
                  <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => act(() => unapproveAction(run.id))}><Undo2 size={14} />Снять утверждение</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {fails > 0 && (
                    <label className="flex gap-2 text-sm text-mist">
                      <input type="checkbox" className="mt-1 accent-[var(--color-ochre)]" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                      <span>Утвердить, несмотря на {fails} непройденн{fails === 1 ? "ый гейт" : "ых гейта"}, — под мою ответственность</span>
                    </label>
                  )}
                  <button
                    className="btn btn-approve w-full justify-center"
                    disabled={pending || Boolean(dirty) || (fails > 0 && !override)}
                    onClick={() => act(() => approveAction(run.id, { override, chosenHook: props.hooks.length ? hook : undefined }))}
                  >
                    <Check size={16} />Утвердить шаг
                  </button>
                  {dirty && <p className="text-xs text-fog">Сначала сохрани правку — гейты пересчитаются.</p>}
                  {props.approvedId && props.approvedId !== run.id && <p className="text-xs text-fog">Утверждена другая попытка. Утверждение этой заменит её.</p>}
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
