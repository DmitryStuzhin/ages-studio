// Общие функции для списков роликов: обложки YouTube, релевантность нише, «скорость» просмотров.

export function videoIdOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|\/shorts\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

/** Обложка YouTube без затрат квоты: картинки отдаются напрямую с i.ytimg.com. */
export function thumbUrl(videoId: string, size: "mq" | "hq" = "mq") {
  return `https://i.ytimg.com/vi/${videoId}/${size}default.jpg`;
}

// Признаки исторической ниши. Поисковый запрос «survive 24 hours» тянет блогеров и челленджи —
// по умолчанию в сводке и в промптах остаются только ролики про историю.
const HISTORY = /\b(histor\w*|ancient|medieval|middle ages|empire|roman|rome|egypt\w*|pharaoh|pyramid|viking|samurai|knight|castle|gladiator|pirate|victorian|tudor|aztec|maya|inca|greek|sparta\w*|mongol|ottoman|plague|war\b|wwi|wwii|world war|soldier|trench|civilization|dynasty|king|queen|peasant|serf|slave|prehistoric|stone age|bronze age|iron age|neanderthal|caveman|colonial|frontier|1[0-9]{3}s?|[0-9]{1,2}(st|nd|rd|th) century|bc\b|ad\b|worst jobs?|jobs? in history|life (was|in)|day in the life)\b/i;

export function isHistoryRelevant(m: { title: string; channel?: string | null; tags?: string | null; pinned?: boolean }) {
  if (m.pinned) return true;
  return HISTORY.test(`${m.title} ${m.channel ?? ""}`);
}

export function viewsPerDay(views: number | null | undefined, published: string | Date | null | undefined) {
  if (views == null || !published) return null;
  const days = Math.max(1, (Date.now() - new Date(published).getTime()) / 86400000);
  return Math.round(views / days);
}

export function compact(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",")} млн`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(".", ",")} тыс.`;
  return String(n);
}
