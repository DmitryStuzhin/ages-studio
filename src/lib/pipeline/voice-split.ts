// Разбивка озвучки на части — тот же алгоритм, что в tools/voice_script.py конвейера,
// чтобы voice_01.mp3, voice_02.mp3 … из платформы совпадали с частями voice_script.txt.

export type VoiceShot = { shot: number; text: string; scene: string; actStart: boolean };

/** RFC 4180: кавычки, запятые и переводы строк внутри ячеек. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

export function voiceShots(csv: string): VoiceShot[] {
  return parseCsv(csv).map((r) => ({
    shot: Number(r.shot),
    text: (r.voice ?? "").split(/\s+/).filter(Boolean).join(" "),
    scene: r.scene ?? "",
    actStart: (r.notes ?? "").includes("⏱"),
  })).filter((s) => Number.isFinite(s.shot));
}

export function splitParts(shots: VoiceShot[], maxChars = 2500): VoiceShot[][] {
  const parts: VoiceShot[][] = [];
  let cur: VoiceShot[] = [];
  let size = 0;
  const len = (xs: VoiceShot[]) => xs.reduce((a, x) => a + x.text.length + 1, 0);
  for (const s of shots) {
    const add = s.text.length + 1;
    if (cur.length && size + add > maxChars) {
      let cut = cur.length;
      for (let k = cur.length - 1; k > 0; k--) {
        if (cur[k].actStart) {
          if (len(cur.slice(0, k)) >= maxChars * 0.6) cut = k;
          break;
        }
      }
      parts.push(cur.slice(0, cut));
      cur = cur.slice(cut);
      size = len(cur);
    }
    cur.push(s);
    size += add;
  }
  if (cur.length) parts.push(cur);
  return parts;
}

export const partText = (p: VoiceShot[]) => p.map((s) => s.text).join(" ");
