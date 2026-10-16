"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CircleCheck, CircleX, Sparkles } from "lucide-react";
import { useToast } from "@/components/toast";

export type LiveView = {
  state: "idle" | "thinking" | "writing" | "done" | "error";
  text?: string; model?: string; elapsed?: number; waitFirst?: number;
  inTokens?: number; outTokens?: number; expectedOut?: number; maxOut?: number; error?: string | null; cost?: number;
  phase?: "start" | "thinking" | "writing"; effort?: string; thinkingTokens?: number; cut?: boolean;
};

const mmss = (ms = 0) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Запуск генерации шага и опрос её состояния. Переживает обновление страницы: задание живёт на сервере. */
export function useLiveGeneration(projectId: number, stepKey: string) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<LiveView>({ state: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(0);

  const poll = useCallback(async (announce: boolean) => {
    try {
      const r = await fetch(`/api/projects/${projectId}/generate?step=${encodeURIComponent(stepKey)}`, { cache: "no-store" });
      const j = (await r.json()) as LiveView;
      // При заходе на страницу показываем только идущую генерацию; готовую видно как новую попытку.
      setV(!announce && (j.state === "done" || j.state === "error") ? { state: "idle" } : j);
      if (j.state === "thinking" || j.state === "writing") { timer.current = setTimeout(() => poll(true), 600); return; }
      if (announce && j.state === "done") {
        if (j.cut) toast("Ответ оборван лимитом длины — сгенерируй ещё раз или допиши вручную", "error");
        else toast(`Ответ готов · $${(j.cost ?? 0).toFixed(3)}${j.thinkingTokens ? ` · ${j.thinkingTokens.toLocaleString("ru")} ток. ушло на размышления` : ""}`);
        router.refresh();
      }
      if (announce && j.state === "error") toast(j.error ?? "Ошибка генерации", "error");
    } catch {
      timer.current = setTimeout(() => poll(announce), 1500);
    }
  }, [projectId, stepKey, router, toast]);

  // Вернулся на страницу, а генерация ещё идёт — подхватываем её.
  useEffect(() => {
    poll(false).then(() => undefined);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [poll]);

  const start = async () => {
    started.current = Date.now();
    setV({ state: "thinking", elapsed: 0, text: "" });
    const r = await fetch(`/api/projects/${projectId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: stepKey }) });
    const j = (await r.json()) as LiveView;
    if (!r.ok) { setV({ state: "idle" }); toast(j.error ?? "Не удалось запустить", "error"); return; }
    setV(j);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => poll(true), 500);
  };

  const busy = v.state === "thinking" || v.state === "writing";
  return { v, busy, start, dismiss: () => setV({ state: "idle" }) };
}

const PHASES = ["Собираю контекст из базы", "Отправляю промпт модели", "Модель продумывает ответ", "Сверяется с конституцией и уроками"];

/** Панель живой генерации: фаза, таймер, токены, цена и текст, который появляется по мере написания. */
export function LivePanel({ v, onDismiss }: { v: LiveView; onDismiss: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);
  const busy = v.state === "thinking" || v.state === "writing";
  // Таймер тикает между опросами, чтобы секунды шли плавно.
  const base = useRef({ at: 0, elapsed: 0 });
  useEffect(() => { base.current = { at: performance.now(), elapsed: v.elapsed ?? 0 }; }, [v.elapsed]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(base.current.elapsed + performance.now() - base.current.at), 250);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [v.text]);

  const elapsed = busy ? now || v.elapsed : v.elapsed;
  const pct = v.expectedOut ? Math.min(98, Math.round(((v.outTokens ?? 0) / v.expectedOut) * 100)) : 0;
  const phase = PHASES[Math.min(PHASES.length - 1, Math.floor((elapsed ?? 0) / 2500))];

  return (
    <div className="live-panel overflow-hidden rounded-lg border border-lapis/40 bg-ink/60">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          {busy ? <span className="live-orb" aria-hidden /> : v.state === "done" ? <CircleCheck size={18} className="text-malachite" /> : <CircleX size={18} className="text-cinnabar" />}
          <div>
            <div className="text-[0.92rem] text-bone" aria-live="polite">
              {v.state === "thinking" ? (v.phase === "thinking" ? <>{v.model} размышляет над ответом<span className="live-dots" /></> : <>{phase}<span className="live-dots" /></>)
                : v.state === "writing" ? <>{v.model} пишет ответ<span className="live-dots" /></> : v.state === "done" ? (v.cut ? "Ответ оборван лимитом длины" : "Ответ готов") : "Генерация прервалась"}
            </div>
            <div className={clsx("text-[0.75rem]", v.cut ? "text-ochre" : "text-fog")}>
              {busy ? (v.phase === "thinking" ? `Размышления скрыты, но идут в счёт ответа · глубина ${v.effort === "low" ? "низкая" : "средняя"} · можно уйти со страницы` : "Можно уйти со страницы — ответ сохранится сам")
                : v.state === "done" ? (v.cut ? "Сгенерируй ещё раз или допиши вручную" : `Сохранён как новая попытка, гейты посчитаны${v.thinkingTokens ? ` · из ${(v.outTokens ?? 0).toLocaleString("ru")} токенов ${v.thinkingTokens.toLocaleString("ru")} ушло на размышления` : ""}`)
                : v.error}
            </div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8rem] tabular-nums text-mist">
          <span title="Прошло времени">⏱ {mmss(elapsed)}</span>
          <span title="Токенов написано">{(v.outTokens ?? 0).toLocaleString("ru")} ток.</span>
          {v.cost != null && <span title="Стоимость по факту на сейчас">${v.cost.toFixed(3)}</span>}
          {!busy && <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Скрыть</button>}
        </div>
      </div>
      <div className="h-1 bg-ink">
        <div className={clsx("h-full transition-[width] duration-500", busy ? "live-bar" : v.state === "done" ? "bg-malachite" : "bg-cinnabar")}
          style={{ width: v.state === "thinking" ? "100%" : v.state === "writing" ? `${Math.max(4, pct)}%` : "100%" }} />
      </div>
      <div ref={box} className="page max-h-[520px] min-h-[260px] overflow-y-auto whitespace-pre-wrap p-4 text-[0.88rem] leading-relaxed">
        {v.text ? <>{v.text}{busy && <span className="live-caret" aria-hidden />}</> : (
          <div className="space-y-3" aria-hidden>
            {[92, 78, 85, 60, 88, 70, 40].map((w, i) => <div key={i} className="live-skeleton h-3 rounded" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />)}
          </div>
        )}
      </div>
      {v.state === "writing" && v.expectedOut ? (
        <div className="flex items-center gap-2 px-4 py-2 text-[0.75rem] text-fog">
          <Sparkles size={12} className="text-lapis" />обычно ответ этого шага — около {v.expectedOut.toLocaleString("ru")} токенов, написано {pct}%
        </div>
      ) : null}
    </div>
  );
}
