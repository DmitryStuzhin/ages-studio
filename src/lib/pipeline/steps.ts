export type ProjectKind = "long" | "short";
export type StepMode = "llm" | "form" | "export" | "review";
export type ModelTier = "opus" | "sonnet" | "haiku";

export type ContextBlock =
  | "params"
  | "structure"
  | "hook"
  | "lessons"
  | "channel"
  | "market"
  | "facts"
  | "angle"
  | "threats"
  | "cast"
  | "script"
  | "past_scripts"
  | "metrics"
  | "parent";

export type StepDef = {
  key: string;
  kind: ProjectKind;
  label: string; // номер шага в интерфейсе
  title: string;
  summary: string;
  mode: StepMode;
  tier: ModelTier;
  /** Какие блоки контекста подставляются в промпт шага. */
  context: ContextBlock[];
  /** Ключ набора кодовых гейтов. */
  gates?: "script" | "frames" | "packaging" | "short_script" | "short_frames" | "angle";
  /** Где принимает решение автор (подсказка в интерфейсе). */
  authorAction?: string;
  /** Примерный объём ответа в токенах — для оценки стоимости. */
  outTokens: number;
};

export const LONG_STEPS: StepDef[] = [
  {
    key: "role", kind: "long", label: "0", title: "Выбор роли",
    summary: "5 кандидатов из сводки ниши и канала, с подходящей структурой.",
    mode: "llm", tier: "sonnet", context: ["channel", "market", "lessons", "past_scripts"],
    authorAction: "Выбери роль и впиши её в параметры.", outTokens: 1500,
  },
  {
    key: "params", kind: "long", label: "1", title: "Параметры",
    summary: "Роль, эпоха, длина, структура и тип хука с правилом чередования, блок стиля.",
    mode: "form", tier: "haiku", context: [], outTokens: 0,
    authorAction: "Заполни и утверди — это вход для всех следующих шагов.",
  },
  {
    key: "recon", kind: "long", label: "2", title: "Разведка и база фактов",
    summary: "Досье по роли и база фактов с источниками — единственный источник фактов дальше.",
    mode: "llm", tier: "opus", context: ["params", "structure", "market", "channel", "lessons"],
    authorAction: "Пробеги базу фактов глазами: всё ли подтверждено.", outTokens: 4000,
  },
  {
    key: "angle", kind: "long", label: "3", title: "Угол, хук, вердикт",
    summary: "Названия, центральный вопрос, разгадка, три варианта хука, контракт, вердикт.",
    mode: "llm", tier: "opus", context: ["params", "structure", "hook", "facts", "lessons", "past_scripts"],
    gates: "angle", authorAction: "Выбери хук A/B/C.", outTokens: 2500,
  },
  {
    key: "threats", kind: "long", label: "4", title: "Журнал угроз и карта",
    summary: "Угрозы с фактами и карта по битам выбранной структуры.",
    mode: "llm", tier: "opus", context: ["params", "structure", "facts", "angle", "lessons"],
    outTokens: 5000,
  },
  {
    key: "cast", kind: "long", label: "5", title: "Персонажи и референсы",
    summary: "Фиксированные описания героя, людей, мест и объектов + референс-листы.",
    mode: "llm", tier: "sonnet", context: ["params", "facts", "threats"],
    authorAction: "Сгенерируй референс-листы во Flow первыми.", outTokens: 2500,
  },
  {
    key: "script", kind: "long", label: "6", title: "Сценарий",
    summary: "Покадровый сценарий по карте. Механические гейты считает платформа.",
    mode: "llm", tier: "opus", context: ["params", "structure", "hook", "facts", "angle", "threats", "lessons", "past_scripts"],
    gates: "script", outTokens: 14000,
  },
  {
    key: "audit", kind: "long", label: "7", title: "Аудит, факты, антишаблон",
    summary: "Холодный зритель, сверка фактов с базой, сравнение с прошлыми роликами, текст для ElevenLabs.",
    mode: "llm", tier: "opus", context: ["params", "structure", "facts", "angle", "script", "past_scripts", "lessons"],
    gates: "script", authorAction: "Финальный текст — твой: правь прямо в ответе перед утверждением.", outTokens: 18000,
  },
  {
    key: "frames", kind: "long", label: "8", title: "Кадры и промпты",
    summary: "Промпты Nano Banana и Veo, поле «Монтаж» для манифеста.",
    mode: "llm", tier: "sonnet", context: ["params", "cast", "script"],
    gates: "frames", authorAction: "Сгенерируй кадры во Flow, имена shot_NNN.png / .mp4.", outTokens: 30000,
  },
  {
    key: "packaging", kind: "long", label: "9", title: "Упаковка",
    summary: "Названия, описание с источниками, теги, концепты обложки, главы.",
    mode: "llm", tier: "sonnet", context: ["params", "facts", "angle", "threats", "script", "market"],
    gates: "packaging", authorAction: "Выбери название и обложку сам.", outTokens: 3000,
  },
  {
    key: "package", kind: "long", label: "10", title: "Пакет видео",
    summary: "Проверка кадров, manifest.json, SRT, FCPXML, бриф для Claude Code — одним архивом.",
    mode: "export", tier: "haiku", context: [], outTokens: 0,
    authorAction: "Собери ролик, посмотри целиком, опубликуй вручную.",
  },
  {
    key: "review", kind: "long", label: "11", title: "Разбор после публикации",
    summary: "Метрики на 7 и 28 день → кадры падений → уроки и правки промпта на утверждение.",
    mode: "review", tier: "opus", context: ["params", "structure", "script", "metrics", "lessons"],
    outTokens: 3000,
  },
];

export const SHORT_STEPS: StepDef[] = [
  {
    key: "params", kind: "short", label: "1", title: "Параметры",
    summary: "Родительский ролик и угроза для шортса.",
    mode: "form", tier: "haiku", context: [], outTokens: 0,
  },
  {
    key: "s_select", kind: "short", label: "2", title: "Отбор угроз",
    summary: "Кандидаты из журнала угроз родительского ролика.",
    mode: "llm", tier: "sonnet", context: ["parent", "lessons"], outTokens: 1500,
    authorAction: "Выбери угрозу и впиши в параметры.",
  },
  {
    key: "s_script", kind: "short", label: "3", title: "Хук и сценарий",
    summary: "Три хука, текст 70–90 слов с обрывом на вопросе.",
    mode: "llm", tier: "opus", context: ["params", "parent", "lessons"], gates: "short_script", outTokens: 1200,
  },
  {
    key: "s_frames", kind: "short", label: "4", title: "Раскадровка 9:16",
    summary: "8–12 вертикальных кадров по референсам длинного ролика.",
    mode: "llm", tier: "sonnet", context: ["params", "parent"], gates: "short_frames", outTokens: 4000,
  },
  {
    key: "s_pack", kind: "short", label: "5", title: "Упаковка и график",
    summary: "Название, хэштеги, «Связанное видео», график публикации.",
    mode: "llm", tier: "haiku", context: ["params", "parent"], outTokens: 800,
  },
  {
    key: "package", kind: "short", label: "6", title: "Пакет шортса",
    summary: "Манифест 9:16, субтитры, бриф.",
    mode: "export", tier: "haiku", context: [], outTokens: 0,
  },
];

export function stepsFor(kind: ProjectKind) {
  return kind === "long" ? LONG_STEPS : SHORT_STEPS;
}
export function stepDef(kind: ProjectKind, key: string) {
  return stepsFor(kind).find((s) => s.key === key) ?? null;
}

/** Цены за 1M токенов (вход / выход / чтение кеша), USD. platform.claude.com/docs, окт. 2026. */
export const MODEL_PRICES: Record<ModelTier, { id: string; name: string; input: number; output: number; cacheRead: number }> = {
  opus: { id: "claude-opus-5-5", name: "Opus 5.5", input: 4, output: 20, cacheRead: 0.2 },
  sonnet: { id: "claude-sonnet-5-5", name: "Sonnet 5.5", input: 2, output: 10, cacheRead: 0.1 },
  haiku: { id: "claude-haiku-5-5", name: "Haiku 5.5", input: 0.1, output: 0.5, cacheRead: 0.01 },
};

// ---------- Размышления модели ----------
// Модели 5.5 перед ответом размышляют; это повышает качество, но тратит лимит ответа и деньги (как выход).
// Глубина размышлений по шагам: где решается смысл ролика — medium, механические шаги — low.
export type Effort = "low" | "medium" | "high";
const DEEP = new Set(["recon", "angle", "threats", "script", "audit", "review", "s_script"]);
const THINK_RESERVE: Record<Effort, number> = { low: 4000, medium: 12000, high: 24000 };
const THINK_TYPICAL: Record<Effort, number> = { low: 800, medium: 3000, high: 8000 };

export function budgetFor(def: { key: string; outTokens: number }) {
  const effort: Effort = DEEP.has(def.key) ? "medium" : "low";
  return {
    effort,
    maxTokens: Math.min(64000, def.outTokens * 2 + THINK_RESERVE[effort]),
    typicalOut: Math.round(def.outTokens * 0.5 + THINK_TYPICAL[effort]),
  };
}
