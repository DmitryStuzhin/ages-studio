// Расчёты для Аналитики и Пульта: ряды по дням, прогноз выхода на порог YPP, разбивки.
// Чистые функции — на вход сырые строки отчётов YouTube Analytics.

export type Row = Record<string, string | number>;

export type DayPoint = {
  day: string; // YYYY-MM-DD
  longViews: number;
  shortViews: number;
  longHours: number;
  shortHours: number;
  subsGained: number;
  subsLost: number;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const isShort = (t: unknown) => String(t).toUpperCase() === "SHORTS";

/** Строки day × creatorContentType → непрерывный ряд по дням (пропуски заполнены нулями). */
export function dailySeries(rows: Row[] | undefined): DayPoint[] {
  if (!rows?.length) return [];
  const by = new Map<string, DayPoint>();
  for (const r of rows) {
    const d = String(r.day);
    const p = by.get(d) ?? { day: d, longViews: 0, shortViews: 0, longHours: 0, shortHours: 0, subsGained: 0, subsLost: 0 };
    if (isShort(r.creatorContentType)) {
      p.shortViews += num(r.views);
      p.shortHours += num(r.estimatedMinutesWatched) / 60;
    } else {
      p.longViews += num(r.views);
      p.longHours += num(r.estimatedMinutesWatched) / 60;
    }
    p.subsGained += num(r.subscribersGained);
    p.subsLost += num(r.subscribersLost);
    by.set(d, p);
  }
  const days = [...by.keys()].sort();
  const out: DayPoint[] = [];
  const cur = new Date(days[0] + "T00:00:00Z");
  const last = new Date(days.at(-1)! + "T00:00:00Z");
  while (cur <= last) {
    const d = cur.toISOString().slice(0, 10);
    out.push(by.get(d) ?? { day: d, longViews: 0, shortViews: 0, longHours: 0, shortHours: 0, subsGained: 0, subsLost: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function sum(points: DayPoint[], k: keyof Omit<DayPoint, "day">) {
  return points.reduce((a, p) => a + p[k], 0);
}

/** Сравнение двух окон: последние n дней против предыдущих n. */
export function windowDelta(points: DayPoint[], k: keyof Omit<DayPoint, "day">, n = 28) {
  const cur = sum(points.slice(-n), k);
  const prev = sum(points.slice(-2 * n, -n), k);
  return { cur, prev, delta: prev > 0 ? (cur - prev) / prev : null };
}

export type Forecast = {
  now: number;
  goal: number;
  pacePerDay: number;
  daysToGoal: number | null;
  eta: string | null;
  deadline: string;
  daysToDeadline: number;
  neededPerDay: number;
  onTrack: boolean;
  /** Ряд для графика: факт нарастающим итогом + прогноз до дедлайна. */
  series: { day: string; actual: number | null; forecast: number | null; need: number | null }[];
};

/**
 * Прогноз по нарастающему итогу. pace — средний прирост в день за последние 28 дней.
 * Для молодого канала скользящее окно 12 месяцев почти не «теряет» старые часы, поэтому
 * линейная экстраполяция честна; так и подписывается в интерфейсе.
 */
export function forecast(args: { points: DayPoint[]; pick: (p: DayPoint) => number; now: number; goal: number; deadline: string; window?: number }): Forecast {
  const w = args.window ?? 28;
  const recent = args.points.slice(-w);
  const pace = recent.length ? recent.reduce((a, p) => a + args.pick(p), 0) / recent.length : 0;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const dl = new Date(args.deadline + "T00:00:00Z");
  const daysToDeadline = Math.max(0, Math.round((dl.getTime() - today.getTime()) / 86400000));
  const remaining = Math.max(0, args.goal - args.now);
  const daysToGoal = remaining === 0 ? 0 : pace > 0 ? Math.ceil(remaining / pace) : null;
  const eta = daysToGoal == null ? null : new Date(today.getTime() + daysToGoal * 86400000).toISOString().slice(0, 10);
  const neededPerDay = daysToDeadline > 0 ? remaining / daysToDeadline : remaining;

  // Факт: восстанавливаем нарастающий итог назад от текущего значения.
  const series: Forecast["series"] = [];
  let acc = args.now;
  const back = [...args.points].reverse();
  const actual: { day: string; v: number }[] = [];
  for (const p of back) {
    actual.push({ day: p.day, v: Math.max(0, acc) });
    acc -= args.pick(p);
  }
  actual.reverse();
  for (const a of actual.slice(-90)) series.push({ day: a.day, actual: +a.v.toFixed(1), forecast: null, need: null });
  if (series.length) {
    series[series.length - 1].forecast = series[series.length - 1].actual;
    series[series.length - 1].need = series[series.length - 1].actual;
  }
  const startVal = args.now;
  const step = Math.max(1, Math.ceil(daysToDeadline / 40));
  for (let i = step; i <= daysToDeadline; i += step) {
    const d = new Date(today.getTime() + i * 86400000).toISOString().slice(0, 10);
    series.push({ day: d, actual: null, forecast: +(startVal + pace * i).toFixed(1), need: +(startVal + neededPerDay * i).toFixed(1) });
  }
  return {
    now: args.now, goal: args.goal, pacePerDay: pace, daysToGoal, eta, deadline: args.deadline, daysToDeadline,
    neededPerDay, onTrack: eta != null && eta <= args.deadline, series,
  };
}

/** Средние просмотры по дням недели (Пн…Вс) за последние n дней. */
export function weekdayProfile(points: DayPoint[], n = 90) {
  const names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const acc = names.map((name) => ({ name, long: 0, short: 0, days: 0 }));
  for (const p of points.slice(-n)) {
    const wd = (new Date(p.day + "T00:00:00Z").getUTCDay() + 6) % 7;
    acc[wd].long += p.longViews;
    acc[wd].short += p.shortViews;
    acc[wd].days += 1;
  }
  return acc.map((a) => ({ name: a.name, long: a.days ? Math.round(a.long / a.days) : 0, short: a.days ? Math.round(a.short / a.days) : 0 }));
}

export const TRAFFIC_LABELS: Record<string, string> = {
  SHORTS: "Лента Shorts",
  RELATED_VIDEO: "Рекомендованные видео",
  SUBSCRIBER: "Главная и подписки",
  YT_SEARCH: "Поиск YouTube",
  YT_CHANNEL: "Страница канала",
  EXT_URL: "Внешние сайты",
  NO_LINK_OTHER: "Прямые и неизвестные",
  PLAYLIST: "Плейлисты",
  YT_OTHER_PAGE: "Другие страницы YouTube",
  NOTIFICATION: "Уведомления",
  END_SCREEN: "Конечные заставки",
  ANNOTATION: "Подсказки",
  HASHTAGS: "Хэштеги",
  SOUND_PAGE: "Страницы звуков",
  CAMPAIGN_CARD: "Карточки кампаний",
  ADVERTISING: "Реклама",
  LIVE_REDIRECT: "Перенаправление с эфира",
  RELATED_VIDEO_SHORTS: "Рекомендации к Shorts",
  VIDEO_REMIXES: "Ремиксы",
};

export const DEVICE_LABELS: Record<string, string> = {
  MOBILE: "Телефон", DESKTOP: "Компьютер", TABLET: "Планшет", TV: "Телевизор", GAME_CONSOLE: "Консоль", UNKNOWN_PLATFORM: "Другое",
};

export const PLAYBACK_LABELS: Record<string, string> = {
  WATCH: "Страница просмотра", SHORTS: "Лента Shorts", CHANNEL: "Страница канала", BROWSE: "Главная и подборки",
  EMBEDDED: "Встроенный плеер", YT_OTHER: "Другие страницы", SEARCH: "Поиск", EXTERNAL_APP: "Внешние приложения", MOBILE: "Мобильные",
};

export const AGE_LABELS: Record<string, string> = {
  "age13-17": "13–17", "age18-24": "18–24", "age25-34": "25–34", "age35-44": "35–44", "age45-54": "45–54", "age55-64": "55–64", "age65-": "65+",
};

/** Код страны → флаг-эмодзи + русское название (Intl). */
export function countryName(code: string) {
  const flag = code.length === 2 ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "";
  let name = code;
  try { name = new Intl.DisplayNames(["ru"], { type: "region" }).of(code) ?? code; } catch { /* старый рантайм */ }
  return `${flag} ${name}`.trim();
}

export function pct(x: number | null | undefined, digits = 0) {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits).replace(".", ",")}%`;
}

export function hoursFmt(h: number) {
  return h >= 100 ? Math.round(h).toLocaleString("ru") : h.toFixed(1).replace(".", ",");
}
