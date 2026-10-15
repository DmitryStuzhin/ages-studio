"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { ProjectParams, RetentionPoint } from "@/db/schema";
import * as svc from "@/lib/server/service";
import { getSettings, saveSettings } from "@/lib/server/repo";
import type { AppSettings } from "@/db/seed";
import type { Canon } from "@/lib/canon";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function wrap(fn: () => Promise<unknown>, paths: string[] = ["/"], message?: string): Promise<ActionResult> {
  try {
    await fn();
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  if (v === undefined) return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

// ---------- Проекты ----------

export async function createProjectAction(form: FormData) {
  const kind = str(form, "kind") === "short" ? "short" : "long";
  const parentId = num(form, "parentId");
  const p = await svc.createProject(kind, { parentId, role: str(form, "role") });
  revalidatePath("/", "layout");
  redirect(`/projects/${p.id}`);
}

export async function deleteProjectAction(id: number) {
  await svc.deleteProject(id);
  revalidatePath("/", "layout");
  redirect("/projects");
}

export async function saveParamsAction(projectId: number, params: ProjectParams, approve: boolean) {
  return wrap(() => svc.saveParams(projectId, params, approve), ["/"], approve ? "Параметры утверждены" : "Сохранено");
}

export async function generateAction(projectId: number, stepKey: string, mode: "api" | "mock") {
  return wrap(() => svc.generate(projectId, stepKey, mode), ["/"], mode === "api" ? "Ответ получен" : "Демо-ответ создан");
}

export async function saveOutputAction(projectId: number, stepKey: string, output: string) {
  if (!output.trim()) return { ok: false, error: "Ответ пустой" } as ActionResult;
  return wrap(() => svc.saveOutput(projectId, stepKey, output, "manual"), ["/"], "Ответ сохранён, гейты пересчитаны");
}

export async function editRunAction(runId: number, output: string) {
  return wrap(() => svc.editRun(runId, output), ["/"], "Правка сохранена");
}

export async function recheckAction(runId: number) {
  return wrap(() => svc.recheck(runId), ["/"], "Гейты пересчитаны");
}

export async function approveAction(runId: number, opts: { override?: boolean; chosenHook?: string }) {
  return wrap(() => svc.approve(runId, opts), ["/"], "Шаг утверждён");
}

export async function unapproveAction(runId: number) {
  return wrap(() => svc.unapprove(runId), ["/"], "Утверждение снято");
}

export async function markPublishedAction(projectId: number, url: string, date: string) {
  return wrap(() => svc.markPublished(projectId, url || null, date ? new Date(date) : new Date()), ["/"], "Отмечено как опубликованное");
}

export async function costAction(projectId: number, stepKey: string) {
  try {
    return await svc.costEstimate(projectId, stepKey);
  } catch {
    return null;
  }
}

export async function framesCheckAction(projectId: number, fileNames: string[]) {
  const d = await svc.packageData(projectId, fileNames);
  return { check: d.frameCheck, scenes: d.manifest.scenes.length, duration: d.manifest.durationSec };
}

// ---------- Метрики ----------

function parseRetention(s: string | undefined): RetentionPoint[] {
  if (!s) return [];
  return s.split(/[,;\n]+/).map((pair) => {
    const m = pair.trim().match(/^(\d+):(\d{2})\s+(\d+(?:[.,]\d+)?)%?$/);
    if (!m) return null;
    return { t: parseInt(m[1], 10) * 60 + parseInt(m[2], 10), pct: parseFloat(m[3].replace(",", ".")) };
  }).filter((x): x is RetentionPoint => x !== null);
}

export async function addMetricsAction(projectId: number, form: FormData): Promise<ActionResult> {
  return wrap(async () => {
    const db = await getDb();
    const day = num(form, "day");
    if (!day) throw new Error("Укажи день снимка: 2, 7 или 28");
    await db.insert(schema.metrics).values({
      projectId, day,
      views: num(form, "views"), browseViews: num(form, "browseViews"), shortsViews: num(form, "shortsViews"),
      ctr: num(form, "ctr"), avgViewPct: num(form, "avgViewPct"), avgViewSec: num(form, "avgViewSec"),
      subsGained: num(form, "subsGained"), watchHours: num(form, "watchHours"), engagedPct: num(form, "engagedPct"),
      retention: parseRetention(str(form, "retention")), notes: str(form, "notes") ?? "",
    });
  }, ["/"], "Снимок метрик добавлен");
}

export async function deleteMetricsAction(id: number) {
  return wrap(async () => {
    const db = await getDb();
    await db.delete(schema.metrics).where(eq(schema.metrics.id, id));
  });
}

export async function addSnapshotAction(form: FormData): Promise<ActionResult> {
  return wrap(async () => {
    const db = await getDb();
    const subscribers = num(form, "subscribers");
    if (subscribers === undefined) throw new Error("Укажи число подписчиков");
    await db.insert(schema.channelSnapshots).values({
      day: str(form, "day") ?? new Date().toISOString().slice(0, 10),
      subscribers, watchHours12m: num(form, "watchHours"), shortsViews90d: num(form, "shortsViews"),
    });
  }, ["/"], "Снимок канала добавлен");
}

export async function deleteSnapshotAction(id: number) {
  return wrap(async () => {
    const db = await getDb();
    await db.delete(schema.channelSnapshots).where(eq(schema.channelSnapshots.id, id));
  });
}

// ---------- Ниша ----------

export async function addMarketAction(form: FormData): Promise<ActionResult> {
  return wrap(async () => {
    const title = str(form, "title");
    if (!title) throw new Error("Нужно название");
    const db = await getDb();
    await db.insert(schema.marketItems).values({
      kind: (str(form, "kind") as "competitor_video") ?? "competitor_video",
      title, channel: str(form, "channel"), url: str(form, "url"), views: num(form, "views"),
      publishedAt: str(form, "publishedAt"), angle: str(form, "angle") ?? "", tags: str(form, "tags") ?? "",
    });
  }, ["/"], "Добавлено в сводку ниши");
}

export async function setMarketFlagAction(id: number, flag: "hidden" | "pinned", value: boolean) {
  return wrap(async () => {
    const db = await getDb();
    await db.update(schema.marketItems).set(flag === "hidden" ? { hidden: value, pinned: false } : { pinned: value }).where(eq(schema.marketItems.id, id));
  }, ["/"], flag === "hidden" ? (value ? "Скрыто — больше не появится в сводке" : "Возвращено") : (value ? "Закреплено — всегда в промптах" : "Откреплено"));
}

export async function deleteMarketAction(id: number) {
  return wrap(async () => {
    const db = await getDb();
    await db.delete(schema.marketItems).where(eq(schema.marketItems.id, id));
  });
}

// ---------- Уроки ----------

export async function lessonStatusAction(id: number, status: "hypothesis" | "confirmed" | "retired") {
  return wrap(() => svc.setLessonStatus(id, status));
}
export async function confirmLessonAction(id: number) {
  return wrap(() => svc.confirmLesson(id), ["/"], "+1 подтверждение");
}
export async function deleteLessonAction(id: number) {
  return wrap(() => svc.deleteLesson(id));
}
export async function addLessonAction(form: FormData): Promise<ActionResult> {
  const text = str(form, "text");
  if (!text) return { ok: false, error: "Напиши урок" };
  return wrap(() => svc.addLesson(text, str(form, "evidence") ?? "", (str(form, "scope") as "long") ?? "long"), ["/"], "Урок добавлен как гипотеза");
}

// ---------- Промпт ----------

export async function savePromptAction(constitution: string, steps: Record<string, string>, changelog: string) {
  if (!changelog.trim()) return { ok: false, error: "Опиши, что изменилось — без этого через месяц не понять, почему ролики стали другими." } as ActionResult;
  return wrap(() => svc.savePromptVersion(constitution, steps, changelog), ["/"], "Новая версия активна");
}
export async function activateVersionAction(id: number) {
  return wrap(() => svc.activateVersion(id), ["/"], "Версия активирована");
}
export async function resolveProposalAction(id: number, accept: boolean) {
  return wrap(() => svc.resolveProposal(id, accept), ["/"], accept ? "Правка принята — создана новая версия" : "Правка отклонена");
}

// ---------- Настройки ----------

export async function saveSettingsAction(next: AppSettings) {
  return wrap(() => saveSettings(next), ["/"], "Настройки сохранены");
}
// ---------- Канон и конвейер ----------

export async function saveCanonAction(next: Canon): Promise<ActionResult> {
  const { saveCanon } = await import("@/lib/server/canon");
  if (!next.styleLine.trim()) return { ok: false, error: "Строка стиля не может быть пустой" };
  return wrap(() => saveCanon(next), ["/"], "Канон сохранён — подставится во все следующие шаги");
}

export async function importCanonAction(): Promise<ActionResult> {
  const { importCanonFromPipeline } = await import("@/lib/server/canon");
  try {
    const r = await importCanonFromPipeline();
    revalidatePath("/", "layout");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function exportToPipelineAction(projectId: number): Promise<ActionResult> {
  const { exportToPipeline } = await import("@/lib/server/pipeline");
  try {
    const r = await exportToPipeline(projectId);
    revalidatePath("/", "layout");
    return { ok: true, message: r.written.length ? `В videos/${r.slug}: ${r.written.join(", ")}` : `videos/${r.slug} уже актуальна` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- YouTube ----------

export async function syncNowAction(): Promise<ActionResult> {
  const { runSync, lastRuns } = await import("@/lib/server/sync");
  try {
    const id = await runSync("manual");
    const run = (await lastRuns(5)).find((r) => r.id === id);
    revalidatePath("/", "layout");
    if (!run?.ok) return { ok: false, error: run?.log.find((l) => l.level === "error")?.text ?? "Обновление завершилось с ошибкой — смотри журнал." };
    const warns = run.log.filter((l) => l.level === "warn").length;
    return { ok: true, message: `Данные обновлены${warns ? `, предупреждений: ${warns}` : ""} · квота ${run.quotaUnits} ед.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function disconnectGoogleAction(): Promise<ActionResult> {
  const { setGoogleAuth } = await import("@/lib/server/sync");
  return wrap(() => setGoogleAuth(null), ["/"], "Вход в YouTube отключён");
}

export async function getSettingsAction() {
  return getSettings();
}

// ---------- ElevenLabs ----------

export async function saveElevenKeyAction(key: string): Promise<ActionResult> {
  const { saveElevenKey } = await import("@/lib/server/voice");
  return wrap(() => saveElevenKey(key), ["/"], "Ключ проверен и сохранён в .env конвейера");
}

export async function saveVoiceAction(voiceId: string, voiceName: string, model: string): Promise<ActionResult> {
  const { syncVoiceToPipelineEnv } = await import("@/lib/server/voice");
  return wrap(async () => {
    const s = await getSettings();
    await saveSettings({ ...s, elevenlabs: { ...s.elevenlabs, voiceId, voiceName, model } });
    await syncVoiceToPipelineEnv(voiceId, model);
  }, ["/"], `Голос: ${voiceName}`);
}

export async function startVoiceAction(projectId: number): Promise<ActionResult> {
  const { startFullVoice } = await import("@/lib/server/voice");
  return wrap(() => startFullVoice(projectId), ["/"], "Озвучка запущена");
}

export async function startFragmentAction(projectId: number, from: number, to: number): Promise<ActionResult> {
  const { startFragmentVoice } = await import("@/lib/server/voice");
  return wrap(() => startFragmentVoice(projectId, from, to), ["/"], "Переозвучка куска запущена");
}
