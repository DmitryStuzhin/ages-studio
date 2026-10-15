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

import { toStoryboardCsv, parseCast } from "../src/lib/pipeline/package";
import { countWords as cw } from "../src/lib/pipeline/parse";
import { dailySeries, forecast } from "../src/lib/stats";

test("теги Eleven v3 не считаются словами", () => {
  assert.equal(cw("[tense] The rope... snaps. [short pause] Run."), 4);
});

test("storyboard.csv в формате конвейера, ⏱ в начале акта, кавычки экранированы", () => {
  const script = parseScript(frame(1, "You wake up, and \"nobody\" is coming.", " · угроза 1"), 155);
  const m = buildManifest({ projectId: 1, title: "T", kind: "long", role: null, script, framesText: "Кадр 001\nОзвучка: You wake up, and \"nobody\" is coming.\nПромпт: A scene, style\nМонтаж: 📍 Giza · 💥\n", wpm: 155 });
  const csv = toStoryboardCsv(m);
  const [head, row] = csv.trim().split("\n");
  assert.equal(head, "shot,scene,prompt,voice,anim,anim_prompt,refs,notes");
  assert.match(row, /^1,Act 1 - Test,"A scene, style","You wake up, and ""nobody"" is coming\.",0,,,⏱ 05:00 · 📍 Giza · 💥$/);
  assert.equal(m.scenes[0].overlays.place, "Giza");
  assert.equal(m.scenes[0].overlays.hit, true);
});

test("персонажи шага 5 разбираются для style.md", () => {
  const c = parseCast("ФАЙЛ: char_you.png\nИМЯ: the boy\nОПИСАНИЕ: A thin boy in soot.\nРЕФЕРЕНС-ЛИСТ: sheet\n\nФАЙЛ: loc_roof.png\nОПИСАНИЕ: A slate roof.");
  assert.deepEqual(c.map((x) => x.file), ["char_you.png", "loc_roof.png"]);
  assert.equal(c[0].name, "the boy");
});

test("прогноз: при нулевом темпе цели нет, при достаточном — успеваем", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, creatorContentType: "videoOnDemand", views: 10, estimatedMinutesWatched: 600, subscribersGained: 1, subscribersLost: 0 }));
  const pts = dailySeries(rows);
  assert.equal(pts.length, 30);
  const f = forecast({ points: pts, pick: (p) => p.longHours, now: 300, goal: 400, deadline: "2099-01-01" });
  assert.equal(f.pacePerDay, 10);
  assert.equal(f.daysToGoal, 10);
  assert.equal(f.onTrack, true);
  const z = forecast({ points: pts, pick: () => 0, now: 0, goal: 400, deadline: "2099-01-01" });
  assert.equal(z.eta, null);
});

import { parseCsv, splitParts, voiceShots } from "../src/lib/pipeline/voice-split";
test("voice split: CSV с кавычками и разбивка по актам как в voice_script.py", () => {
  const rows = parseCsv('shot,voice,notes\n1,"Hello, ""you"".",⏱ 00:00\n2,"Line\ntwo",\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].voice, 'Hello, "you".');
  const csv = ["shot,scene,voice,notes", ...Array.from({ length: 30 }, (_, i) => `${i + 1},A,${"word ".repeat(20).trim()},${i % 10 === 0 ? "⏱" : ""}`)].join("\n");
  const parts = splitParts(voiceShots(csv), 1000);
  assert.ok(parts.length > 1);
  assert.equal(parts.flat().length, 30);
  assert.equal(parts[1][0].shot % 10, 1); // часть начинается со смены акта
});

import { roleOf, extractRequests, enrich, buildAdvice } from "../src/lib/niche";
test("ниша: роль из названия, просьбы из комментариев, сходство и совет", () => {
  assert.equal(roleOf("Why You Wouldn't Survive 24 Hours as a Pirate"), "pirate");
  assert.equal(roleOf("What It Was Like to Be a Victorian Chimney Sweep"), "victorian chimney sweep");
  assert.equal(roleOf("Why Life as a Viking was Hell"), "viking");
  const req = extractRequests([{ text: "Do the samurai next please", likes: 5 }, { text: "Please do a video on Spartan soldiers next!", likes: 40 }]);
  assert.deepEqual(req.map((r) => r.topic).sort(), ["samurai", "spartan soldiers"]);
  const mk = (id: number, title: string, views: number, subs: number, dur = 600) => ({
    id, title, channel: "C" + (id % 3), channelId: "UC" + (id % 3), url: null, views, likes: views / 30, comments: views / 500, durationSec: dur,
    publishedAt: "2026-05-01", channelSubs: subs, tags: "", hidden: false, pinned: false, externalId: `yt:VID${String(id).padStart(8, "0")}`,
  });
  const items = [
    mk(1, "Why You Wouldn't Survive 24 Hours as a Samurai", 2_000_000, 10_000),
    mk(2, "Why You Wouldn't Survive 24 Hours as a Viking", 50_000, 10_000),
    mk(3, "I Survived 24 Hours in a Treehouse", 9_000_000, 5_000_000, 900),
    mk(4, "Why You Wouldn't Survive 24 Hours as a Spartan", 900_000, 20_000),
    mk(5, "Would You Survive as an Aztec Warrior?", 30_000, 20_000),
  ];
  const mine = [{ title: "Why You Wouldn't Survive 24 Hours as a Pirate", durationSec: 520, isShort: false, views: 400, publishedAt: "2026-10-01" }];
  const e = enrich(items, mine);
  const by = (id: number) => e.find((x) => x.id === id)!;
  assert.ok(by(1).sim >= 75, "тот же формат — высокое сходство");
  assert.ok(by(3).sim < 55, "челлендж блогера — не похож");
  assert.ok(by(1).power > by(2).power, "обогнал канал сильнее — сильнее");
  const a = buildAdvice(e.filter((x) => x.sim >= 55), mine, []);
  assert.ok(a.n >= 4 && a.tips.length > 0);
});
