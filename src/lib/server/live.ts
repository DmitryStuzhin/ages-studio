import "server-only";
import { anthropicConfigured, anthropicStream } from "@/lib/integrations/anthropic";
import { stepDef, MODEL_PRICES, type ProjectKind } from "@/lib/pipeline/steps";
import { requireProject, saveOutput } from "./service";
import { buildPrompt } from "./context";
import { getSettings } from "./repo";

// Генерация шага в фоне с живым прогрессом. Страница опрашивает состояние раз в полсекунды и
// показывает текст по мере написания. Работа идёт на сервере: можно уйти со страницы или
// обновить её — ответ сохранится, а вернувшись, увидишь, что генерация ещё идёт.

export type LiveJob = {
  projectId: number; stepKey: string; model: string; tier: string;
  startedAt: number; firstTokenAt: number | null; finishedAt: number | null;
  text: string; inTokens: number; outTokens: number; expectedOut: number; maxOut: number;
  error: string | null; runId: number | null; priceIn: number; priceOut: number;
};

const g = globalThis as unknown as { __live?: Map<string, LiveJob> };
const jobs = (g.__live ??= new Map());
const keyOf = (p: number, s: string) => `${p}:${s}`;

export function liveJob(projectId: number, stepKey: string) {
  const j = jobs.get(keyOf(projectId, stepKey));
  // Готовые задания держим 10 минут — чтобы страница успела показать итог.
  if (j?.finishedAt && Date.now() - j.finishedAt > 10 * 60000) { jobs.delete(keyOf(projectId, stepKey)); return null; }
  return j ?? null;
}

export async function startLive(projectId: number, stepKey: string) {
  const running = liveJob(projectId, stepKey);
  if (running && !running.finishedAt) throw new Error("Этот шаг уже генерируется");
  if (!anthropicConfigured()) throw new Error("Claude API не подключён — вставь ключ в Настройках → Claude API.");
  const project = await requireProject(projectId);
  const def = stepDef(project.kind as ProjectKind, stepKey);
  if (!def || (def.mode !== "llm" && def.mode !== "review")) throw new Error("У этого шага нет генерации");
  const settings = await getSettings();
  const { system, user } = await buildPrompt(projectId, stepKey);
  const price = MODEL_PRICES[def.tier];
  const maxOut = Math.min(64000, def.outTokens * 2);
  const job: LiveJob = {
    projectId, stepKey, model: price.name, tier: def.tier, startedAt: Date.now(), firstTokenAt: null, finishedAt: null,
    text: "", inTokens: Math.round((system.length + user.length) / 3.2), outTokens: 0, expectedOut: Math.round(def.outTokens * 0.5), maxOut,
    error: null, runId: null, priceIn: price.input, priceOut: price.output,
  };
  jobs.set(keyOf(projectId, stepKey), job);
  (async () => {
    try {
      const r = await anthropicStream({ system, user, model: settings.models[def.tier], maxTokens: maxOut }, {
        text: (t) => {
          job.firstTokenAt ??= Date.now();
          job.text += t;
          job.outTokens = Math.max(job.outTokens, Math.round(job.text.length / 3.2));
        },
        usage: (u) => { if (u.input) job.inTokens = u.input; if (u.output) job.outTokens = u.output; },
      });
      const saved = await saveOutput(projectId, stepKey, r.text, "api", { model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
      job.runId = (saved as { id?: number } | undefined)?.id ?? null;
      job.outTokens = r.outputTokens || job.outTokens;
    } catch (e) {
      job.error = e instanceof Error ? e.message : String(e);
    } finally {
      job.finishedAt = Date.now();
    }
  })();
  return job;
}
