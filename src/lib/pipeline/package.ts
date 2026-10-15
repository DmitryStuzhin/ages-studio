// Сборка «пакета видео»: один архив, который открывается в монтажке (FCPXML),
// собирается Claude Code по manifest.json или передаётся человеку-монтажёру.
import JSZip from "jszip";
import { countWords, fmtTime, parseFrames, type ParsedScript, type FrameSpec } from "./parse";

export type FrameCheck = {
  expected: string[];
  present: string[];
  missing: string[];
  extra: string[];
  badNames: string[];
  missingAnimations: string[];
  ok: boolean;
};

const IMG = /\.(png|jpe?g|webp)$/i;
const VID = /\.(mp4|mov|webm)$/i;

/** Проверка комплектности кадров по списку имён файлов (из папки Drive или локальной). */
export function checkFrames(specs: FrameSpec[], fileNames: string[]): FrameCheck {
  const base = (n: string) => n.split(/[\\/]/).pop()!;
  const names = fileNames.map(base).filter((n) => !n.startsWith("."));
  const expectedImg = specs.map((s) => `shot_${s.id}`);
  const expectedVid = specs.filter((s) => s.animation).map((s) => `shot_${s.id}`);
  const stems = new Map<string, string[]>();
  const badNames: string[] = [];
  for (const n of names) {
    const m = n.match(/^shot_(\d{3})\.(\w+)$/i);
    if (!m) { if (IMG.test(n) || VID.test(n)) badNames.push(n); continue; }
    const stem = `shot_${m[1]}`;
    stems.set(stem, [...(stems.get(stem) ?? []), n]);
  }
  const hasImg = (s: string) => (stems.get(s) ?? []).some((n) => IMG.test(n));
  const hasVid = (s: string) => (stems.get(s) ?? []).some((n) => VID.test(n));
  const missing = expectedImg.filter((s) => !hasImg(s) && !hasVid(s));
  const missingAnimations = expectedVid.filter((s) => !hasVid(s));
  const extra = [...stems.keys()].filter((s) => !expectedImg.includes(s));
  return {
    expected: expectedImg,
    present: [...stems.keys()].sort(),
    missing,
    extra,
    badNames,
    missingAnimations,
    ok: missing.length === 0 && badNames.length === 0,
  };
}

export type ManifestScene = {
  id: string;
  frame: string;
  animation: string | null;
  start: number;
  end: number;
  voice: string;
  screen: string | null;
  act: string | null;
  threat: number | null;
  beat: string | null;
  overlays: { clock: string | null; shield: string | null; accent: string | null; verdict: boolean };
  music: string | null;
  edit: string | null;
  refs: string[];
  imagePrompt: string;
  animationPrompt: string | null;
};

export type Manifest = {
  version: 1;
  project: { id: number; title: string; kind: "long" | "short"; role: string | null };
  format: { aspectRatio: "16:9" | "9:16"; width: number; height: number; fps: 30 };
  audio: { voiceover: string; timing: "estimated" | "elevenlabs"; wordsPerMinute: number; vooMuted: true };
  durationSec: number;
  verdictCard: string | null;
  bridge: string | null;
  scenes: ManifestScene[];
};

export function buildManifest(args: {
  projectId: number; title: string; kind: "long" | "short"; role: string | null;
  script: ParsedScript | null; framesText: string; wpm: number; verdictCard?: string | null;
}): Manifest {
  const specs = parseFrames(args.framesText);
  const byId = new Map(args.script?.frames.map((f) => [f.id, f]) ?? []);
  const vertical = args.kind === "short";
  let t = 0;
  const scenes: ManifestScene[] = specs.map((s) => {
    const sf = byId.get(s.id);
    const voice = s.voice || sf?.voice || "";
    const dur = Math.max(1.5, (countWords(voice) / args.wpm) * 60);
    const start = sf && !vertical ? sf.start : t;
    const end = sf && !vertical ? sf.end : t + dur;
    t = end;
    const edit = s.edit ?? "";
    return {
      id: s.id,
      frame: `frames/shot_${s.id}.png`,
      animation: s.animation ? `frames/shot_${s.id}.mp4` : null,
      start: +start.toFixed(2),
      end: +end.toFixed(2),
      voice,
      screen: sf?.screen ?? null,
      act: sf?.act ?? null,
      threat: sf?.threat ?? null,
      beat: sf?.beat ?? null,
      overlays: {
        clock: edit.match(/⏱\s*([0-2]?\d[:.]\d{2})/)?.[1] ?? sf?.hour ?? null,
        shield: edit.match(/🛡\s*(\d+\s*\/\s*\d+)/)?.[1]?.replace(/\s/g, "") ?? sf?.markers.shield ?? null,
        accent: s.accent ?? sf?.markers.accent ?? null,
        verdict: sf?.markers.verdict ?? false,
      },
      music: edit.match(/🎵\s*([^·]+)/)?.[1]?.trim() ?? null,
      edit: edit || null,
      refs: s.refs,
      imagePrompt: s.prompt,
      animationPrompt: s.animation,
    };
  });
  return {
    version: 1,
    project: { id: args.projectId, title: args.title, kind: args.kind, role: args.role },
    format: vertical ? { aspectRatio: "9:16", width: 1080, height: 1920, fps: 30 } : { aspectRatio: "16:9", width: 1920, height: 1080, fps: 30 },
    audio: { voiceover: "voiceover.mp3", timing: "estimated", wordsPerMinute: args.wpm, vooMuted: true },
    durationSec: +(scenes.at(-1)?.end ?? 0).toFixed(2),
    verdictCard: args.verdictCard ?? null,
    bridge: args.script?.bridge ?? null,
    scenes,
  };
}

function srtTime(sec: number) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
}

export function toSrt(m: Manifest) {
  const out: string[] = [];
  let n = 1;
  for (const s of m.scenes) {
    if (!s.voice) continue;
    // Не больше ~7 слов в строке субтитра: длинную реплику делим на две половины по времени.
    const ws = s.voice.split(/\s+/);
    const chunks = ws.length > 8 ? [ws.slice(0, Math.ceil(ws.length / 2)), ws.slice(Math.ceil(ws.length / 2))] : [ws];
    const span = (s.end - s.start) / chunks.length;
    chunks.forEach((c, i) => {
      out.push(String(n++), `${srtTime(s.start + span * i)} --> ${srtTime(s.start + span * (i + 1))}`, c.join(" "), "");
    });
  }
  return out.join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rt = (sec: number) => `${Math.round(sec * 30) * 100}/3000s`;

/** FCPXML 1.10: картинки и анимации на основной дорожке, озвучка под ними. Открывается в DaVinci Resolve, Final Cut, Premiere (через импорт XML). */
export function toFcpxml(m: Manifest) {
  const { width, height } = m.format;
  const assets: string[] = [];
  const clips: string[] = [];
  assets.push(`<format id="r1" name="FFVideoFormat${height}p30" frameDuration="100/3000s" width="${width}" height="${height}"/>`);
  assets.push(`<asset id="a0" name="voiceover" start="0s" duration="${rt(m.durationSec)}" hasAudio="1" audioSources="1" audioChannels="2"><media-rep kind="original-media" src="./voiceover.mp3"/></asset>`);
  m.scenes.forEach((s, i) => {
    const id = `a${i + 1}`;
    const file = s.animation ?? s.frame;
    const isVid = Boolean(s.animation);
    const dur = Math.max(1 / 30, s.end - s.start);
    assets.push(`<asset id="${id}" name="shot_${s.id}" start="0s" duration="${isVid ? "8s" : rt(dur)}" hasVideo="1" format="r1"${isVid ? ` hasAudio="1"` : ""}><media-rep kind="original-media" src="./${file}"/></asset>`);
    const note = [s.overlays.clock && `⏱ ${s.overlays.clock}`, s.overlays.shield && `🛡 ${s.overlays.shield}`, s.overlays.accent && `📌 ${s.overlays.accent}`, s.overlays.verdict && "☠"].filter(Boolean).join(" ");
    const inner = isVid ? `<adjust-volume amount="-96dB"/>` : "";
    const voice = i === 0 ? `<asset-clip ref="a0" lane="-1" offset="0s" name="voiceover" duration="${rt(m.durationSec)}" start="0s"/>` : "";
    clips.push(`<${isVid ? "asset-clip" : "video"} ref="${id}" offset="${rt(s.start)}" name="shot_${s.id}" duration="${rt(dur)}" start="0s">${inner}${voice}${note ? `<note>${esc(note)}</note>` : ""}</${isVid ? "asset-clip" : "video"}>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    ${assets.join("\n    ")}
  </resources>
  <library>
    <event name="${esc(m.project.title)}">
      <project name="${esc(m.project.title)}">
        <sequence format="r1" duration="${rt(m.durationSec)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            ${clips.join("\n            ")}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

export function toBrief(m: Manifest, packaging: string | null) {
  const v = m.format.aspectRatio === "9:16";
  return `# Бриф сборки: ${m.project.title}

Это пакет видео Illustrated Ages. Собери черновой ролик строго по \`manifest.json\`.

## Входные файлы
- \`manifest.json\` — сцены по порядку: кадр, анимация, начало/конец в секундах, текст озвучки, оверлеи.
- \`voiceover.mp3\` — озвучка (положи рядом; тайминги в манифесте: **${m.audio.timing === "estimated" ? `оценочные, ${m.audio.wordsPerMinute} слов/мин — выровняй по реальной озвучке` : "из ElevenLabs"}**).
- \`frames/shot_NNN.png\` и \`frames/shot_NNN.mp4\` — кадры и анимации из Flow. Имена совпадают с id сцен.
- \`subtitles.srt\` — субтитры.
- \`timeline.fcpxml\` — тот же таймлайн для DaVinci Resolve / Final Cut / Premiere.

## Правила
1. Формат ${m.format.width}×${m.format.height}, ${m.format.fps} fps.
2. Звук всех клипов Veo заглушён. В ролике только озвучка и музыка.
3. Если у сцены есть \`animation\` — используй видео, иначе картинку с очень лёгким наездом (zoom ≤ 3% за сцену, без панорам).
4. Оверлеи никогда не берутся из картинки, они рисуются поверх:
   - \`overlays.clock\` — часы «⏱ HH:MM» в начале акта;
   - \`overlays.shield\` — «🛡 Threats survived: n / N» после пережитой угрозы;
   - \`overlays.accent\` — акцентный кадр: дата/число впечатыванием или штампом, карта — прорисовкой линии;
   - \`overlays.verdict\` — карточка «☠ Cause of death: …»${m.verdictCard ? ` (текст: ${m.verdictCard})` : ""}.
5. Монтаж-склейка по концу фразы. Переходы — склейка, если в поле \`edit\` не сказано иное.
6. ${v ? "Без чёрных полос, без затемнения в первом кадре. Субтитры по словам по центру — с 1,5 секунды. Таймер обратного отсчёта до финального вопроса. На последней фразе — пауза в музыке." : "Музыка меняет настроение по актам (поле `music`)."}
7. Вывод: \`render/${m.format.aspectRatio === "9:16" ? "short" : "long"}_draft.mp4\`, H.264, AAC 192k.

## Проверь перед рендером
- все файлы из \`frames/\` на месте (см. \`frames_check.json\`);
- длительность ролика совпадает с озвучкой (${fmtTime(m.durationSec)} по оценке);
- ни одной сцены без кадра.
${packaging ? `\n## Упаковка\n${packaging}\n` : ""}`;
}

export async function buildZip(m: Manifest, extras: { voiceText: string | null; packaging: string | null; frameCheck: FrameCheck | null; promptsTxt: string }) {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(m, null, 2));
  zip.file("subtitles.srt", toSrt(m));
  zip.file("timeline.fcpxml", toFcpxml(m));
  zip.file("brief.md", toBrief(m, extras.packaging));
  zip.file("voiceover_text.txt", extras.voiceText ?? m.scenes.map((s) => s.voice).join(" "));
  zip.file("prompts.txt", extras.promptsTxt);
  if (extras.packaging) zip.file("packaging.md", extras.packaging);
  if (extras.frameCheck) zip.file("frames_check.json", JSON.stringify(extras.frameCheck, null, 2));
  zip.folder("frames")!.file("README.txt", "Положи сюда кадры shot_NNN.png и анимации shot_NNN.mp4 из Flow.\n");
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
