import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { DEFAULT_SETTINGS, type AppSettings } from "@/db/seed";
import type { ProjectParams } from "@/db/schema";
import { stepsFor, type ProjectKind } from "@/lib/pipeline/steps";
import { ROTATION_WINDOW } from "@/lib/prompts/library";

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "app") });
  const v = (row?.value ?? {}) as Partial<AppSettings>;
  return {
    ...DEFAULT_SETTINGS, ...v,
    channel: { ...DEFAULT_SETTINGS.channel, ...v.channel },
    goal: { ...DEFAULT_SETTINGS.goal, ...v.goal },
    defaults: { ...DEFAULT_SETTINGS.defaults, ...v.defaults },
    models: { ...DEFAULT_SETTINGS.models, ...v.models },
    elevenlabs: { ...DEFAULT_SETTINGS.elevenlabs, ...v.elevenlabs },
    sync: { ...DEFAULT_SETTINGS.sync, ...v.sync },
    google: { ...DEFAULT_SETTINGS.google, ...v.google },
  };
}

export async function saveSettings(next: AppSettings) {
  const db = await getDb();
  await db.insert(schema.settings).values({ key: "app", value: next })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next } });
}

export async function activePrompt() {
  const db = await getDb();
  const p = await db.query.promptVersions.findFirst({ where: eq(schema.promptVersions.status, "active"), orderBy: desc(schema.promptVersions.id) });
  if (!p) throw new Error("Нет активной версии мастер-промпта");
  return p;
}

export async function getProject(id: number) {
  const db = await getDb();
  return db.query.projects.findFirst({ where: eq(schema.projects.id, id) });
}

export async function listProjects() {
  const db = await getDb();
  return db.select().from(schema.projects).orderBy(desc(schema.projects.updatedAt));
}

export async function runsFor(projectId: number) {
  const db = await getDb();
  return db.select().from(schema.stepRuns).where(eq(schema.stepRuns.projectId, projectId)).orderBy(asc(schema.stepRuns.id));
}

/** Последний запуск каждого шага и утверждённый запуск (если есть). */
export async function stepState(projectId: number) {
  const runs = await runsFor(projectId);
  const state: Record<string, { latest: (typeof runs)[number] | null; approved: (typeof runs)[number] | null; attempts: number }> = {};
  for (const r of runs) {
    const s = (state[r.stepKey] ??= { latest: null, approved: null, attempts: 0 });
    s.latest = r;
    s.attempts++;
    if (r.approved) s.approved = r;
  }
  return state;
}

export function currentStepKey(kind: ProjectKind, state: Awaited<ReturnType<typeof stepState>>, params: ProjectParams, status?: string) {
  for (const s of stepsFor(kind)) {
    // Шаг 0 необязателен: если роль уже известна, конвейер начинается с параметров.
    if (s.key === "role" && (params.role || state.params?.approved)) continue;
    if (s.mode === "form") {
      if (!state[s.key]?.approved) return s.key;
      continue;
    }
    if (s.mode === "review") return s.key;
    // Пакет «закрывается» публикацией ролика, а не утверждением.
    if (s.mode === "export") {
      if (status === "published") continue;
      return s.key;
    }
    if (!state[s.key]?.approved) return s.key;
  }
  return stepsFor(kind).at(-1)!.key;
}

/** Структуры и типы хуков последних N роликов серии (для правила чередования). */
export async function recentDramaturgy(excludeId?: number) {
  const db = await getDb();
  const rows = await db.select().from(schema.projects)
    .where(and(eq(schema.projects.kind, "long"), eq(schema.projects.format, "survive24"), excludeId ? ne(schema.projects.id, excludeId) : undefined))
    .orderBy(desc(schema.projects.createdAt));
  const withStructure = rows.filter((r) => r.params.structureKey);
  const last = withStructure.slice(0, ROTATION_WINDOW);
  return {
    structures: last.map((r) => r.params.structureKey!).filter(Boolean),
    hookTypes: last.map((r) => r.params.hookTypeKey!).filter(Boolean),
    projects: last.map((r) => ({ id: r.id, title: r.title, structure: r.params.structureKey, hook: r.params.hookTypeKey })),
  };
}

/** Финальные сценарии прошлых роликов (для антишаблона). */
export async function pastScripts(excludeId: number, limit = 6) {
  const db = await getDb();
  const runs = await db.select({ text: schema.stepRuns.output, projectId: schema.stepRuns.projectId, step: schema.stepRuns.stepKey })
    .from(schema.stepRuns)
    .where(and(inArray(schema.stepRuns.stepKey, ["audit", "script"]), eq(schema.stepRuns.approved, true), ne(schema.stepRuns.projectId, excludeId)))
    .orderBy(desc(schema.stepRuns.id));
  const seen = new Set<number>();
  const out: { projectId: number; text: string }[] = [];
  for (const r of runs) {
    if (seen.has(r.projectId)) continue; // берём последний утверждённый (audit идёт позже script)
    seen.add(r.projectId);
    out.push({ projectId: r.projectId, text: r.text });
    if (out.length >= limit) break;
  }
  if (!out.length) return [];
  const projs = await db.select({ id: schema.projects.id, title: schema.projects.title }).from(schema.projects).where(inArray(schema.projects.id, out.map((o) => o.projectId)));
  return out.map((o) => ({ title: projs.find((p) => p.id === o.projectId)?.title ?? `#${o.projectId}`, text: o.text }));
}

export async function activeLessons(kind: ProjectKind, limit = 15) {
  const db = await getDb();
  const rows = await db.select().from(schema.lessons)
    .where(inArray(schema.lessons.status, ["hypothesis", "confirmed"]))
    .orderBy(desc(schema.lessons.confirmations), desc(schema.lessons.updatedAt));
  return rows.filter((l) => l.scope === "both" || l.scope === kind).slice(0, limit);
}

export async function metricsFor(projectId: number) {
  const db = await getDb();
  return db.select().from(schema.metrics).where(eq(schema.metrics.projectId, projectId)).orderBy(asc(schema.metrics.day));
}

export async function marketItems() {
  const db = await getDb();
  return db.select().from(schema.marketItems).orderBy(desc(schema.marketItems.views));
}

export async function snapshots() {
  const db = await getDb();
  return db.select().from(schema.channelSnapshots).orderBy(asc(schema.channelSnapshots.day));
}
