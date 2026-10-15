// Механические гейты. Всё, что можно проверить без модели, проверяет код:
// бесплатно, мгновенно и одинаково каждый раз. Смысловые гейты остаются в ответе модели.
import type { GateResult, ProjectParams } from "@/db/schema";
import type { Structure } from "@/lib/prompts/library";
import {
  countWords, fmtTime, parseAngle, parseFrames, parsePackaging, parseScript, parseShortScript,
  extractElevenLabs, type ParsedScript,
} from "./parse";

export type GateInput = {
  output: string;
  params: ProjectParams;
  structure: Structure | null;
  wpm: number;
  pastScripts: { title: string; text: string }[];
  approvedScript?: ParsedScript | null;
  styleBlock?: string;
  recentHookTypes?: string[];
  recentStructures?: string[];
};

const pass = (id: string, label: string, detail: string): GateResult => ({ id, label, status: "pass", detail });
const fail = (id: string, label: string, detail: string): GateResult => ({ id, label, status: "fail", detail });
const warn = (id: string, label: string, detail: string): GateResult => ({ id, label, status: "warn", detail });
const pc = (x: number) => Math.round(x * 100);
const info = (id: string, label: string, detail: string): GateResult => ({ id, label, status: "info", detail });

// Фразы, которые обезвреживают угрозу или превращают сцену в лекцию.
export const FORBIDDEN: { re: RegExp; why: string; onlyFirstMinute?: boolean }[] = [
  { re: /\bwon['’]t kill you\b/i, why: "обезвреживает угрозу до исхода" },
  { re: /\bisn['’]t the answer\b/i, why: "обезвреживает угрозу до исхода" },
  { re: /\bneither is the answer\b/i, why: "обезвреживает угрозу до исхода" },
  { re: /\byou['’]ll survive\b/i, why: "анонсирует выживание" },
  { re: /\bis the one you survive\b/i, why: "анонсирует выживание" },
  { re: /\baccording to\b/i, why: "лекция-сноска" },
  { re: /\bhistorians (?:think|believe|say|argue)\b/i, why: "лекция-сноска (допустимо одно «historians still argue» на спорный факт)" },
  { re: /\blet['’]s start with\b/i, why: "разгоняющая пустая фраза" },
  { re: /\bto understand this\b/i, why: "разгоняющая пустая фраза" },
  { re: /\bso,? to sum up\b/i, why: "разгоняющая пустая фраза" },
  { re: /\byou (?:can )?finally (?:breathe|relax)\b/i, why: "сцена облегчения до приговора" },
  { re: /\bit['’]s (?:all )?over now\b/i, why: "сцена облегчения до приговора" },
  { re: /\blet['’]s go back to\b/i, why: "флешбэк: допустим одной фразой, сразу за ним угроза — проверь" },
  { re: /\b(?:archaeologists|we know from|excavat\w+)\b/i, why: "раскопки и учёные до 1:00", onlyFirstMinute: true },
  { re: /\bin (?:18|19|20)\d{2},/i, why: "год находки в озвучке до 1:00", onlyFirstMinute: true },
  { re: /\bdid you know\b/i, why: "запрещённое начало" },
];

const NAME_STOP = new Set(
  ("You I The A An And But Or So If When Then Your It It's That This There They He She We His Her Their Its Not No Yes " +
    "One Two Three Four Five Six Seven Eight Nine Ten Today Tonight Tomorrow Morning Noon Midnight Dawn Dusk " +
    "Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December " +
    "BC AD God Gods Act Every Some All Now Here Why What Who How Where Because Nobody Everyone Someone Something Nothing").split(" "),
);

function properNames(text: string) {
  const found = new Map<string, number>();
  for (const sentence of text.split(/(?<=[.!?…])\s+|\n+/)) {
    const words = sentence.trim().split(/\s+/);
    words.forEach((w, i) => {
      const clean = w.replace(/^[«"“'(]+|[»"”'),.!?:;…]+$/g, "");
      if (i === 0 || !/^[A-Z][a-z]{2,}/.test(clean)) return;
      if (NAME_STOP.has(clean)) return;
      found.set(clean, (found.get(clean) ?? 0) + 1);
    });
  }
  return found;
}

function words(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, " ").split(/\s+/).filter(Boolean);
}
function ngrams(ws: string[], n: number) {
  const out = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(" "));
  return out;
}
const SERIES_FORMULA = /survive 24 hours|24 hours as|you wouldn't survive/;

/** Совпадения с прошлыми сценариями: общие 6-граммы во вступлении и доля общих 3-грамм. */
export function similarityReport(current: string, past: { title: string; text: string }[]) {
  const curWords = words(current);
  const head = curWords.slice(0, 160);
  const cur6 = ngrams(head, 6);
  const cur3 = ngrams(curWords, 3);
  return past.map((p) => {
    const pw = words(p.text);
    const p6 = ngrams(pw.slice(0, 160), 6);
    const shared = [...cur6].filter((g) => p6.has(g) && !SERIES_FORMULA.test(g));
    const p3 = ngrams(pw, 3);
    let inter = 0;
    for (const g of cur3) if (p3.has(g)) inter++;
    const jaccard = cur3.size + p3.size - inter > 0 ? inter / (cur3.size + p3.size - inter) : 0;
    return { title: p.title, shared, jaccard };
  });
}

function rotationGates(input: GateInput): GateResult[] {
  const out: GateResult[] = [];
  const s = input.params.structureKey;
  if (s && input.recentStructures?.includes(s))
    out.push(fail("rot-structure", "Чередование структур", `Структура «${s}» уже была в последних роликах — шаблонность.`));
  else if (s) out.push(pass("rot-structure", "Чередование структур", "Структура не повторяет последние ролики."));
  const h = input.params.hookTypeKey;
  if (h && input.recentHookTypes?.includes(h))
    out.push(fail("rot-hook", "Чередование типов хука", `Тип хука «${h}» уже был в последних роликах.`));
  else if (h) out.push(pass("rot-hook", "Чередование типов хука", "Тип хука не повторяет последние ролики."));
  return out;
}

export function scriptGates(input: GateInput): GateResult[] {
  const out: GateResult[] = [];
  const sc = parseScript(input.output, input.wpm);
  const { frames } = sc;
  if (frames.length === 0) {
    return [fail("parse", "Формат сценария", "Не найдено ни одного кадра «Кадр 001 … / Озвучка: … / На экране: …».")];
  }

  // Нумерация
  const gaps: string[] = [];
  frames.forEach((f, i) => { if (f.num !== i + 1) gaps.push(`№${i + 1}→${f.id}`); });
  out.push(gaps.length ? fail("numbering", "Сквозная нумерация", `Сбой: ${gaps.slice(0, 6).join(", ")}`) : pass("numbering", "Сквозная нумерация", `${frames.length} кадров, 001–${frames.at(-1)!.id}`));

  // Пустые реплики
  const empty = frames.filter((f) => !f.voice);
  if (empty.length) out.push(fail("empty", "Реплики заполнены", `Без озвучки: ${empty.map((f) => f.id).join(", ")}`));

  // Хронометраж
  const target = (input.params.durationMin ?? 9) * 60;
  const dev = (sc.duration - target) / target;
  const durText = `${sc.totalWords} слов → ${fmtTime(sc.duration)} при ${input.wpm} сл/мин, цель ${fmtTime(target)}`;
  out.push(Math.abs(dev) <= 0.1 ? pass("duration", "Хронометраж", durText) : Math.abs(dev) <= 0.2 ? warn("duration", "Хронометраж", durText) : fail("duration", "Хронометраж", durText));

  // Длина реплик
  const long = frames.filter((f) => f.words > 14);
  const short = frames.filter((f) => f.words > 0 && f.words < 5);
  out.push(long.length ? fail("line-len", "Реплика ≤14 слов", `Длинные: ${long.map((f) => `${f.id} (${f.words})`).slice(0, 10).join(", ")}`) : pass("line-len", "Реплика ≤14 слов", "Все реплики в норме."));
  if (short.length > frames.length * 0.25) out.push(warn("line-short", "Слишком дробные кадры", `${short.length} реплик короче 5 слов — кадр сменится быстрее 2 секунд.`));

  // Запрещённые фразы
  const hits: string[] = [];
  for (const f of frames) {
    for (const rule of FORBIDDEN) {
      if (rule.onlyFirstMinute && f.start > 60) continue;
      if (rule.re.test(f.voice)) hits.push(`${f.id} @${fmtTime(f.start)}: «${f.voice.match(rule.re)![0]}» — ${rule.why}`);
    }
  }
  out.push(hits.length ? fail("forbidden", "Запрещённые паттерны", hits.slice(0, 8).join("\n")) : pass("forbidden", "Запрещённые паттерны", "Не найдено."));

  // Первые 30 секунд: угрозы
  const firstThreat = frames.find((f) => f.threat != null);
  if (!firstThreat) out.push(warn("threat-tags", "Метки угроз", "В строках «Кадр» нет «угроза N» — позиции угроз не проверить."));
  else {
    out.push(firstThreat.start <= 30 ? pass("first-threat", "Первая угроза ≤0:30", `Кадр ${firstThreat.id} @${fmtTime(firstThreat.start)}`) : fail("first-threat", "Первая угроза ≤0:30", `Кадр ${firstThreat.id} @${fmtTime(firstThreat.start)}`));
    const second = frames.find((f) => f.threat != null && f.threat !== firstThreat.threat);
    if (second) out.push(second.start <= 30 ? pass("second-threat", "Вторая угроза до 0:30", `Кадр ${second.id} @${fmtTime(second.start)}`) : fail("second-threat", "Вторая угроза до 0:30", `Кадр ${second.id} @${fmtTime(second.start)}`));
    // окна без угрозы
    let gapStart: number | null = null;
    let worst = 0;
    let worstAt = 0;
    for (const f of frames) {
      if (f.threat == null) { if (gapStart == null) gapStart = f.start; }
      else if (gapStart != null) { if (f.start - gapStart > worst) { worst = f.start - gapStart; worstAt = gapStart; } gapStart = null; }
    }
    out.push(worst > 15 ? fail("no-threat-window", "Окно без угрозы ≤15 с", `${Math.round(worst)} с с ${fmtTime(worstAt)}`) : pass("no-threat-window", "Окно без угрозы ≤15 с", worst ? `Максимум ${Math.round(worst)} с` : "Угроза активна везде"));
    // длина блоков угроз
    // Блок угрозы — самый длинный непрерывный отрезок кадров с этой угрозой
    // (посевы и возвраты угрозы в финале — отдельные короткие отрезки, их не считаем).
    const blocks = new Map<number, { s: number; e: number }>();
    let runStart: { n: number; s: number } | null = null;
    frames.forEach((f, i) => {
      const n = f.threat;
      if (runStart && runStart.n !== n) runStart = null;
      if (n != null && !runStart) runStart = { n, s: f.start };
      const next = frames[i + 1];
      if (runStart && (!next || next.threat !== runStart.n)) {
        const prevB = blocks.get(runStart.n);
        if (!prevB || f.end - runStart.s > prevB.e - prevB.s) blocks.set(runStart.n, { s: runStart.s, e: f.end });
        runStart = null;
      }
    });
    const bad = [...blocks.entries()].filter(([, b]) => b.e - b.s < 45 || b.e - b.s > 80);
    out.push(bad.length ? warn("block-len", "Блок угрозы 45–80 с", bad.map(([n, b]) => `угроза ${n}: ${Math.round(b.e - b.s)} с`).join(", ")) : pass("block-len", "Блок угрозы 45–80 с", `${blocks.size} блоков в норме`));
    const n = blocks.size;
    if (input.structure) {
      const [a, b] = input.structure.gates.threats;
      out.push(n >= a && n <= b ? pass("threat-count", "Число угроз", `${n} (структура: ${a}–${b})`) : warn("threat-count", "Число угроз", `${n}, структура требует ${a}–${b}`));
    }
  }

  // Позиции меток по структуре
  const total = sc.duration || 1;
  const pos = (f?: { start: number }) => (f ? f.start / total : null);
  const g = input.structure?.gates;
  if (g) {
    const rehook = frames.find((f) => f.markers.rehook);
    const p = pos(rehook);
    out.push(p == null ? fail("rehook", "⚡ Повторный хук", "Метка ⚡ не найдена") : p >= g.rehook[0] && p <= g.rehook[1] ? pass("rehook", "⚡ Повторный хук", `${Math.round(p * 100)}% (окно ${pc(g.rehook[0])}–${pc(g.rehook[1])}%)`) : fail("rehook", "⚡ Повторный хук", `${Math.round(p * 100)}%, окно ${pc(g.rehook[0])}–${pc(g.rehook[1])}%`));
    const ans = frames.find((f) => f.markers.answer);
    const pa = pos(ans);
    out.push(pa == null ? fail("answer", "🔑 Ответ не раньше порога", "Метка 🔑 не найдена") : pa >= g.answerMin ? pass("answer", "🔑 Ответ не раньше порога", `${Math.round(pa * 100)}% (≥${pc(g.answerMin)}%)`) : fail("answer", "🔑 Ответ не раньше порога", `${Math.round(pa * 100)}% — раньше ${pc(g.answerMin)}%`));
    if (g.falseThreatBreakMax != null) {
      const fb = frames.find((f) => f.markers.falseBroken);
      const pf = pos(fb);
      out.push(pf == null ? warn("false-threat", "✖ Ложная угроза сломана", "Метка ✖ не найдена") : pf <= g.falseThreatBreakMax ? pass("false-threat", "✖ Ложная угроза сломана", `${Math.round(pf * 100)}%`) : fail("false-threat", "✖ Ложная угроза сломана", `${Math.round(pf * 100)}%, позже ${pc(g.falseThreatBreakMax)}%`));
    }
  }

  // Вердикт и хвост
  const verdict = frames.find((f) => f.markers.verdict);
  if (!verdict) out.push(fail("verdict", "☠ Вердикт", "Метка ☠ не найдена"));
  else {
    const tail = sc.duration - verdict.start;
    out.push(tail <= 30 ? pass("verdict-tail", "После вердикта ≤30 с", `${Math.round(tail)} с`) : fail("verdict-tail", "После вердикта ≤30 с", `${Math.round(tail)} с`));
  }

  // Счётчик угроз
  const shields = frames.filter((f) => f.markers.shield);
  if (shields.length) {
    const denoms = new Set(shields.map((f) => f.markers.shield!.split("/")[1]));
    out.push(denoms.size === 1 ? pass("shield", "🛡 Счётчик", `${shields.length} отметок, знаменатель ${[...denoms][0]}`) : fail("shield", "🛡 Счётчик", `Разные знаменатели: ${[...denoms].join(", ")}`));
  } else out.push(warn("shield", "🛡 Счётчик", "Ни одной отметки 🛡 n/N"));

  // Акцентные кадры для дат и сумм
  const missing = frames.filter((f) => /\b\d{3,4}\s?(?:BC|AD|BCE|CE)\b|\b1[0-9]{3}\b|\$\s?\d|\b\d{2,}\b/.test(f.voice) && !f.markers.accent);
  out.push(missing.length ? warn("accent", "📌 Акцент на каждую дату и число", `Без акцента: ${missing.map((f) => f.id).slice(0, 10).join(", ")}`) : pass("accent", "📌 Акцент на каждую дату и число", "Все даты и числа с акцентным кадром."));

  // Имена
  const names = properNames(frames.map((f) => f.voice).join("\n"));
  const nameList = [...names.keys()];
  out.push(nameList.length > 6 ? warn("names", "Собственные имена ≤3 (эвристика)", `Кандидаты: ${nameList.join(", ")}. Топонимы не считаются — проверь глазами.`) : info("names", "Собственные имена ≤3 (эвристика)", nameList.length ? `Кандидаты: ${nameList.join(", ")}` : "Не найдено"));

  // Непроверенные факты
  const unv = frames.filter((f) => f.markers.unverified);
  if (unv.length) out.push(fail("unverified", "Непроверенные факты", `Кадры с [не проверено]: ${unv.map((f) => f.id).join(", ")}`));

  // Мостик
  out.push(sc.bridge ? pass("bridge", "Мостик к следующей роли", sc.bridge) : warn("bridge", "Мостик к следующей роли", "Строка «МОСТИК: …» не найдена"));

  // Текст ElevenLabs (шаг 7)
  const eleven = extractElevenLabs(input.output);
  if (eleven) {
    const joined = frames.map((f) => f.voice).join(" ");
    const a = words(eleven).join(" ");
    const b = words(joined).join(" ");
    out.push(a === b ? pass("eleven-match", "ElevenLabs = склейка реплик", `${eleven.length} символов`) : fail("eleven-match", "ElevenLabs = склейка реплик", `Расхождение: ${words(eleven).length} слов против ${words(joined).length} в кадрах`));
    if (/\b(?:e\.g\.|etc\.|ca\.|i\.e\.)|[()]/i.test(eleven)) out.push(fail("eleven-clean", "Чистый текст для озвучки", "Есть сокращения или скобки"));
  }

  // Антишаблон
  const sim = similarityReport(frames.map((f) => f.voice).join(" "), input.pastScripts);
  const sharedAll = sim.filter((s) => s.shared.length > 0);
  const tooClose = sim.filter((s) => s.jaccard > 0.12);
  if (!input.pastScripts.length) out.push(info("similarity", "Антишаблон: сравнение с прошлыми", "Прошлых сценариев в базе пока нет."));
  else if (sharedAll.length || tooClose.length)
    out.push(fail("similarity", "Антишаблон: сравнение с прошлыми", [
      ...sharedAll.map((s) => `Общие обороты во вступлении с «${s.title}»: ${s.shared.slice(0, 3).map((x) => `«${x}»`).join(", ")}`),
      ...tooClose.map((s) => `Слишком похож на «${s.title}»: ${Math.round(s.jaccard * 100)}% общих 3-грамм`),
    ].join("\n")));
  else out.push(pass("similarity", "Антишаблон: сравнение с прошлыми", `Сравнено с ${input.pastScripts.length}: максимум ${Math.round(Math.max(...sim.map((s) => s.jaccard)) * 100)}% общих 3-грамм.`));

  out.push(...rotationGates(input));
  return out;
}

export function framesGates(input: GateInput, vertical = false): GateResult[] {
  const out: GateResult[] = [];
  const fr = parseFrames(input.output);
  if (!fr.length) return [fail("parse", "Формат кадров", "Не найдено ни одного блока «Кадр NNN / Озвучка / Промпт».")];

  const gaps = fr.filter((f, i) => f.num !== fr[0].num + i);
  out.push(gaps.length ? fail("numbering", "Нумерация без пропусков", `Сбой на: ${gaps.map((f) => f.id).slice(0, 8).join(", ")}`) : pass("numbering", "Нумерация без пропусков", `${fr.length} кадров, ${fr[0].id}–${fr.at(-1)!.id}`));

  const ratio = vertical ? /9:16 vertical/i : /16:9 horizontal composition/i;
  const noRatio = fr.filter((f) => !ratio.test(f.prompt));
  out.push(noRatio.length ? fail("ratio", vertical ? "9:16 в каждом промпте" : "16:9 в каждом промпте", `Нет фразы формата: ${noRatio.map((f) => f.id).slice(0, 10).join(", ")}`) : pass("ratio", vertical ? "9:16 в каждом промпте" : "16:9 в каждом промпте", "Везде на месте."));

  const noText = fr.filter((f) => !/No text, no labels, no captions/i.test(f.prompt));
  out.push(noText.length ? fail("notext", "«No text, no labels, no captions»", `Нет в: ${noText.map((f) => f.id).slice(0, 10).join(", ")}`) : pass("notext", "«No text, no labels, no captions»", "Везде на месте."));

  const gore = fr.filter((f) => /\b(blood|gore|corpse|wound close-up)\b/i.test(f.prompt));
  out.push(gore.length ? fail("gore", "Без жестоких слов в промптах", gore.map((f) => f.id).join(", ")) : pass("gore", "Без жестоких слов в промптах", "Чисто."));

  const style = (input.styleBlock ?? "").trim();
  if (style) {
    const probe = style.slice(0, 80);
    const noStyle = fr.filter((f) => !f.prompt.includes(probe));
    out.push(noStyle.length ? fail("style", "БЛОК СТИЛЯ дословно", `Нет в: ${noStyle.map((f) => f.id).slice(0, 10).join(", ")}`) : pass("style", "БЛОК СТИЛЯ дословно", "Во всех промптах."));
  } else out.push(warn("style", "БЛОК СТИЛЯ дословно", "Блок стиля не задан в параметрах — проверка пропущена."));

  const anim = fr.filter((f) => f.animation);
  const loud = anim.filter((f) => !/Silent/i.test(f.animation!));
  out.push(loud.length ? fail("silent", "Анимации беззвучные", loud.map((f) => f.id).join(", ")) : pass("silent", "Анимации беззвучные", `${anim.length} анимаций`));
  if (!vertical) {
    const share = anim.length / fr.length;
    out.push(share > 0.3 ? warn("anim-share", "Анимируется ~каждый 5-й кадр", `${Math.round(share * 100)}% кадров — дорого и шумно`) : info("anim-share", "Анимируется ~каждый 5-й кадр", `${anim.length} из ${fr.length}`));
  }

  if (input.approvedScript && !vertical) {
    const byId = new Map(input.approvedScript.frames.map((f) => [f.id, f]));
    const mism = fr.filter((f) => {
      const s = byId.get(f.id);
      return !s || words(s.voice).join(" ") !== words(f.voice).join(" ");
    });
    out.push(mism.length ? fail("voice-match", "Озвучка = утверждённый сценарий", `Расхождения: ${mism.map((f) => f.id).slice(0, 10).join(", ")}`) : pass("voice-match", "Озвучка = утверждённый сценарий", "Слово в слово."));
    const missing = input.approvedScript.frames.filter((f) => !fr.some((x) => x.id === f.id)).map((f) => f.id);
    if (missing.length) out.push(info("coverage", "Покрытие кадров", `Ещё не выданы: ${missing.length} (${missing[0]}…${missing.at(-1)}). Можно добирать пачками.`));
    else out.push(pass("coverage", "Покрытие кадров", "Все кадры сценария выданы."));
  }
  if (vertical) {
    const n = fr.length;
    out.push(n >= 8 && n <= 12 ? pass("count", "8–12 кадров", `${n}`) : warn("count", "8–12 кадров", `${n}`));
    const noSrc = fr.filter((f) => !f.source);
    out.push(noSrc.length ? warn("source", "Источник у каждого кадра", noSrc.map((f) => f.id).join(", ")) : pass("source", "Источник у каждого кадра", "Есть."));
  }
  return out;
}

export function angleGates(input: GateInput): GateResult[] {
  const out: GateResult[] = [];
  const a = parseAngle(input.output);
  out.push(a.hooks.length === 3 ? pass("hooks", "Три варианта хука", a.hooks.map((h) => `${h.key}: ${h.text}`).join("\n")) : fail("hooks", "Три варианта хука", `Найдено ${a.hooks.length}. Нужны строки «ХУК A/B/C: …».`));
  out.push(a.answerWord ? pass("answer-word", "Слово-разгадка", a.answerWord) : fail("answer-word", "Слово-разгадка", "Строка «РАЗГАДКА: …» не найдена"));
  const long = a.titles.filter((t) => t.length > 70);
  if (a.titles.length) out.push(long.length ? fail("title-len", "Название ≤70 символов", long.join("\n")) : pass("title-len", "Название ≤70 символов", a.titles.join("\n")));
  if (a.answerWord) {
    const leak = a.titles.filter((t) => t.toLowerCase().includes(a.answerWord!.toLowerCase()));
    out.push(leak.length ? fail("title-leak", "Название не выдаёт разгадку", leak.join("\n")) : pass("title-leak", "Название не выдаёт разгадку", "Ок"));
  }
  const hookHits: string[] = [];
  for (const h of a.hooks) for (const r of FORBIDDEN) if (r.re.test(h.text)) hookHits.push(`«${h.text}» — ${r.why}`);
  out.push(hookHits.length ? fail("hook-forbidden", "Хуки без запрещённых паттернов", hookHits.join("\n")) : pass("hook-forbidden", "Хуки без запрещённых паттернов", "Ок"));
  const sim = similarityReport(a.hooks.map((h) => h.text).join(" "), input.pastScripts.map((p) => ({ ...p, text: p.text.slice(0, 600) })));
  const shared = sim.filter((s) => s.shared.length);
  out.push(shared.length ? fail("hook-similar", "Хуки не повторяют прошлые", shared.map((s) => `«${s.title}»: ${s.shared.slice(0, 2).join(" / ")}`).join("\n")) : pass("hook-similar", "Хуки не повторяют прошлые", "Ок"));
  out.push(...rotationGates(input));
  return out;
}

export function packagingGates(input: GateInput): GateResult[] {
  const out: GateResult[] = [];
  const p = parsePackaging(input.output);
  if (!p.title) out.push(fail("title", "Название", "Строка «НАЗВАНИЕ: …» не найдена"));
  else {
    out.push(p.title.length <= 70 ? pass("title-len", "Название ≤70 символов", `${p.title} (${p.title.length})`) : fail("title-len", "Название ≤70 символов", `${p.title.length} символов`));
    out.push(/Why You Wouldn['’]t Survive 24 Hours as/i.test(p.title) ? pass("formula", "Формула серии", "Ок") : warn("formula", "Формула серии", "Название не по формуле серии"));
    const ans = input.params.answerWord;
    if (ans) out.push(p.title.toLowerCase().includes(ans.toLowerCase()) ? fail("leak", "Не выдаёт разгадку", `«${ans}» в названии`) : pass("leak", "Не выдаёт разгадку", "Ок"));
  }
  out.push(p.tags.length >= 15 && p.tags.length <= 25 ? pass("tags", "15–25 тегов", `${p.tags.length}`) : warn("tags", "15–25 тегов", `${p.tags.length}`));
  if (p.description) {
    const banned = /national geographic|history for sleep/i.test(p.tags.join(","));
    if (banned) out.push(fail("tags-bad", "Нерелевантные теги", "Есть теги чужих брендов/ниш"));
    out.push(/https?:\/\//.test(p.description) || /source|источник/i.test(p.description) ? pass("sources", "Источники в описании", "Есть") : warn("sources", "Источники в описании", "Не видно ссылок или списка источников"));
  } else out.push(fail("desc", "Описание", "Блок «ОПИСАНИЕ:» не найден"));
  return out;
}

export function shortScriptGates(input: GateInput): GateResult[] {
  const out: GateResult[] = [];
  const s = parseShortScript(input.output);
  out.push(s.hooks.length >= 3 ? pass("hooks", "Три хука", s.hooks.join("\n")) : fail("hooks", "Три хука", `Найдено ${s.hooks.length}`));
  const badHooks = s.hooks.filter((h) => countWords(h) > 15 || /^\s*(?:\d|did you know|that['’]s|he |she |they |it )/i.test(h));
  out.push(badHooks.length ? fail("hook-rules", "Хук ≤15 слов, без запрещённых начал", badHooks.join("\n")) : pass("hook-rules", "Хук ≤15 слов, без запрещённых начал", "Ок"));
  if (!s.text) return [...out, fail("text", "Текст шортса", "Строка «ТЕКСТ:» не найдена")];
  const n = countWords(s.text);
  out.push(n >= 70 && n <= 90 ? pass("len", "70–90 слов", `${n} слов ≈ ${Math.round((n / 165) * 60)} с`) : fail("len", "70–90 слов", `${n} слов`));
  const last = s.text.trim().split(/(?<=[.!?])\s+/).at(-1) ?? "";
  out.push(/\?\s*$/.test(last) ? pass("open-end", "Обрыв на вопросе", last) : fail("open-end", "Обрыв на вопросе", `Последняя фраза: «${last}» — шортс должен оставлять вопрос открытым`));
  out.push(/full video|watch the (?:full|whole)|link (?:in|below)/i.test(s.text) ? fail("cta", "Без «смотри полное видео»", "Найден призыв") : pass("cta", "Без «смотри полное видео»", "Ок"));
  if (input.approvedScript) {
    const parent = words(input.approvedScript.frames.map((f) => f.voice).join(" "));
    const pset = new Set(parent);
    const novel = [...new Set(words(s.text))].filter((w) => w.length > 6 && !pset.has(w));
    out.push(novel.length > 5 ? warn("novel", "Нет фактов вне длинного ролика (эвристика)", `Новые слова: ${novel.slice(0, 12).join(", ")}`) : pass("novel", "Нет фактов вне длинного ролика (эвристика)", "Лексика из длинного ролика"));
  }
  return out;
}

export function runGates(set: string | undefined, input: GateInput): GateResult[] {
  if (!input.output.trim()) return [];
  switch (set) {
    case "script": return scriptGates(input);
    case "frames": return framesGates(input, false);
    case "short_frames": return framesGates(input, true);
    case "angle": return angleGates(input);
    case "packaging": return packagingGates(input);
    case "short_script": return shortScriptGates(input);
    default: return [];
  }
}

export function gatesBlocking(g: GateResult[]) {
  return g.some((x) => x.status === "fail");
}
