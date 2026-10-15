import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScript, parseAngle, parseFrames, fmtTime } from "../src/lib/pipeline/parse";
import { scriptGates, framesGates, shortScriptGates, angleGates, similarityReport } from "../src/lib/pipeline/gates";
import { checkFrames, buildManifest, toSrt, toFcpxml } from "../src/lib/pipeline/package";
import { structureByKey } from "../src/lib/prompts/library";

const frame = (n: number, voice: string, meta = "") =>
  `Кадр ${String(n).padStart(3, "0")} · Act 1 - Test · ⏱ 05:00${meta}\nОзвучка: «${voice}»\nНа экране: общий план\n`;

const base = { params: { durationMin: 0.5, structureKey: "invisible_killer" }, structure: structureByKey("invisible_killer"), wpm: 155, pastScripts: [] };

test("parseScript считает тайминги по 155 словам в минуту", () => {
  const s = parseScript(frame(1, "one two three four five six seven eight nine ten") + frame(2, "a b c d e"), 155);
  assert.equal(s.frames.length, 2);
  assert.equal(s.totalWords, 15);
  assert.ok(Math.abs(s.frames[1].start - (10 / 155) * 60) < 0.01);
  assert.equal(fmtTime(65), "1:05");
});

test("гейт ловит обезвреживание угрозы и ранний ответ", () => {
  const text = [
    frame(1, "The stone above you won't kill you, so what will today?", " · угроза 1 · такт: знак · метки: 🔑"),
    frame(2, "You keep pulling the rope while the sun climbs higher.", " · угроза 1 · метки: ⚡"),
    frame(3, "This is what takes you before the next dawn arrives.", " · угроза 1 · метки: ☠"),
  ].join("\n");
  const g = scriptGates({ ...base, output: text });
  const byId = Object.fromEntries(g.map((x) => [x.id, x.status]));
  assert.equal(byId["forbidden"], "fail");
  assert.equal(byId["answer"], "fail");
});

test("антишаблон находит повтор вступления из прошлого ролика", () => {
  const past = "Озвучка: «The rope above your head just snapped and nobody is coming to help you now»";
  const rep = similarityReport("The rope above your head just snapped and nobody is coming to help you now", [{ title: "Old", text: past }]);
  assert.ok(rep[0].shared.length > 0);
});

test("чередование: повтор структуры последних роликов — провал", () => {
  const g = angleGates({ ...base, output: "ХУК A: a\nХУК B: b\nХУК C: c\nРАЗГАДКА: x", recentStructures: ["invisible_killer"], recentHookTypes: [] });
  assert.equal(g.find((x) => x.id === "rot-structure")?.status, "fail");
});

test("parseAngle отрезает пометку «← рекомендую» в названии", () => {
  const a = parseAngle("- Why You Wouldn't Survive 24 Hours as a Pirate ← рекомендую\nРАЗГАДКА: scurvy");
  assert.deepEqual(a.titles, ["Why You Wouldn't Survive 24 Hours as a Pirate"]);
  assert.equal(a.answerWord, "scurvy");
});

test("гейт кадров требует 16:9, запрет текста и блок стиля", () => {
  const out = "Кадр 001\nОзвучка: hi there\nПромпт: A scene. No text, no labels, no captions. STYLE.\n";
  const g = framesGates({ ...base, output: out, styleBlock: "STYLE." });
  assert.equal(g.find((x) => x.id === "ratio")?.status, "fail");
  assert.equal(g.find((x) => x.id === "style")?.status, "pass");
});

test("шортс должен обрываться на вопросе", () => {
  const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
  const g = shortScriptGates({ ...base, output: `ХУК A: You're a sailor and the sea is rising.\nХУК B: b\nХУК C: c\nТЕКСТ: ${words}. You survived.` });
  assert.equal(g.find((x) => x.id === "open-end")?.status, "fail");
});

test("проверка кадров находит пропуски и неверные имена", () => {
  const specs = parseFrames("Кадр 001\nОзвучка: a\nПромпт: p\nАнимация 🎬: Silent\n\nКадр 002\nОзвучка: b\nПромпт: p\n");
  const c = checkFrames(specs, ["frames/shot_001.png", "shot_2.png", ".DS_Store"]);
  assert.deepEqual(c.missing, ["shot_002"]);
  assert.deepEqual(c.missingAnimations, ["shot_001"]);
  assert.deepEqual(c.badNames, ["shot_2.png"]);
  assert.equal(c.ok, false);
});

test("манифест, SRT и FCPXML собираются из кадров", () => {
  const script = parseScript(frame(1, "You wake up in the dark and the water is rising.", " · угроза 1 · метки: 🛡 1/6"), 155);
  const m = buildManifest({ projectId: 1, title: "T & <x>", kind: "long", role: null, script, framesText: "Кадр 001\nОзвучка: You wake up in the dark and the water is rising.\nПромпт: p\nМонтаж: ⏱ 05:00 · 🛡 1/6\n", wpm: 155 });
  assert.equal(m.scenes[0].overlays.shield, "1/6");
  assert.match(toSrt(m), /00:00:00,000 -->/);
  assert.match(toFcpxml(m), /T &amp; &lt;x&gt;/);
});
