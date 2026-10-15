import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { GateResult, ProjectParams } from "@/db/schema";
import { stepDef, stepsFor, MODEL_PRICES, type ProjectKind } from "@/lib/pipeline/steps";
import { runGates, gatesBlocking } from "@/lib/pipeline/gates";
import { parseAngle, parseFrames, parsePackaging, parseReview, parseScript, extractElevenLabs } from "@/lib/pipeline/parse";
import { buildManifest, buildZip, checkFrames } from "@/lib/pipeline/package";
import { structureByKey } from "@/lib/prompts/library";
import { anthropicConfigured, anthropicGenerate } from "@/lib/integrations/anthropic";
import { mockFrames, mockOutput } from "@/lib/integrations/mock";
import { buildPrompt, finalScriptText } from "./context";
import { getCanon } from "./canon";
import { effectiveStyle } from "@/lib/canon";
import { activePrompt, getProject, getSettings, pastScripts, recentDramaturgy, stepState } from "./repo";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;

async function requireProject(id: number): Promise<Project> {
  const p = await getProject(id);
  if (!p) throw new Error("Проект не найден");
  return p;
}

/** Утверждённый финальный сценарий проекта (или родителя для шортса). */
async function scriptFor(project: Project) {
  const settings = await getSettings();
  const wpm = settings.defaults.wordsPerMinute;
  const src = project.kind === "short" && project.params.parentId ? project.params.parentId : project.id;
  const st = await stepState(src);
  const text = finalScriptText(st);
  return { text, parsed: text ? parseScript(text, wpm) : null, wpm };
}

export async function computeGates(project: Project, stepKey: string, output: string): Promise<GateResult[]> {
  const def = stepDef(project.kind as ProjectKind, stepKey);
  if (!def?.gates) return [];
  const canon = await getCanon();
  const rec = await recentDramaturgy(project.id);
  const { parsed, wpm } = await scriptFor(project);
  let params = project.params;
  if (project.kind === "short" && project.params.parentId) {
    const parent = await getProject(project.params.parentId);
    params = { ...parent?.params, ...project.params };
  }
  return runGates(def.gates, {
    output,
    params,
    structure: structureByKey(params.structureKey),
    wpm,
    pastScripts: def.gates === "script" || def.gates === "angle" ? await pastScripts(project.id) : [],
    approvedScript: def.gates === "frames" || def.gates === "short_script" ? parsed : null,
    styleBlock: effectiveStyle(canon, params, project.kind === "short"),
    recentHookTypes: rec.hookTypes,
    recentStructures: rec.structures,
  });
}

async function touch(projectId: number) {
  const db = await getDb();
  await db.update(schema.projects).set({ updatedAt: new Date(), status: "in_progress" })
    .where(and(eq(schema.projects.id, projectId), inArray(schema.projects.status, ["draft", "in_progress"])));
}

async function nextAttempt(projectId: number, stepKey: string) {
  const st = await stepState(projectId);
  return (st[stepKey]?.attempts ?? 0) + 1;
}

export async function saveOutput(projectId: number, stepKey: string, output: string, source: "manual" | "mock" | "api", meta?: { model?: string; inputTokens?: number; outputTokens?: number }) {
  const project = await requireProject(projectId);
  const { full } = await buildPrompt(projectId, stepKey);
  const gates = await computeGates(project, stepKey, output);
  const db = await getDb();
  const [run] = await db.insert(schema.stepRuns).values({
    projectId, stepKey, attempt: await nextAttempt(projectId, stepKey), prompt: full, output, source, gates,
    model: meta?.model, inputTokens: meta?.inputTokens, outputTokens: meta?.outputTokens,
  }).returning();
  await touch(projectId);
  return run;
}

export async function generate(projectId: number, stepKey: string, mode: "api" | "mock") {
  const project = await requireProject(projectId);
  const def = stepDef(project.kind as ProjectKind, stepKey);
  if (!def || def.mode !== "llm" && def.mode !== "review") throw new Error("У этого шага нет генерации");
  if (mode === "api") {
    if (!anthropicConfigured()) throw new Error("Claude API не подключён. Используй ручной режим или демо.");
    const settings = await getSettings();
    const { system, user } = await buildPrompt(projectId, stepKey);
    const r = await anthropicGenerate({ system, user, model: settings.models[def.tier], maxTokens: Math.min(64000, def.outTokens * 2) });
    return saveOutput(projectId, stepKey, r.text, "api", { model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
  }
  const { text, parsed, wpm } = await scriptFor(project);
  let params = project.params;
  if (project.kind === "short" && params.parentId) {
    const parent = await getProject(params.parentId);
    params = { ...parent?.params, ...params };
  }
  const canon = await getCanon();
  const out = stepKey === "frames" && parsed ? mockFrames(parsed, params, false, effectiveStyle(canon, params)) : mockOutput(stepKey, params, { script: text, wpm });
  return saveOutput(projectId, stepKey, out, "mock", { model: "demo" });
}

export async function editRun(runId: number, output: string) {
  const db = await getDb();
  const run = await db.query.stepRuns.findFirst({ where: eq(schema.stepRuns.id, runId) });
  if (!run) throw new Error("Запуск не найден");
  if (run.approved) throw new Error("Утверждённый результат не редактируется — сними утверждение");
  const project = await requireProject(run.projectId);
  const gates = await computeGates(project, run.stepKey, output);
  await db.update(schema.stepRuns).set({ output, gates }).where(eq(schema.stepRuns.id, runId));
}

export async function recheck(runId: number) {
  const db = await getDb();
  const run = await db.query.stepRuns.findFirst({ where: eq(schema.stepRuns.id, runId) });
  if (!run) return;
  const project = await requireProject(run.projectId);
  const gates = await computeGates(project, run.stepKey, run.output);
  await db.update(schema.stepRuns).set({ gates }).where(eq(schema.stepRuns.id, runId));
}

/** Сброс утверждений шагов после указанного: изменение раннего шага делает поздние устаревшими. */
async function invalidateAfter(project: Project, stepKey: string, keep: string[] = []) {
  const steps = stepsFor(project.kind as ProjectKind);
  const idx = steps.findIndex((s) => s.key === stepKey);
  const later = steps.slice(idx + 1).map((s) => s.key).filter((k) => !keep.includes(k));
  if (!later.length) return;
  const db = await getDb();
  await db.update(schema.stepRuns).set({ approved: false, approvedAt: null })
    .where(and(eq(schema.stepRuns.projectId, project.id), inArray(schema.stepRuns.stepKey, later), eq(schema.stepRuns.approved, true)));
}

export async function approve(runId: number, opts: { override?: boolean; chosenHook?: string; keep?: string[] } = {}) {
  const db = await getDb();
  const run = await db.query.stepRuns.findFirst({ where: eq(schema.stepRuns.id, runId) });
  if (!run) throw new Error("Запуск не найден");
  const project = await requireProject(run.projectId);
  if (gatesBlocking(run.gates) && !opts.override) throw new Error("Есть непройденные гейты. Исправь или утверди с пометкой «под мою ответственность».");

  await db.update(schema.stepRuns).set({ approved: false, approvedAt: null })
    .where(and(eq(schema.stepRuns.projectId, run.projectId), eq(schema.stepRuns.stepKey, run.stepKey)));
  await db.update(schema.stepRuns).set({ approved: true, approvedAt: new Date() }).where(eq(schema.stepRuns.id, runId));
  await invalidateAfter(project, run.stepKey, opts.keep);

  // Производные параметры
  const params: ProjectParams = { ...project.params };
  if (run.stepKey === "angle") {
    const a = parseAngle(run.output);
    if (a.answerWord) params.answerWord = a.answerWord;
    if (opts.chosenHook) params.chosenHook = opts.chosenHook;
    if (a.titles[0] && project.title.startsWith("Новый ролик")) {
      await db.update(schema.projects).set({ title: a.titles[0] }).where(eq(schema.projects.id, project.id));
    }
  }
  if (run.stepKey === "packaging") {
    const p = parsePackaging(run.output);
    if (p.title) await db.update(schema.projects).set({ title: p.title }).where(eq(schema.projects.id, project.id));
  }
  if (run.stepKey === "review") {
    const r = parseReview(run.output);
    for (const l of r.lessons) {
      await db.insert(schema.lessons).values({ text: l.text, evidence: l.evidence, status: "proposed", scope: project.kind as "long" | "short", sourceProjectId: project.id, confirmations: 1 });
    }
    for (const t of r.proposals) await db.insert(schema.promptProposals).values({ text: t, sourceProjectId: project.id });
  }
  // Последний генерируемый шаг перед пакетом: после него проект готов к сборке.
  const isLast = run.stepKey === (project.kind === "long" ? "packaging" : "s_pack");
  await db.update(schema.projects).set({ params, updatedAt: new Date(), ...(isLast && project.status !== "published" ? { status: "ready" as const } : {}) }).where(eq(schema.projects.id, project.id));
}

export async function unapprove(runId: number) {
  const db = await getDb();
  const run = await db.query.stepRuns.findFirst({ where: eq(schema.stepRuns.id, runId) });
  if (!run) return;
  const project = await requireProject(run.projectId);
  await db.update(schema.stepRuns).set({ approved: false, approvedAt: null }).where(eq(schema.stepRuns.id, runId));
  await invalidateAfter(project, run.stepKey);
}

export async function saveParams(projectId: number, patch: ProjectParams, approveNow: boolean) {
  const project = await requireProject(projectId);
  const db = await getDb();
  const params = { ...project.params, ...patch };
  // У шортса угроза вписывается после «Отбора угроз»: смена угрозы не должна сбрасывать сам отбор.
  const keep = project.kind === "short" && params.parentId === project.params.parentId ? ["s_select"] : [];
  const title = project.kind === "long" && params.role && project.title.startsWith("Новый ролик")
    ? `Новый ролик: ${params.role}` : project.title;
  await db.update(schema.projects).set({ params, title, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
  if (approveNow) {
    const summary = Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}: ${v}`).join("\n");
    const [run] = await db.insert(schema.stepRuns).values({
      projectId, stepKey: "params", attempt: await nextAttempt(projectId, "params"), output: summary, source: "manual", approved: false,
    }).returning();
    await approve(run.id, { override: true, keep });
  }
}

export async function createProject(kind: ProjectKind, opts: { parentId?: number; role?: string }) {
  const db = await getDb();
  const prompt = await activePrompt();
  const settings = await getSettings();
  let title = "Новый ролик";
  const params: ProjectParams = { durationMin: settings.defaults.durationMin, language: settings.defaults.language };
  if (kind === "short") {
    const parent = opts.parentId ? await getProject(opts.parentId) : null;
    title = parent ? `Шортс: ${parent.title}` : "Новый шортс";
    params.parentId = opts.parentId;
    if (parent?.params.styleOverride) { params.styleBlock = parent.params.styleBlock; params.styleOverride = true; }
  } else if (opts.role) {
    params.role = opts.role;
    title = `Новый ролик: ${opts.role}`;
  }
  const [p] = await db.insert(schema.projects).values({ kind, title, params, promptVersionId: prompt.id, parentId: params.parentId ?? null, status: "draft" }).returning();
  return p;
}

export async function deleteProject(id: number) {
  const db = await getDb();
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
}

export async function markPublished(id: number, url: string | null, at: Date) {
  const db = await getDb();
  await db.update(schema.projects).set({ status: "published", youtubeUrl: url, publishedAt: at, updatedAt: new Date() }).where(eq(schema.projects.id, id));
}

// ---------- Пакет ----------

export async function packageData(projectId: number, fileNames: string[] | null) {
  const project = await requireProject(projectId);
  const st = await stepState(projectId);
  const settings = await getSettings();
  const wpm = settings.defaults.wordsPerMinute;
  const framesKey = project.kind === "long" ? "frames" : "s_frames";
  const framesText = st[framesKey]?.approved?.output ?? st[framesKey]?.latest?.output ?? "";
  const { parsed } = await scriptFor(project);
  const angle = project.kind === "long" ? st["angle"]?.approved?.output : null;
  const verdictCard = angle?.match(/☠\s*Cause of death:[^\n]*/)?.[0] ?? null;
  const manifest = buildManifest({
    projectId, title: project.title, kind: project.kind as ProjectKind, role: project.params.role ?? null,
    script: project.kind === "long" ? parsed : null, framesText, wpm, verdictCard,
  });
  const specs = parseFrames(framesText);
  const frameCheck = fileNames ? checkFrames(specs, fileNames) : null;
  const auditOut = st["audit"]?.approved?.output ?? null;
  const voiceText = project.kind === "long" ? (auditOut ? extractElevenLabs(auditOut) : null) : (st["s_script"]?.approved?.output.match(/ТЕКСТ:\s*([\s\S]+?)(?:\n\s*\n|$)/)?.[1]?.trim() ?? null);
  const packaging = project.kind === "long" ? st["packaging"]?.approved?.output ?? null : st["s_pack"]?.approved?.output ?? null;
  const promptsTxt = specs.map((s) => `shot_${s.id}\nIMAGE: ${s.prompt}${s.animation ? `\nVEO: ${s.animation}` : ""}\n`).join("\n");
  return { project, manifest, frameCheck, voiceText, packaging, promptsTxt, ready: Boolean(framesText) };
}

export async function packageZip(projectId: number, fileNames: string[] | null) {
  const d = await packageData(projectId, fileNames);
  if (!d.ready) throw new Error("Нет утверждённых кадров — пакет собирать не из чего.");
  return { zip: await buildZip(d.manifest, d), name: `${d.project.title.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60)}_package.zip` };
}

// ---------- Оценка стоимости ----------

export async function costEstimate(projectId: number, stepKey: string) {
  const project = await requireProject(projectId);
  const def = stepDef(project.kind as ProjectKind, stepKey);
  if (!def || def.mode === "form" || def.mode === "export") return null;
  const { system, user } = await buildPrompt(projectId, stepKey);
  const price = MODEL_PRICES[def.tier];
  const sysTok = Math.round(system.length / 3.2);
  const userTok = Math.round(user.length / 3.2);
  const cold = ((sysTok + userTok) * price.input + def.outTokens * price.output) / 1e6;
  const cached = (sysTok * price.cacheRead + userTok * price.input + def.outTokens * price.output) / 1e6;
  return { tier: def.tier, model: price.name, inTokens: sysTok + userTok, outTokens: def.outTokens, cold, cached };
}

// ---------- Уроки и правки промпта ----------

export async function setLessonStatus(id: number, status: "hypothesis" | "confirmed" | "retired") {
  const db = await getDb();
  await db.update(schema.lessons).set({ status, updatedAt: new Date() }).where(eq(schema.lessons.id, id));
}
export async function confirmLesson(id: number) {
  const db = await getDb();
  const l = await db.query.lessons.findFirst({ where: eq(schema.lessons.id, id) });
  if (!l) return;
  const confirmations = l.confirmations + 1;
  await db.update(schema.lessons).set({ confirmations, status: confirmations >= 2 ? "confirmed" : l.status, updatedAt: new Date() }).where(eq(schema.lessons.id, id));
}
export async function addLesson(text: string, evidence: string, scope: "long" | "short" | "both") {
  const db = await getDb();
  await db.insert(schema.lessons).values({ text, evidence, scope, status: "hypothesis" });
}
export async function deleteLesson(id: number) {
  const db = await getDb();
  await db.delete(schema.lessons).where(eq(schema.lessons.id, id));
}

export async function savePromptVersion(constitution: string, steps: Record<string, string>, changelog: string) {
  const db = await getDb();
  const current = await activePrompt();
  const m = current.version.match(/^v(\d+)(?:\.(\d+))?$/);
  const next = m ? `v${m[1]}.${(parseInt(m[2] ?? "0", 10) + 1)}` : `${current.version}+1`;
  await db.update(schema.promptVersions).set({ status: "archived" }).where(eq(schema.promptVersions.status, "active"));
  const [v] = await db.insert(schema.promptVersions).values({ version: next, constitution, steps, changelog, status: "active" }).returning();
  return v;
}

export async function activateVersion(id: number) {
  const db = await getDb();
  await db.update(schema.promptVersions).set({ status: "archived" }).where(eq(schema.promptVersions.status, "active"));
  await db.update(schema.promptVersions).set({ status: "active" }).where(eq(schema.promptVersions.id, id));
}

export async function resolveProposal(id: number, accept: boolean) {
  const db = await getDb();
  const p = await db.query.promptProposals.findFirst({ where: eq(schema.promptProposals.id, id) });
  if (!p || p.status !== "pending") return;
  await db.update(schema.promptProposals).set({ status: accept ? "accepted" : "rejected" }).where(eq(schema.promptProposals.id, id));
  if (accept) {
    const cur = await activePrompt();
    const header = "\n\n## Поправки по разборам";
    const constitution = cur.constitution.includes(header.trim())
      ? `${cur.constitution}\n- ${p.text}`
      : `${cur.constitution}${header}\n- ${p.text}`;
    await savePromptVersion(constitution, cur.steps, `Поправка из разбора проекта #${p.sourceProjectId ?? "—"}: ${p.text}`);
  }
}

