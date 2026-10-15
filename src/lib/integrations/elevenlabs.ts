import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

// ElevenLabs. Ключ ищется в двух местах по порядку:
//   1) ELEVENLABS_API_KEY в окружении (.env.local платформы);
//   2) файл .env в папке конвейера (~/illustrated-ages-pipeline/.env) — тот же ключ берут
//      tools/check_voice.py и tools/voice.py, так что он хранится в одном месте.
// Файл читается при каждом вызове: новый ключ работает без перезапуска.

const BASE = process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io";

export async function readDotEnv(file: string): Promise<Record<string, string>> {
  const text = await fs.readFile(file, "utf8").catch(() => "");
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** Обновляет или добавляет строки KEY=value в .env, остальное не трогает. */
export async function writeDotEnv(file: string, patch: Record<string, string>) {
  const text = await fs.readFile(file, "utf8").catch(() => "");
  const lines = text ? text.split(/\r?\n/) : ["# Ключи конвейера. Читают tools/*.py и Ages Studio. Не публикуй этот файл."];
  for (const [k, v] of Object.entries(patch)) {
    const i = lines.findIndex((l) => new RegExp(`^\\s*(?:export\\s+)?${k}\\s*=`).test(l));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.splice(lines.length && lines.at(-1) === "" ? lines.length - 1 : lines.length, 0, `${k}=${v}`);
  }
  await fs.writeFile(file, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
}

export async function elevenKey(pipelineDir: string): Promise<{ key: string | null; where: "env" | "pipeline" | null }> {
  if (process.env.ELEVENLABS_API_KEY) return { key: process.env.ELEVENLABS_API_KEY, where: "env" };
  const env = await readDotEnv(path.join(pipelineDir, ".env"));
  return env.ELEVENLABS_API_KEY ? { key: env.ELEVENLABS_API_KEY, where: "pipeline" } : { key: null, where: null };
}

async function call(key: string, p: string, init?: RequestInit & { timeoutMs?: number }) {
  const res = await fetch(BASE + p, {
    ...init,
    headers: { "xi-api-key": key, ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
    signal: AbortSignal.timeout(init?.timeoutMs ?? 30000),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = body.slice(0, 300);
    try {
      const j = JSON.parse(body);
      msg = j.detail?.message ?? j.detail?.status ?? (typeof j.detail === "string" ? j.detail : msg);
    } catch { /* не JSON */ }
    const hint = res.status === 401 ? " — ключ не принят (проверь, что он скопирован целиком и у него есть нужные права)"
      : res.status === 402 || /quota/i.test(msg) ? " — не хватает кредитов" : "";
    throw new Error(`ElevenLabs ${res.status}: ${msg}${hint}`);
  }
  return res;
}

export type Voice = { id: string; name: string; category: string; labels: string; tags: string[]; description: string; preview: string | null };

type RawVoice = { voice_id: string; name?: string; category?: string; labels?: Record<string, string>; preview_url?: string | null; description?: string | null };
const LABEL_RU: Record<string, string> = {
  male: "мужской", female: "женский", neutral: "нейтральный", young: "молодой", "middle aged": "средних лет", "middle-aged": "средних лет", old: "пожилой",
  american: "американский", british: "британский", australian: "австралийский", irish: "ирландский", "us": "американский",
  narration: "дикторский", narrative_story: "рассказчик", "narrative & story": "рассказчик", informative_educational: "образовательный", conversational: "разговорный",
  characters_animation: "персонажи", social_media: "соцсети", entertainment_tv: "ТВ", advertisement: "реклама",
  calm: "спокойный", deep: "глубокий", warm: "тёплый", raspy: "хрипловатый", confident: "уверенный", casual: "непринуждённый", crisp: "чёткий",
};
const ru = (v: string) => LABEL_RU[v.toLowerCase()] ?? v.replace(/_/g, " ");
function toVoice(v: RawVoice): Voice {
  const tags = Object.entries(v.labels ?? {}).filter(([k, x]) => x && k !== "language").map(([, x]) => ru(x));
  return {
    id: v.voice_id, name: v.name ?? v.voice_id, category: v.category ?? "",
    labels: tags.join(", "), tags, description: (v.description ?? "").trim(), preview: v.preview_url ?? null,
  };
}

export async function listVoices(key: string): Promise<Voice[]> {
  const j = await (await call(key, "/v1/voices")).json() as { voices?: RawVoice[] };
  return (j.voices ?? []).map(toVoice)
    .sort((a, b) => (a.category === "premade" ? 1 : 0) - (b.category === "premade" ? 1 : 0) || a.name.localeCompare(b.name));
}

/** Голос по ID: свой, стандартный или добавленный из библиотеки. null — если ElevenLabs его не отдаёт этому ключу. */
export async function getVoice(key: string, id: string): Promise<Voice | null> {
  try {
    return toVoice(await (await call(key, `/v1/voices/${encodeURIComponent(id)}`)).json() as RawVoice);
  } catch (e) {
    if (e instanceof Error && /ElevenLabs (400|404|422)/.test(e.message)) return null;
    throw e;
  }
}

export type Subscription = { tier: string; used: number; limit: number; resetAt: string | null };

export async function subscription(key: string): Promise<Subscription> {
  const j = await (await call(key, "/v1/user/subscription")).json() as { tier?: string; character_count?: number; character_limit?: number; next_character_count_reset_unix?: number };
  return {
    tier: j.tier ?? "", used: j.character_count ?? 0, limit: j.character_limit ?? 0,
    resetAt: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}

/** Текст → mp3. Для eleven_v3 теги [whispers], [short pause] и т. п. работают прямо в тексте. */
export async function tts(key: string, opts: { voiceId: string; model: string; text: string; language?: string; seed?: number }) {
  const res = await call(key, `/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    timeoutMs: 300000,
    body: JSON.stringify({
      text: opts.text, model_id: opts.model,
      ...(opts.language ? { language_code: opts.language } : {}),
      ...(opts.seed != null ? { seed: opts.seed } : {}),
    }),
  });
  return Buffer.from(await res.arrayBuffer());
}
