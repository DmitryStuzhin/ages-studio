import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getCanon, expandHome } from "./canon";
import { packageData } from "./service";
import { stepState, getProject } from "./repo";
import { parseCast, toStoryboardCsv, toStyleMd } from "@/lib/pipeline/package";
import { effectiveStyle } from "@/lib/canon";

// Мост в локальный конвейер ~/illustrated-ages-pipeline: платформа пишет туда storyboard.csv,
// style.md и idea.md, а tools/*.py конвейера делают остальное (prompts.html, проверку озвучки,
// монтаж в Remotion). Обратно платформа читает, сколько кадров, анимаций и озвучки уже лежит в папке.

export function slugFor(p: { id: number; title: string; params: { role?: string } }) {
  const base = (p.params.role || p.title).replace(/^Новый ролик:\s*/i, "").replace(/^Why You Wouldn['’]t Survive 24 Hours as (an?\s+)?/i, "");
  const s = base.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40);
  return s || `video-${p.id}`;
}

export async function pipelineRoot() {
  const canon = await getCanon();
  const dir = expandHome(canon.pipelineDir);
  const ok = await fs.stat(path.join(dir, "videos")).then((s) => s.isDirectory()).catch(() => false);
  return { dir, ok };
}

const exists = (p: string) => fs.stat(p).then(() => true).catch(() => false);
const list = async (p: string, re: RegExp) => (await fs.readdir(p).catch(() => [] as string[])).filter((n) => re.test(n)).sort();

export type PipelineStatus = {
  available: boolean;
  dir: string;
  slug: string;
  folder: string;
  exported: boolean;
  storyboardShots: number;
  frames: string[];
  anims: string[];
  audio: string[];
  hasVoiceClean: boolean;
  hasVoiceReport: boolean;
  hasPreview: boolean;
  hasFinal: boolean;
  finalSize: number | null;
  expectedShots: number;
  expectedAnims: number;
  missingFrames: string[];
  missingAnims: string[];
  updatedAt: string | null;
};

export async function pipelineStatus(projectId: number): Promise<PipelineStatus | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const { dir, ok } = await pipelineRoot();
  const slug = project.params.pipelineSlug ?? slugFor(project);
  const folder = path.join(dir, "videos", slug);
  const d = await packageData(projectId, null).catch(() => null);
  const expected = d?.manifest.scenes.map((s) => `shot_${s.id}`) ?? [];
  const expectedAnim = d?.manifest.scenes.filter((s) => s.animation).map((s) => `shot_${s.id}`) ?? [];
  const base: PipelineStatus = {
    available: ok, dir, slug, folder, exported: false, storyboardShots: 0, frames: [], anims: [], audio: [],
    hasVoiceClean: false, hasVoiceReport: false, hasPreview: false, hasFinal: false, finalSize: null,
    expectedShots: expected.length, expectedAnims: expectedAnim.length, missingFrames: expected, missingAnims: expectedAnim, updatedAt: null,
  };
  if (!ok || !(await exists(folder))) return base;
  const csv = await fs.readFile(path.join(folder, "storyboard.csv"), "utf8").catch(() => "");
  const frames = await list(path.join(folder, "frames"), /^shot_\d{3}\.(png|jpe?g|webp)$/i);
  const anims = await list(path.join(folder, "anims"), /^shot_\d{3}\.(mp4|mov|webm)$/i);
  const audio = await list(path.join(folder, "audio"), /\.(mp3|wav|m4a)$/i);
  const stem = (n: string) => n.replace(/\.\w+$/, "");
  const final = await fs.stat(path.join(folder, "final.mp4")).catch(() => null);
  const st = await fs.stat(folder).catch(() => null);
  return {
    ...base,
    exported: Boolean(csv),
    storyboardShots: csv ? csv.trim().split(/\n(?=\d+,)/).length - 1 : 0,
    frames, anims, audio,
    hasVoiceClean: await exists(path.join(folder, "audio", "voice.mp3")),
    hasVoiceReport: await exists(path.join(folder, "voice_report.md")),
    hasPreview: await exists(path.join(folder, "preview.mp4")),
    hasFinal: Boolean(final),
    finalSize: final?.size ?? null,
    missingFrames: expected.filter((e) => !frames.some((f) => stem(f) === e)),
    missingAnims: expectedAnim.filter((e) => !anims.some((f) => stem(f) === e)),
    updatedAt: st ? new Date(st.mtimeMs).toISOString() : null,
  };
}

/** Записывает раскадровку в папку конвейера. Существующие файлы сохраняются копией *.bak. */
export async function exportToPipeline(projectId: number) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Проект не найден");
  const { dir, ok } = await pipelineRoot();
  if (!ok) throw new Error(`Конвейер не найден: ${dir}. Путь меняется в Настройках → Канон канала.`);
  const d = await packageData(projectId, null);
  if (!d.ready) throw new Error("Нет утверждённых кадров — экспортировать нечего.");
  const canon = await getCanon();
  const slug = project.params.pipelineSlug ?? slugFor(project);
  const folder = path.join(dir, "videos", slug);
  for (const sub of ["refs", "frames", "anims", "audio"]) await fs.mkdir(path.join(folder, sub), { recursive: true });

  const st = await stepState(projectId);
  const castText = project.kind === "short" && project.params.parentId
    ? (await stepState(project.params.parentId))["cast"]?.approved?.output
    : st["cast"]?.approved?.output;
  const files: Record<string, string> = {
    "storyboard.csv": toStoryboardCsv(d.manifest),
    "style.md": toStyleMd({ slug, styleLine: effectiveStyle(canon, project.params, project.kind === "short"), animTemplate: canon.animTemplate, cast: parseCast(castText) }),
    "idea.md": [
      `# Идея ролика: ${slug}`, "", `Экспортировано из Ages Studio (проект #${project.id}) ${new Date().toLocaleString("ru-RU")}.`, "",
      `- Название: ${project.title}`,
      `- Роль: ${project.params.role ?? "—"}${project.params.place ? `, ${project.params.place}` : ""}${project.params.era ? `, ${project.params.era}` : ""}`,
      `- Длина: ~${project.params.durationMin ?? 9} мин, язык: ${project.params.language ?? "en"}`,
      project.params.structureKey && `- Структура: ${project.params.structureKey}, тип хука: ${project.params.hookTypeKey ?? "—"}`,
      project.params.chosenHook && `- Хук: ${project.params.chosenHook}`,
      project.params.answerWord && `- Разгадка (не в название и не на обложку): ${project.params.answerWord}`,
      "", "## Упаковка", d.packaging ?? "(не утверждена)",
    ].filter((x): x is string => typeof x === "string").join("\n") + "\n",
  };
  const written: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(folder, name);
    const prev = await fs.readFile(target, "utf8").catch(() => null);
    if (prev === content) continue;
    if (prev !== null) await fs.writeFile(`${target}.bak`, prev);
    await fs.writeFile(target, content);
    written.push(name);
  }
  const statusFile = path.join(folder, "status.json");
  if (!(await exists(statusFile))) {
    await fs.writeFile(statusFile, JSON.stringify({
      mode: "manual_generation", storyboard: "approved_in_ages_studio", shots: d.manifest.scenes.length,
      anims: d.manifest.scenes.filter((s) => s.animation).length, frames_completed: [], anims_completed: [],
      last_updated: new Date().toISOString(), source: `ages-studio project ${project.id}`,
    }, null, 2) + "\n");
    written.push("status.json");
  }
  if (!project.params.pipelineSlug) {
    const db = await getDb();
    await db.update(schema.projects).set({ params: { ...project.params, pipelineSlug: slug } }).where(eq(schema.projects.id, projectId));
  }
  return { folder, slug, written };
}
