import "server-only";
// YouTube Data API v3 (публичные данные по ключу), Google OAuth и YouTube Analytics API (закрытые данные канала).
// Базовые адреса можно переопределить переменными окружения — так интеграцию проверяют на заглушке.

const DATA = process.env.YOUTUBE_API_BASE ?? "https://www.googleapis.com/youtube/v3";
const ANALYTICS = process.env.YOUTUBE_ANALYTICS_BASE ?? "https://youtubeanalytics.googleapis.com/v2";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { error?: { message?: string } | string; error_description?: string };
      msg = (typeof j.error === "object" ? j.error?.message : j.error_description ?? j.error) ?? msg;
    } catch { /* не JSON */ }
    throw new ApiError(res.status, `${res.status}: ${msg}`);
  }
  return JSON.parse(text) as T;
}

/** ISO 8601 → секунды: PT1H2M3S → 3723. */
export function isoDuration(s: string | undefined | null) {
  if (!s) return null;
  const m = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, mi, se] = m.map((x) => (x ? parseInt(x, 10) : 0));
  return d * 86400 + h * 3600 + mi * 60 + se;
}

export function videoIdFromUrl(url: string | null | undefined) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|\/shorts\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? (/^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null);
}

// ---------------- Data API ----------------

export type VideoStats = {
  id: string; title: string; channelId: string; channelTitle: string; publishedAt: string;
  durationSec: number | null; views: number | null; likes: number | null; comments: number | null;
  description: string; tags: string[]; categoryId: string | null; language: string | null;
};

export type CommentRow = { id: string; author: string; text: string; likes: number; publishedAt: string; replies: number };

type VideosResponse = {
  items: {
    id: string;
    snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string; description?: string; tags?: string[]; categoryId?: string; defaultAudioLanguage?: string; defaultLanguage?: string };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  }[];
};

const n = (x: string | undefined) => (x == null ? null : Number(x));

export class YouTubeData {
  units = 0;
  constructor(private key: string) {}

  private url(path: string, params: Record<string, string | number | undefined>) {
    const u = new URL(`${DATA}/${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v));
    u.searchParams.set("key", this.key);
    return u.toString();
  }

  async channel(id: string) {
    this.units += 1;
    const r = await getJson<{ items?: { snippet: { title: string }; statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean }; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
      this.url("channels", { part: "snippet,statistics,contentDetails", id }),
    );
    const c = r.items?.[0];
    if (!c) throw new ApiError(404, `Канал ${id} не найден`);
    return {
      title: c.snippet.title,
      subscribers: n(c.statistics.subscriberCount),
      views: n(c.statistics.viewCount),
      videos: n(c.statistics.videoCount),
      uploads: c.contentDetails.relatedPlaylists.uploads,
    };
  }

  /** Статистика нескольких каналов за 1 единицу квоты на 50 каналов. */
  async channelsStats(ids: string[]) {
    const out = new Map<string, { subscribers: number | null; views: number | null; videos: number | null; title: string; uploads: string | null; thumb: string | null }>();
    for (let i = 0; i < ids.length; i += 50) {
      this.units += 1;
      const r = await getJson<{ items?: { id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } }; statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>(
        this.url("channels", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") }),
      );
      for (const c of r.items ?? []) out.set(c.id, {
        title: c.snippet.title, subscribers: n(c.statistics.subscriberCount), views: n(c.statistics.viewCount), videos: n(c.statistics.videoCount),
        uploads: c.contentDetails?.relatedPlaylists?.uploads ?? null, thumb: c.snippet.thumbnails?.default?.url ?? null,
      });
    }
    return out;
  }

  /** Самые залайканные комментарии ролика: 1 единица квоты. */
  async topComments(videoId: string, max = 30): Promise<CommentRow[]> {
    this.units += 1;
    const r = await getJson<{ items?: { id: string; snippet: { totalReplyCount?: number; topLevelComment: { snippet: { authorDisplayName: string; textOriginal?: string; textDisplay: string; likeCount?: number; publishedAt: string } } } }[] }>(
      this.url("commentThreads", { part: "snippet", videoId, order: "relevance", maxResults: Math.min(100, max), textFormat: "plainText" }),
    );
    return (r.items ?? []).map((t) => {
      const c = t.snippet.topLevelComment.snippet;
      return { id: t.id, author: c.authorDisplayName, text: (c.textOriginal ?? c.textDisplay).slice(0, 600), likes: c.likeCount ?? 0, publishedAt: c.publishedAt, replies: t.snippet.totalReplyCount ?? 0 };
    });
  }

  async playlistVideoIds(playlistId: string, max = 200) {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      this.units += 1;
      const r = await getJson<{ items: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>(
        this.url("playlistItems", { part: "contentDetails", playlistId, maxResults: 50, pageToken }),
      );
      ids.push(...r.items.map((i) => i.contentDetails.videoId));
      pageToken = r.nextPageToken;
    } while (pageToken && ids.length < max);
    return ids;
  }

  async videos(ids: string[]): Promise<VideoStats[]> {
    const out: VideoStats[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      this.units += 1;
      const r = await getJson<VideosResponse>(this.url("videos", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") }));
      for (const v of r.items) {
        out.push({
          id: v.id, title: v.snippet.title, channelId: v.snippet.channelId, channelTitle: v.snippet.channelTitle,
          publishedAt: v.snippet.publishedAt, durationSec: isoDuration(v.contentDetails?.duration),
          views: n(v.statistics?.viewCount), likes: n(v.statistics?.likeCount), comments: n(v.statistics?.commentCount),
          description: (v.snippet.description ?? "").slice(0, 1500), tags: v.snippet.tags ?? [], categoryId: v.snippet.categoryId ?? null,
          language: v.snippet.defaultAudioLanguage ?? v.snippet.defaultLanguage ?? null,
        });
      }
    }
    return out;
  }

  /** Поиск роликов. Дорогая операция: 100 единиц квоты за вызов. */
  async search(q: string, opts: { maxResults: number; publishedAfter?: string; order?: "viewCount" | "relevance" }) {
    this.units += 100;
    const r = await getJson<{ items: { id: { videoId?: string } }[] }>(
      this.url("search", {
        part: "snippet", type: "video", q, maxResults: Math.min(50, opts.maxResults),
        order: opts.order ?? "viewCount", relevanceLanguage: "en", videoDuration: "medium", publishedAfter: opts.publishedAfter,
      }),
    );
    return r.items.map((i) => i.id.videoId).filter((x): x is string => Boolean(x));
  }
}

// ---------------- OAuth ----------------

export function oauthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUriFor(req: Request) {
  return process.env.GOOGLE_REDIRECT_URI ?? `${new URL(req.url).origin}/api/auth/google/callback`;
}

export function authUrl(redirectUri: string, state: string) {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(code: string, redirectUri: string) {
  return getJson<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, redirect_uri: redirectUri, grant_type: "authorization_code",
      client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
}

export async function accessToken(refreshToken: string) {
  const r = await getJson<{ access_token: string }>(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken, grant_type: "refresh_token",
      client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  return r.access_token;
}

/** Канал, к которому выдан доступ (youtube.readonly, mine=true). */
export async function myChannel(token: string) {
  const r = await getJson<{ items?: { id: string; snippet: { title: string } }[] }>(`${DATA}/channels?part=snippet&mine=true`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const c = r.items?.[0];
  return c ? { id: c.id, title: c.snippet.title } : null;
}

// ---------------- Analytics ----------------

type Report = { columnHeaders: { name: string }[]; rows?: (string | number)[][] };

export class YouTubeAnalytics {
  constructor(private token: string) {}

  async report(params: Record<string, string>) {
    const u = new URL(`${ANALYTICS}/reports`);
    u.searchParams.set("ids", "channel==MINE");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const r = await getJson<Report>(u.toString(), { headers: { authorization: `Bearer ${this.token}` } });
    const cols = r.columnHeaders.map((c) => c.name);
    return (r.rows ?? []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])) as Record<string, string | number>);
  }

  /** Итоги ролика за период с даты публикации. */
  async videoTotals(videoId: string, start: string, end: string) {
    const base = { startDate: start, endDate: end, filters: `video==${videoId}` };
    const m = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained";
    // engagedViews — засчитываемые просмотры (для шортсов меньше, чем запуски); для лонгов равен views.
    const [row] = await this.report({ ...base, metrics: `engagedViews,${m}` }).catch(() => this.report({ ...base, metrics: m }));
    return row ?? null;
  }

  /** Просмотры по источникам трафика. SUBSCRIBER — «главная и подписки», RELATED_VIDEO — «рекомендации». */
  async videoTraffic(videoId: string, start: string, end: string) {
    const rows = await this.report({ startDate: start, endDate: end, filters: `video==${videoId}`, dimensions: "insightTrafficSourceType", metrics: "views" });
    return Object.fromEntries(rows.map((r) => [String(r.insightTrafficSourceType), Number(r.views)]));
  }

  /** Кривая удержания: доля длительности (0–1) → доля зрителей. */
  async retention(videoId: string, start: string, end: string) {
    const rows = await this.report({ startDate: start, endDate: end, filters: `video==${videoId}`, dimensions: "elapsedVideoTimeRatio", metrics: "audienceWatchRatio" });
    return rows.map((r) => ({ ratio: Number(r.elapsedVideoTimeRatio), watch: Number(r.audienceWatchRatio) }));
  }

  /** Часы просмотра канала за 12 месяцев без Shorts (как считает YPP). */
  async watchHours12m(start: string, end: string): Promise<{ hours: number; withoutShorts: boolean }> {
    try {
      const rows = await this.report({ startDate: start, endDate: end, dimensions: "creatorContentType", metrics: "estimatedMinutesWatched" });
      const minutes = rows.filter((r) => String(r.creatorContentType).toUpperCase() !== "SHORTS").reduce((a, r) => a + Number(r.estimatedMinutesWatched), 0);
      return { hours: minutes / 60, withoutShorts: true };
    } catch {
      const [row] = await this.report({ startDate: start, endDate: end, metrics: "estimatedMinutesWatched" });
      return { hours: Number(row?.estimatedMinutesWatched ?? 0) / 60, withoutShorts: false };
    }
  }
}
