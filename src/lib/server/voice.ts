import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { getCanon, expandHome } from "./canon";
import { getProject, getSettings } from "./repo";
import { pipelineRoot, slugFor } from "./pipeline";
import { elevenKey, listVoices, getVoice, subscription, tts, writeDotEnv, type Subscription, type Voice } from "@/lib/integrations/elevenlabs";
import { voiceShots, splitParts, partText, type VoiceShot } from "@/lib/pipeline/voice-split";

// Озвучка из платформы: берёт колонку voice из storyboard.csv в папке ролика (источник правды —
// если ты правил реплики в конвейере, озвучатся твои правки), режет на части как voice_script.py
// и пишет audio/voice_01.mp3, voice_02.mp3 … Дальше — tools/check_voice.py, как и раньше.
// Прежние файлы из audio/ не удаляются, а переезжают в audio/_old/<время>/.

export const VOICE_MODELS = [
  { id: "eleven_v3", name: "Eleven v3 — теги [whispers], [tense], паузы" },
  { id: "eleven_multilingual_v2", name: "Multilingual v2 — без тегов, прочитает их вслух" },
] as const;

type Job = {
  projectId: number; kind: "full" | "fragment"; startedAt: string; finishedAt: string | null;
  total: number; done: number; files: string[]; error: string | null; chars: number;
};
const g = globalThis as unknown as { __voiceJobs?: Map<number, Job> };
const jobs = (g.__voiceJobs ??= new Map());
export const voiceJob = (projectId: number) => jobs.get(projectId) ?? null;

async function folderFor(projectId: number) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Проект не найден");
  const { dir, ok } = await pipelineRoot();
  if (!ok) throw new Error(`Конвейер не найден: ${dir}`);
  const slug = project.params.pipelineSlug ?? slugFor(project);
  return { project, dir, folder: path.join(dir, "videos", slug), slug };
}

async function loadShots(folder: string) {
  const csv = await fs.readFile(path.join(folder, "storyboard.csv"), "utf8").catch(() => null);
  if (!csv) throw new Error("В папке ролика нет storyboard.csv — сначала «Отправить в конвейер».");
  const shots = voiceShots(csv);
  const empty = shots.filter((s) => !s.text).map((s) => s.shot);
  if (empty.length) throw new Error(`Нет текста озвучки у кадров: ${empty.slice(0, 10).join(", ")}`);
  return shots;
}

export type VoicePlan = {
  keyWhere: "env" | "pipeline" | null;
  voiceId: string | null; voiceName: string | null; model: string;
  parts: { n: number; from: number; to: number; chars: number }[];
  chars: number; credits: number; shots: number;
  sub: Subscription | null; subError: string | null;
  existingAudio: string[];
  job: Job | null;
};

export async function voicePlan(projectId: number): Promise<VoicePlan | null> {
  const settings = await getSettings();
  const canon = await getCanon();
  const { key, where } = await elevenKey(expandHome(canon.pipelineDir));
  let folder: string;
  try { ({ folder } = await folderFor(projectId)); } catch { return null; }
  const shots = await loadShots(folder).catch(() => [] as VoiceShot[]);
  const parts = splitParts(shots).map((p, i) => ({ n: i + 1, from: p[0].shot, to: p.at(-1)!.shot, chars: partText(p).length }));
  const chars = parts.reduce((a, p) => a + p.chars, 0);
  let sub: Subscription | null = null;
  let subError: string | null = null;
  if (key) {
    try { sub = await subscription(key); } catch (e) { subError = e instanceof Error ? e.message : String(e); }
  }
  const existingAudio = (await fs.readdir(path.join(folder, "audio")).catch(() => [] as string[])).filter((n) => /\.(mp3|wav|m4a|flac)$/i.test(n) && n !== "voice.mp3");
  return {
    keyWhere: where, voiceId: settings.elevenlabs.voiceId || null, voiceName: settings.elevenlabs.voiceName || null, model: settings.elevenlabs.model,
    parts, chars, credits: Math.round(chars * settings.elevenlabs.creditsPerChar), shots: shots.length,
    sub, subError, existingAudio, job: voiceJob(projectId),
  };
}

async function requireVoice() {
  const settings = await getSettings();
  const canon = await getCanon();
  const { key } = await elevenKey(expandHome(canon.pipelineDir));
  if (!key) throw new Error("Нет ключа ElevenLabs: впиши его в Настройках → ElevenLabs.");
  if (!settings.elevenlabs.voiceId) throw new Error("Не выбран голос: Настройки → ElevenLabs.");
  return { key, settings };
}

function startJob(job: Job, work: (job: Job) => Promise<void>) {
  const running = jobs.get(job.projectId);
  if (running && !running.finishedAt) throw new Error("Озвучка этого ролика уже идёт — дождись окончания.");
  jobs.set(job.projectId, job);
  work(job)
    .catch((e) => { job.error = e instanceof Error ? e.message : String(e); })
    .finally(() => { job.finishedAt = new Date().toISOString(); });
}

/** Весь ролик → audio/voice_NN.mp3. Запускается в фоне, прогресс — voiceJob(). */
export async function startFullVoice(projectId: number) {
  const { key, settings } = await requireVoice();
  const { folder, project } = await folderFor(projectId);
  const parts = splitParts(await loadShots(folder));
  const audio = path.join(folder, "audio");
  await fs.mkdir(audio, { recursive: true });
  const job: Job = { projectId, kind: "full", startedAt: new Date().toISOString(), finishedAt: null, total: parts.length, done: 0, files: [], error: null, chars: parts.reduce((a, p) => a + partText(p).length, 0) };
  startJob(job, async (j) => {
    // Сначала все части во временную папку: если упадёт на середине, в audio/ не будет смеси старого и нового.
    const tmp = path.join(audio, "_work", `tts-${Date.now()}`);
    await fs.mkdir(tmp, { recursive: true });
    for (const [i, p] of parts.entries()) {
      const buf = await tts(key, { voiceId: settings.elevenlabs.voiceId, model: settings.elevenlabs.model, text: partText(p), language: project.params.language ?? settings.defaults.language });
      await fs.writeFile(path.join(tmp, `voice_${String(i + 1).padStart(2, "0")}.mp3`), buf);
      j.done = i + 1;
    }
    const old = (await fs.readdir(audio)).filter((n) => /\.(mp3|wav|m4a|flac)$/i.test(n));
    if (old.length) {
      const stash = path.join(audio, "_old", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
      await fs.mkdir(stash, { recursive: true });
      for (const n of old) await fs.rename(path.join(audio, n), path.join(stash, n));
    }
    for (const n of (await fs.readdir(tmp)).sort()) {
      await fs.rename(path.join(tmp, n), path.join(audio, n));
      j.files.push(`audio/${n}`);
    }
    await fs.rm(tmp, { recursive: true, force: true });
  });
}

/** Кусок для переозвучки (кадры from–to) → audio/_fixes/shots_042-047.mp3. Основные файлы не трогает. */
export async function startFragmentVoice(projectId: number, from: number, to: number) {
  const { key, settings } = await requireVoice();
  const { folder, project } = await folderFor(projectId);
  const shots = (await loadShots(folder)).filter((s) => s.shot >= Math.min(from, to) && s.shot <= Math.max(from, to));
  if (!shots.length) throw new Error("В этом диапазоне нет кадров.");
  const text = partText(shots);
  if (text.length > 4500) throw new Error("Слишком длинный кусок для одного запроса — возьми меньше кадров.");
  const name = `shots_${String(shots[0].shot).padStart(3, "0")}-${String(shots.at(-1)!.shot).padStart(3, "0")}`;
  const dir = path.join(folder, "audio", "_fixes");
  await fs.mkdir(dir, { recursive: true });
  const job: Job = { projectId, kind: "fragment", startedAt: new Date().toISOString(), finishedAt: null, total: 1, done: 0, files: [], error: null, chars: text.length };
  startJob(job, async (j) => {
    const buf = await tts(key, { voiceId: settings.elevenlabs.voiceId, model: settings.elevenlabs.model, text, language: project.params.language ?? settings.defaults.language });
    let file = path.join(dir, `${name}.mp3`);
    for (let v = 2; await fs.stat(file).then(() => true).catch(() => false); v++) file = path.join(dir, `${name}_v${v}.mp3`);
    await fs.writeFile(file, buf);
    j.done = 1;
    j.files.push(`audio/_fixes/${path.basename(file)}`);
  });
}

// ---------- Настройки ----------

export type ElevenState = { keyWhere: "env" | "pipeline" | null; sub: Subscription | null; voices: Voice[]; current: Voice | null; error: string | null; pipelineEnv: string };

export async function elevenState(): Promise<ElevenState> {
  const canon = await getCanon();
  const settings = await getSettings();
  const dir = expandHome(canon.pipelineDir);
  const pipelineEnv = path.join(dir, ".env");
  const { key, where } = await elevenKey(dir);
  if (!key) return { keyWhere: null, sub: null, voices: [], current: null, error: null, pipelineEnv };
  try {
    const [sub, voices] = await Promise.all([subscription(key), listVoices(key)]);
    const id = settings.elevenlabs.voiceId;
    const current = !id ? null : voices.find((v) => v.id === id) ?? (await getVoice(key, id).catch(() => null))
      ?? { id, name: settings.elevenlabs.voiceName || id, category: "по ID", labels: "", tags: [], description: "", preview: null };
    return { keyWhere: where, sub, voices, current, error: null, pipelineEnv };
  } catch (e) {
    return { keyWhere: where, sub: null, voices: [], current: null, error: e instanceof Error ? e.message : String(e), pipelineEnv };
  }
}

async function keyOnly() {
  const canon = await getCanon();
  const { key } = await elevenKey(expandHome(canon.pipelineDir));
  if (!key) throw new Error("Сначала сохрани ключ ElevenLabs.");
  return key;
}

export async function lookupVoice(id: string) {
  const clean = id.trim().replace(/^.*[/=]/, ""); // можно вставить ссылку на голос целиком
  if (!/^[A-Za-z0-9]{10,40}$/.test(clean)) throw new Error("ID голоса — 20 латинских букв и цифр, например 21m00Tcm4TlvDq8ikWAM.");
  return { id: clean, voice: await getVoice(await keyOnly(), clean) };
}

/** Пробная фраза голосом — тратит столько кредитов, сколько в ней символов. */
export async function testVoice(id: string, model: string, text: string) {
  const t = text.trim().slice(0, 300);
  if (!t) throw new Error("Пустая фраза");
  const buf = await tts(await keyOnly(), { voiceId: id, model, text: t });
  return { audio: `data:audio/mpeg;base64,${buf.toString("base64")}`, chars: t.length };
}

/** Ключ хранится в .env конвейера: его же читают check_voice.py и voice.py. */
export async function saveElevenKey(key: string) {
  const k = key.trim();
  if (!/^sk_[A-Za-z0-9]{20,}$/.test(k)) throw new Error("Ключ ElevenLabs начинается с sk_ — проверь, что скопирован целиком.");
  const { dir, ok } = await pipelineRoot();
  if (!ok) throw new Error(`Конвейер не найден: ${dir}`);
  await subscription(k); // проверяем до записи
  await writeDotEnv(path.join(dir, ".env"), { ELEVENLABS_API_KEY: k });
}

export async function syncVoiceToPipelineEnv(voiceId: string, model: string) {
  const { dir, ok } = await pipelineRoot();
  if (ok) await writeDotEnv(path.join(dir, ".env"), { ELEVENLABS_VOICE_ID: voiceId, ELEVENLABS_MODEL: model });
}
