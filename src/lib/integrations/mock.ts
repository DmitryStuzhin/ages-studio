import "server-only";
// ДЕМО-генератор. Пока Claude API не подключён, выдаёт ответы в точных форматах шагов,
// чтобы можно было пройти весь конвейер, увидеть гейты и собрать пакет видео.
// Содержание — заглушка, не для публикации.
import type { ProjectParams } from "@/db/schema";
import { structureByKey } from "@/lib/prompts/library";
import { parseScript, type ParsedScript } from "@/lib/pipeline/parse";

const DEMO = "⚠️ ДЕМО-ОТВЕТ: Claude API не подключён. Это заглушка в правильном формате — для проверки конвейера, не для публикации.\n\n";

const LINES = [
  "The sound comes first, low and wrong, from somewhere behind you.",
  "Your hands are shaking, and you have not eaten since yesterday.",
  "Nobody around you looks up. That should frighten you more.",
  "You take one step closer, and the ground answers back.",
  "The overseer counts heads again, slower this time.",
  "Your throat burns with every breath of this heavy air.",
  "Someone shouts a name you do not recognise yet.",
  "You could run now, but running here gets noticed.",
  "The light changes, and the shadow beside you grows longer.",
  "Your back remembers yesterday's load before your mind does.",
  "There is a choice in front of you, and both roads hurt.",
  "You pick the slower way, and the crowd swallows you.",
  "The man ahead of you stumbles, and nobody stops for him.",
  "You feel it before you see it, a warmth that is wrong.",
  "Every mistake here costs a ration, a finger, or a life.",
  "The water looks clean, but you have learned what clean means.",
  "You keep your head down and count the steps to safety.",
  "Something moves under the surface, and the line goes still.",
  "Your skin itches where the rope rubbed it raw this morning.",
  "And that is when the second bell begins to ring.",
];

function hourAt(i: number, n: number) {
  const h = 5 + Math.floor((i / n) * 19);
  return `${String(h % 24).padStart(2, "0")}:00`;
}

export function mockScript(params: ProjectParams, wpm = 155) {
  const s = structureByKey(params.structureKey);
  const N = s?.gates.threats[0] ?? 6;
  const target = (params.durationMin ?? 9) * 60;
  const totalWords = Math.round((target / 60) * wpm);
  const perFrame = 11;
  const nFrames = Math.max(40, Math.round(totalWords / perFrame));
  const intro = 5;
  const outro = Math.max(4, Math.round(nFrames * 0.05));
  const body = nFrames - intro - outro;
  const perBlock = Math.floor(body / N);
  const role = params.role ?? "worker";
  const lines: string[] = [DEMO];
  const pct = (i: number) => i / nFrames;
  const rehookAt = s ? Math.round(nFrames * ((s.gates.rehook[0] + s.gates.rehook[1]) / 2)) : Math.round(nFrames * 0.47);
  const answerAt = s ? Math.round(nFrames * Math.min(0.9, s.gates.answerMin + 0.06)) : Math.round(nFrames * 0.8);
  const falseAt = s?.gates.falseThreatBreakMax != null ? Math.round(nFrames * (s.gates.falseThreatBreakMax - 0.08)) : -1;
  const verdictAt = nFrames - outro + 1;
  let li = 0;
  for (let i = 1; i <= nFrames; i++) {
    const idx = i - 1;
    let threat: number | null = null;
    let beat = "";
    if (i <= 2) { threat = N; beat = "знак"; }
    else if (i > intro && i <= intro + perBlock * N) {
      const k = Math.floor((i - intro - 1) / perBlock);
      threat = k + 1;
      const within = (i - intro - 1) % perBlock;
      beat = ["знак", "эскалация", "выбор", "исход", "посев"][Math.min(4, Math.floor((within / perBlock) * 5))];
    } else if (i > intro + perBlock * N && i < verdictAt) { threat = N; beat = "раскрытие"; }
    const marks: string[] = [];
    if (i === rehookAt) marks.push("⚡");
    if (i === answerAt) marks.push("🔑");
    if (i === falseAt) marks.push("✖");
    if (i === verdictAt) marks.push("☠");
    if (threat && i > intro && i <= intro + perBlock * N && (i - intro) % perBlock === 0) marks.push(`🛡 ${threat}/${N}`);
    let voice: string;
    if (i === 1) voice = `You are a ${role}, and the ground beneath you just moved.`;
    else if (i === 2) voice = "Nobody else has noticed yet, and you cannot look away.";
    else if (i === 3) voice = `Today, ${N} things will try to end your day early.`;
    else if (i === 4) voice = "Most of them will warn you first. One of them will not.";
    else if (i === 5) voice = "It is still dark, and the first one is already here.";
    else if (i === verdictAt) voice = "This is what finally takes you, slowly, before the next dawn.";
    else voice = LINES[li++ % LINES.length];
    if (i === 6) { voice = "You count 40 men on the line, and two are already gone."; marks.push("📌 АКЦЕНТ: ЧИСЛО"); }
    const act = `Act ${Math.min(6, Math.floor(pct(idx) * 6) + 1)} - Demo`;
    lines.push(
      `Кадр ${String(i).padStart(3, "0")} · ${act} · ⏱ ${hourAt(idx, nFrames)}${threat ? ` · угроза ${threat} · такт: ${beat}` : ""} · напряжение ${Math.min(10, 6 + (i % 4))}/10${marks.length ? ` · метки: ${marks.join(" ")}` : ""}`,
      `Озвучка: «${voice}»`,
      `На экране: ${["от первого лица", "герой в кадре", "общий план"][i % 3]} · демо-описание сцены`,
      "",
    );
  }
  lines.push(`МОСТИК: Tomorrow, you wake up as ${params.nextRole ?? "someone else entirely"}.`);
  return lines.join("\n");
}

export function mockFrames(script: ParsedScript, params: ProjectParams, vertical = false) {
  const style = params.styleBlock?.trim() || "Hand-drawn illustration, muted earthy palette, ink outlines.";
  const ratio = vertical
    ? "9:16 vertical composition, subject fills the frame, key action in the middle, no important details in the top 15% and bottom 25%."
    : "16:9 horizontal composition, centered subject, plenty of negative space.";
  const frames = vertical ? script.frames.slice(0, 10) : script.frames;
  const out = [DEMO];
  frames.forEach((f, i) => {
    out.push(`Кадр ${vertical ? String(i + 1).padStart(3, "0") : f.id}`);
    out.push(`Озвучка: ${f.voice}`);
    out.push(`Промпт: A demo scene at ${f.hour ?? "dawn"} light. ${f.screen}. No text, no labels, no captions. ${style} ${ratio}`);
    out.push(`Референсы: char_you.png`);
    if (i % 5 === 0) out.push(`Анимация 🎬: Animate this hand-drawn illustration, perfectly preserving the original art style, line work, colors and composition. Subtle limited motion only: dust drifting in the light. Camera locked, no zoom, no pan. No new objects, no style change, no morphing, no 3D, no realism, no added text. Silent, no dialogue, no speech. Smooth subtle 2D motion.`);
    const edit = [f.hour && `⏱ ${f.hour}`, f.markers.shield && `🛡 ${f.markers.shield}`, f.markers.accent && `📌 АКЦЕНТ: ${f.markers.accent}`].filter(Boolean);
    if (edit.length) out.push(`Монтаж: ${edit.join(" · ")}`);
    if (vertical) out.push(`Источник: shot_${f.id}`);
    out.push("");
  });
  return out.join("\n");
}

export function mockOutput(stepKey: string, params: ProjectParams, ctx: { script?: string | null; wpm: number }): string {
  const role = params.role ?? "Pyramid Builder";
  switch (stepKey) {
    case "role":
      return DEMO + `| № | Роль + место/год | Подходящая структура | Главная угроза и источник | Спрос | Риск |
|---|---|---|---|---|---|
| 1 | Roman Gladiator, Capua, 73 BC | visible_wins | Инфекция ран — демо | нет данных | тема перенасыщена |
| 2 | Victorian Chimney Sweep, London, 1840 | the_system | Рак мошонки сажи — демо | нет данных | — |
| 3 | Medieval Plague Doctor, Venice, 1630 | the_witness | Заражение через одежду — демо | нет данных | — |
| 4 | Viking Raider, Lindisfarne, 793 | countdown | Переохлаждение — демо | нет данных | — |
| 5 | Aztec Ballplayer, Tenochtitlan, 1500 | fatal_choice | Ритуальный исход — демо | нет данных | спорные данные |

Рекомендую: №2 — структура «Система» ещё не использовалась.`;
    case "recon":
      return DEMO + `ДОСЬЕ: ${role}
1. Спрос: нет данных (сводка ниши пуста).
2. Конкуренты: нет данных.
3. Школьная картинка: демо.
4. Пробел: демо.
5. Голос зрителей: нет данных.
6. Уроки: «Почти вся потеря — в первые 60 секунд».
7. БАЗА ФАКТОВ:
Ф01 · Демо-факт один · доказано · Демо-источник, 2020
Ф02 · Демо-факт два · вероятно · Демо-источник, 2018
Ф03 · Демо-факт три · спорно · Демо-источник, 2015

Вывод: демо-угол.

| Пункт | ✅/❌ | Доказательство |
|---|---|---|
| Факты с источниками | ✅ | Ф01–Ф03 |`;
    case "angle":
      return DEMO + `1. Названия:
- Why You Wouldn't Survive 24 Hours as a ${role} ← рекомендую
- Why You Wouldn't Survive 24 Hours as a ${role} in Giza
- Why You Wouldn't Survive 24 Hours as an Ancient ${role}
2. Центральный вопрос: что убьёт тебя до рассвета?
3. РАЗГАДКА: parasites
4. Ложный ответ: камень. Правдивый механизм: демо.
5. Реальный человек: демо (Ф01).
6.
ХУК A: The rope above your head just snapped, and you are directly beneath it.
ХУК B: Forty tons of limestone are sliding, and your foot is caught.
ХУК C: The ramp under your feet is cracking, and the block keeps coming.
7. Контракт: Today, the stone will try three times. Something smaller tries all day.
8. ☠ Cause of death: what lived in the water`;
    case "threats":
      return DEMO + `ЖУРНАЛ УГРОЗ
| № | Час | Угроза | Тип | Ожидаемая/невидимая | Уверенность | Факт | На экране | Выбор | Улика | Посев |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 05:00 | Демо-угроза | тело | ожидаемая | доказано | Ф01 | — | — | — | — |

КАРТА: демо. Кривая: 7 → 6 → 7 → 8 → 9 → 10 → 7`;
    case "cast":
      return DEMO + `ФАЙЛ: char_you.png
ИМЯ: the young worker
ОПИСАНИЕ: A lean young man in a coarse linen kilt, shaved head, a pale scar across the left eyebrow.
РЕФЕРЕНС-ЛИСТ: Character reference sheet, four poses, plain light background, no text.`;
    case "script":
      return mockScript(params, ctx.wpm);
    case "audit": {
      const script = ctx.script ?? mockScript(params, ctx.wpm);
      const ps = parseScript(script, ctx.wpm);
      const clean = ps.frames.map((f) => f.voice).join(" ");
      const body = script.replace(DEMO, "");
      return DEMO + `1. АУДИТ: демо — по минутам «держит».
2. ФАКТЫ: демо — всё подтверждено.
3. АНТИШАБЛОН: демо.
4. ИСПРАВЛЕННЫЙ СЦЕНАРИЙ
${body}

5. ELEVENLABS:
\`\`\`
${clean}
\`\`\`
6. Произношение: нет.`;
    }
    case "packaging":
      return DEMO + `1. НАЗВАНИЕ: Why You Wouldn't Survive 24 Hours as a ${role}
2. ОПИСАНИЕ:
What really killed the people who built the pyramids? Демо-описание.

Sources:
- Демо-источник, https://example.org
3. ТЕГИ: ${Array.from({ length: 16 }, (_, i) => `demo tag ${i + 1}`).join(", ")}
4. ОБЛОЖКА: демо, кадр 001.
5. ГЛАВЫ: 0:00 Act 1`;
    case "review":
      return DEMO + `Данных меньше 100 просмотров из главной — выводы предварительные.
УРОК: Демо-урок про первые 30 секунд | ДОКАЗАТЕЛЬСТВО: 0:25, −20%
ПРАВКА ПРОМПТА: Демо-правка: требовать вторую угрозу до 0:20.`;
    case "s_select":
      return DEMO + `| угроза | черновик хука | кадры | на каком вопросе обрываем |
|---|---|---|---|
| Крокодил в канале | You're a boatman on the Nile, and something follows your boat. | 040–052 | Did the river let you go? |`;
    case "s_script":
      return DEMO + `ХУК A: You're a boatman on the Nile, and something follows your boat.
ХУК B: In ancient Egypt, a shallow river could kill you before noon.
ХУК C: The water is calm, but two eyes are watching your boat. ← лучший
ТЕКСТ: You're a boatman on the Nile, and something is following your boat. The river is shallow here. Your boat rides low, heavy with stone. One wrong move and you're in the water. A ripple. Then two eyes. You have no weapon, only a long wooden pole. You slap the water hard. You shout at the eyes. The eyes sink below the surface, and the ripple slowly turns away from you. The river let you go this time. So what is still waiting for you at sunset?
ПЕРВЫЙ КАДР: голос и текст «You're a boatman on the Nile», таймер, крупно — глаза над водой.`;
    case "s_frames": {
      const ps = parseScript(ctx.script ?? mockScript(params, ctx.wpm), ctx.wpm);
      return mockFrames(ps, params, true);
    }
    case "s_pack":
      return DEMO + `НАЗВАНИЕ: Something Is Following Your Boat on the Nile
ХЭШТЕГИ: #history #ancientegypt
ОПИСАНИЕ: One river, one boat, one pair of eyes.
Напоминание: «Связанное видео» → длинный ролик; ссылка в закреплённом комментарии.
ГРАФИК: через 3 часа после ролика, затем по одному в день 3 дня.`;
    default:
      return DEMO + "Нет демо-ответа для этого шага.";
  }
}
