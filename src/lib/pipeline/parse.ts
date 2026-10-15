// Разбор ответов модели в структуры. Форматы задаются промптами шагов (src/lib/prompts/v8.ts).

export type ScriptFrame = {
  num: number;
  id: string; // "001"
  meta: string;
  voice: string;
  screen: string;
  act: string | null;
  hour: string | null;
  threat: number | null;
  beat: string | null;
  tension: number | null;
  markers: {
    rehook: boolean; answer: boolean; falseBroken: boolean; verdict: boolean;
    shield: string | null; animate: boolean; accent: string | null; unverified: boolean;
  };
  words: number;
  start: number; // секунды
  end: number;
};

export type ParsedScript = { frames: ScriptFrame[]; bridge: string | null; totalWords: number; duration: number };

/** Теги Eleven v3 в квадратных скобках не произносятся и в счёт слов не идут. */
export function stripTags(s: string) {
  return s.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

export function countWords(s: string) {
  const m = stripTags(s).replace(/[«»"“”]/g, " ").match(/[\p{L}\p{N}][\p{L}\p{N}'’.,-]*/gu);
  return m ? m.length : 0;
}

export function fmtTime(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function unquote(s: string) {
  return s.trim().replace(/^[«"“]\s*/, "").replace(/\s*[»"”]$/, "").trim();
}

/** Если в ответе есть раздел «ИСПРАВЛЕННЫЙ СЦЕНАРИЙ» (шаг 7) — берём только его. */
export function isolateFinalScript(text: string) {
  const start = text.search(/ИСПРАВЛЕННЫЙ СЦЕНАРИЙ/i);
  if (start < 0) return text;
  const rest = text.slice(start);
  const end = rest.search(/\n\s*(?:#+\s*)?(?:\d+\.\s*)?(?:ЧИСТЫЙ ТЕКСТ|ELEVENLABS:)/i);
  return end > 0 ? rest.slice(0, end) : rest;
}

export function parseScript(text: string, wpm = 155): ParsedScript {
  const body = isolateFinalScript(text);
  const lines = body.split(/\r?\n/);
  const frames: ScriptFrame[] = [];
  let cur: Partial<ScriptFrame> | null = null;
  let bridge: string | null = null;

  const flush = () => {
    if (cur && cur.id) frames.push(cur as ScriptFrame);
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim().replace(/^[-—–*]\s*/, "");
    const head = line.match(/^\**\s*Кадр\s+(\d{1,4})\b(.*)$/i);
    if (head) {
      flush();
      const meta = head[2] ?? "";
      const num = parseInt(head[1], 10);
      const act = meta.match(/Act\s*\d+\s*[-–—:]\s*[^·|]+/i)?.[0]?.trim() ?? null;
      const hour = meta.match(/⏱\s*([0-2]?\d[:.]\d{2})/)?.[1] ?? null;
      const threat = meta.match(/угроза\s*(\d+)/i);
      const beat = meta.match(/такт[:\s«]*([^·»|]+)/i)?.[1]?.trim() ?? null;
      const tension = meta.match(/напряжение\s*(\d+)/i);
      cur = {
        num, id: String(num).padStart(3, "0"), meta: meta.trim(), voice: "", screen: "",
        act, hour, threat: threat ? parseInt(threat[1], 10) : null, beat,
        tension: tension ? parseInt(tension[1], 10) : null,
        markers: {
          rehook: meta.includes("⚡"),
          answer: meta.includes("🔑"),
          falseBroken: meta.includes("✖"),
          verdict: meta.includes("☠"),
          shield: meta.match(/🛡\s*(\d+\s*\/\s*\d+)/)?.[1]?.replace(/\s/g, "") ?? null,
          animate: meta.includes("🎬"),
          accent: meta.match(/📌\s*(?:АКЦЕНТ:?\s*)?([A-ZА-ЯЁ]{3,})/)?.[1] ?? null,
          unverified: /не проверено/i.test(meta),
        },
      };
      continue;
    }
    const m = line.match(/^МОСТИК:\s*(.+)$/i);
    if (m) { bridge = unquote(m[1]); continue; }
    if (!cur) continue;
    const v = line.match(/^Озвучка:\s*(.*)$/i);
    if (v) { cur.voice = unquote(v[1]); continue; }
    const sc = line.match(/^На экране:\s*(.*)$/i);
    if (sc) { cur.screen = sc[1].trim(); continue; }
  }
  flush();

  let t = 0;
  let total = 0;
  for (const f of frames) {
    f.words = countWords(f.voice);
    total += f.words;
    f.start = t;
    t += (f.words / wpm) * 60;
    f.end = t;
  }
  return { frames, bridge, totalWords: total, duration: t };
}

export function extractElevenLabs(text: string): string | null {
  const i = text.search(/ELEVENLABS:/i);
  if (i < 0) return null;
  const rest = text.slice(i + "ELEVENLABS:".length);
  const fenced = rest.match(/```[a-z]*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const stop = rest.search(/\n\s*(?:#+\s*)?\d+\.\s/);
  return (stop > 0 ? rest.slice(0, stop) : rest).trim() || null;
}

export type FrameSpec = {
  num: number;
  id: string;
  voice: string;
  prompt: string;
  refs: string[];
  animation: string | null;
  edit: string | null;
  source: string | null;
  accent: string | null;
};

export function parseFrames(text: string): FrameSpec[] {
  const out: FrameSpec[] = [];
  const blocks = text.split(/\n(?=\s*\**\s*Кадр\s+\d{1,4}\b)/i);
  for (const b of blocks) {
    const head = b.match(/^\s*\**\s*Кадр\s+(\d{1,4})/i);
    if (!head) continue;
    const num = parseInt(head[1], 10);
    const field = (name: string) => {
      const re = new RegExp(`^\\s*${name}[^:\\n]*:\\s*(.*)$`, "im");
      return b.match(re)?.[1]?.trim() ?? null;
    };
    const edit = field("Монтаж");
    out.push({
      num,
      id: String(num).padStart(3, "0"),
      voice: unquote(field("Озвучка") ?? ""),
      prompt: field("Промпт") ?? field("Промт") ?? "",
      refs: (field("Референсы") ?? "").split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean),
      animation: field("Анимация"),
      edit,
      source: field("Источник"),
      accent: edit?.match(/📌\s*(?:АКЦЕНТ:?\s*)?([A-ZА-ЯЁ]{3,})/)?.[1] ?? null,
    });
  }
  return out;
}

export function parseAngle(text: string) {
  const answerWord = text.match(/РАЗГАДКА:\s*(.+)/i)?.[1]?.trim().replace(/[«»"*]/g, "") ?? null;
  const hooks: { key: string; text: string }[] = [];
  for (const m of text.matchAll(/ХУК\s+([A-CА-В])\s*[:.]\s*(.+)/gi)) {
    hooks.push({ key: m[1].toUpperCase(), text: unquote(m[2].replace(/\*+/g, "")) });
  }
  const titles = [...text.matchAll(/(Why You Wouldn['’]t Survive 24 Hours as[^\n|*»"←(]+)/gi)].map((m) => m[1].trim().replace(/[\s.,;:—–-]+$/, ""));
  return { answerWord, hooks, titles: [...new Set(titles)] };
}

export function parsePackaging(text: string) {
  const title = text.match(/НАЗВАНИЕ:\s*(.+)/i)?.[1]?.trim().replace(/[«»*]/g, "") ?? null;
  const tags = text.match(/ТЕГИ:\s*(.+)/i)?.[1]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const descStart = text.search(/ОПИСАНИЕ:/i);
  let description: string | null = null;
  if (descStart >= 0) {
    const rest = text.slice(descStart + "ОПИСАНИЕ:".length);
    const stop = rest.search(/\n\s*(?:\d+\.\s*)?(?:ТЕГИ|ОБЛОЖКА|ГЛАВЫ|ХЭШТЕГИ)/i);
    description = (stop > 0 ? rest.slice(0, stop) : rest).trim();
  }
  const hashtags = text.match(/ХЭШТЕГИ:\s*(.+)/i)?.[1]?.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return { title, tags, description, hashtags };
}

export function parseShortScript(text: string) {
  const hooks = [...text.matchAll(/ХУК\s+([A-CА-В])\s*[:.]\s*(.+)/gi)].map((m) => unquote(m[2].replace(/\*+/g, "")));
  const i = text.search(/ТЕКСТ:/i);
  let body: string | null = null;
  if (i >= 0) {
    const rest = text.slice(i + 5).trim();
    const stop = rest.search(/\n\s*\n|\n\s*\d+\.\s|\n\s*ПЕРВЫЙ КАДР/i);
    body = unquote((stop > 0 ? rest.slice(0, stop) : rest).trim());
  }
  return { hooks, text: body };
}

export function parseReview(text: string) {
  const lessons = [...text.matchAll(/УРОК:\s*([^|\n]+)(?:\|\s*ДОКАЗАТЕЛЬСТВО:\s*([^\n]+))?/gi)].map((m) => ({
    text: m[1].trim(),
    evidence: (m[2] ?? "").trim(),
  }));
  const confirms = [...text.matchAll(/ПОДТВЕРЖДАЕТ:\s*([^\n]+)/gi)].map((m) => m[1].trim());
  const proposals = [...text.matchAll(/ПРАВКА ПРОМПТА:\s*([^\n]+)/gi)].map((m) => m[1].trim());
  return { lessons, confirms, proposals };
}
