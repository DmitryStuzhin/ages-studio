import { eq, sql } from "drizzle-orm";
import * as schema from "./schema";
import { CONSTITUTION_V8, STEP_PROMPTS_V8, V8_CHANGELOG } from "@/lib/prompts/v8";
import { CONSTITUTION_V8_1, STEP_PROMPTS_V8_1, V8_1_CHANGELOG } from "@/lib/prompts/v8_1";
import type { DB } from "./client";

export const DEFAULT_SETTINGS = {
  channel: {
    name: "Illustrated Ages",
    handle: "@Illustrated_Ages",
    channelId: "UCq-ofMZGaohZJ6g122_3OCA",
  },
  goal: {
    subscribers: 1000,
    watchHours: 4000,
    deadline: "2027-01-15",
    note: "Подать заявку 10–15 января: проверка занимает до месяца, с 1 февраля 2027 порог 8000 часов.",
    checkpoints: [
      { date: "2026-12-06", subscribers: 450, watchHours: 1500, fallback: "Если меньше 700 часов — цель «8000 часов», набранное остаётся в зачёте." },
      { date: "2027-01-01", subscribers: 850, watchHours: 3200, fallback: "" },
    ],
  },
  defaults: {
    durationMin: 9,
    language: "en",
    styleBlock: "",
    wordsPerMinute: 155,
  },
  models: { opus: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" },
  elevenlabs: { monthlyCredits: 30000, creditsPerChar: 1, voiceId: "", voiceName: "", model: "eleven_v3" as string },
  google: {
    // OAuth-приложение в режиме Testing: Google отзывает доступ через 7 дней после входа.
    testingMode: true,
  },
  sync: {
    intervalHours: 12,
    // Поисковые запросы для сводки ниши. Каждый запрос стоит 100 единиц квоты из 10 000 в сутки.
    nicheQueries: [
      "why you wouldn't survive 24 hours as",
      "survive 24 hours as",
      "worst jobs in history",
      "what life was like in ancient",
      "a day in the life medieval",
    ],
    resultsPerQuery: 15,
    publishedWithinDays: 365,
    addProjectRoles: true,
  },
};

export type AppSettings = typeof DEFAULT_SETTINGS;

/** Миграции данных: выполняются один раз, отметка хранится в settings.migrations. */
async function migrate(db: DB) {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "migrations") });
  const done = new Set((row?.value as string[] | undefined) ?? []);
  const mark = async (id: string) => {
    done.add(id);
    await db.insert(schema.settings).values({ key: "migrations", value: [...done] })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: [...done] } });
  };

  if (!done.has("prompt-v9-canon")) {
    // v9 = v8 + канон канала. Активируется сам, только если автор ещё не правил промпт (активна исходная v8);
    // иначе ложится в историю, а в «Правки мастер-промпта» уходит напоминание.
    const active = await db.query.promptVersions.findFirst({ where: eq(schema.promptVersions.status, "active") });
    const untouched = !active || (active.version === "v8" && active.constitution === CONSTITUTION_V8);
    if (untouched) await db.update(schema.promptVersions).set({ status: "archived" }).where(eq(schema.promptVersions.status, "active"));
    await db.insert(schema.promptVersions).values({
      version: "v9", constitution: CONSTITUTION_V8_1, steps: STEP_PROMPTS_V8_1, changelog: V8_1_CHANGELOG,
      status: untouched ? "active" : "archived",
    });
    if (!untouched) {
      await db.insert(schema.promptProposals).values({ text: "Есть версия v9 с каноном канала (стиль, анимация, Eleven v3, метки монтажа подставляются сами). Активируй её в «Истории версий» и перенеси свои правки." });
    }
    await mark("prompt-v9-canon");
  }
}

export async function seed(db: DB) {
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from prompt_versions`)).rows as { n: number }[];
  if (n > 0) return migrate(db);

  await db.insert(schema.promptVersions).values({
    version: "v8",
    constitution: CONSTITUTION_V8,
    steps: STEP_PROMPTS_V8,
    changelog: V8_CHANGELOG,
    status: "active",
  });

  await db.insert(schema.settings).values([{ key: "app", value: DEFAULT_SETTINGS }]);

  // Ролики, вышедшие до платформы: только метрики и уроки, без шагов.
  const legacy = await db
    .insert(schema.projects)
    .values([
      {
        kind: "long", legacy: true, status: "published", format: "survive24",
        title: "Why You Wouldn't Survive 24 Hours as a Pyramid Builder",
        params: { role: "Pyramid Builder", place: "Giza", era: "Old Kingdom", durationMin: 8.5, structureKey: "invisible_killer", hookTypeKey: "in_medias_res" },
      },
      {
        kind: "long", legacy: true, status: "published", format: "survive24",
        title: "Why You Wouldn't Survive 24 Hours as a Pirate",
        params: { role: "Pirate", structureKey: "invisible_killer", hookTypeKey: "clock" },
        publishedAt: new Date("2026-10-10T21:00:00Z"),
      },
      {
        kind: "long", legacy: true, status: "published", format: "explainer",
        title: "The Spanish Flu Didn't Start in Spain. So Why the Name?",
        params: {},
      },
      {
        kind: "long", legacy: true, status: "published", format: "explainer",
        title: "Why Ancient Egypt Lasted 3,000 Years",
        params: {},
      },
      {
        kind: "long", legacy: true, status: "published", format: "explainer",
        title: "How the East India Company Turned Trade Into Empire",
        params: {},
      },
    ])
    .returning({ id: schema.projects.id, title: schema.projects.title });

  const id = (s: string) => legacy.find((p) => p.title.includes(s))!.id;

  await db.insert(schema.metrics).values([
    {
      projectId: id("Pyramid"), day: 7, ctr: 9.3, avgViewPct: 29.4, avgViewSec: 160,
      retention: [
        { t: 0, pct: 100 }, { t: 10, pct: 60 }, { t: 25, pct: 33 }, { t: 50, pct: 28 }, { t: 455, pct: 24 },
      ],
      notes: "Перенесено из мастер-промпта v7. Мало просмотров из главной — выводы предварительные.",
    },
    {
      projectId: id("Pirate"), day: 2, ctr: 7.9, avgViewPct: 31.4,
      notes: "Разбор на 47 ч: провалы 0:00–0:07, 0:07–1:40, 1:40–2:35, 5:05–5:50; ядро 2:35–5:05 ровное.",
    },
    { projectId: id("Spanish"), day: 7, ctr: 11.5, avgViewPct: 21, notes: "Другой формат (объяснение). Цифры из v5." },
  ]);

  await db.insert(schema.lessons).values([
    { text: "Почти вся потеря зрителей — в первые 60 секунд; кто пережил минуту, смотрит почти до конца.", evidence: "Pyramid: 0:10 → 60%, 0:25 → 33%, 0:50 → 28%, дальше ровно до 7:35. Pirate: ядро 2:35–5:05 ровное.", confirmations: 2, status: "confirmed", sourceProjectId: id("Pyramid") },
    { text: "Снятие угрозы из первого кадра («The stone won't kill you») дало самое резкое падение.", evidence: "Pyramid, ~0:08.", confirmations: 1, status: "hypothesis", sourceProjectId: id("Pyramid") },
    { text: "Флешбэк к спокойному утру и история раскопок до 1:00 уводят зрителя.", evidence: "Pyramid, 0:30–0:50.", confirmations: 1, status: "hypothesis", sourceProjectId: id("Pyramid") },
    { text: "Зритель уходит, пока он ещё не герой из названия.", evidence: "Pirate, 0:07–1:40: герой был пленником торгового судна.", confirmations: 1, status: "hypothesis", sourceProjectId: id("Pirate") },
    { text: "Блок объяснений правил дольше 15 секунд — провал.", evidence: "Pirate, 1:40–2:35.", confirmations: 1, status: "hypothesis", sourceProjectId: id("Pirate") },
    { text: "Сцена облегчения до приговора читается как конец ролика.", evidence: "Pirate, 5:05–5:50.", confirmations: 1, status: "hypothesis", sourceProjectId: id("Pirate") },
    { text: "Ответ на вопрос из названия в середине ролика роняет удержание второй половины.", evidence: "Spanish Flu: ответ около 40% хронометража, удержание ~21%. Другой формат.", confirmations: 1, status: "hypothesis", scope: "both", sourceProjectId: id("Spanish") },
    { text: "Ответ в первые 10 секунд убивает ролик; перечень фактов без людей не держит.", evidence: "Ancient Egypt 3,000 Years — худшее удержание. Тема Египта при этом лучшая по просмотрам.", confirmations: 1, status: "hypothesis", scope: "both", sourceProjectId: id("Egypt") },
    { text: "Упаковка серии работает: CTR 7,9–9,3% у роликов «24 часа».", evidence: "Pyramid 9,3%, Pirate 7,9%.", confirmations: 2, status: "confirmed", sourceProjectId: id("Pirate") },
    { text: "Из ленты Shorts сразу листают около двух третей: горизонтальные кадры с полосами, хук с середины мысли, оборванная концовка.", evidence: "Данные канала, v6.", confirmations: 1, status: "hypothesis", scope: "short" },
    { text: "Шортс с таймером держит 77% длины, но «продолжили смотреть» только 32% — первый кадр перегружен.", evidence: "Данные 12.10.2026.", confirmations: 1, status: "hypothesis", scope: "short" },
    { text: "Звук клипов Veo глушить — в ролике только озвучка и музыка.", evidence: "Spanish Flu.", confirmations: 1, status: "hypothesis", scope: "both", sourceProjectId: id("Spanish") },
  ]);
  await migrate(db);
}
