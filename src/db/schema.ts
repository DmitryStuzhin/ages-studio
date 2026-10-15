import { pgTable, serial, text, integer, boolean, timestamp, jsonb, real, date, primaryKey } from "drizzle-orm/pg-core";

export const promptVersions = pgTable("prompt_versions", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),
  constitution: text("constitution").notNull(),
  steps: jsonb("steps").$type<Record<string, string>>().notNull(),
  changelog: text("changelog").notNull().default(""),
  status: text("status").$type<"active" | "archived">().notNull().default("archived"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promptProposals = pgTable("prompt_proposals", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  sourceProjectId: integer("source_project_id"),
  status: text("status").$type<"pending" | "accepted" | "rejected">().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lessons = pgTable("lessons", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  evidence: text("evidence").notNull().default(""),
  /** На скольких роликах подтверждён. */
  confirmations: integer("confirmations").notNull().default(1),
  status: text("status").$type<"proposed" | "hypothesis" | "confirmed" | "retired">().notNull().default("hypothesis"),
  scope: text("scope").$type<"long" | "short" | "both">().notNull().default("long"),
  sourceProjectId: integer("source_project_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectParams = {
  role?: string;
  place?: string;
  era?: string;
  durationMin?: number;
  language?: string;
  structureKey?: string;
  hookTypeKey?: string;
  styleBlock?: string;
  /** true — строка стиля этого ролика отличается от канона. */
  styleOverride?: boolean;
  /** Папка ролика в локальном конвейере: videos/<slug>. */
  pipelineSlug?: string;
  nextRole?: string;
  answerWord?: string;
  chosenHook?: string;
  frameRange?: string;
  // шортс
  parentId?: number;
  threat?: string;
  notes?: string;
};

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<"long" | "short">().notNull(),
  title: text("title").notNull(),
  status: text("status").$type<"draft" | "in_progress" | "ready" | "published" | "archived">().notNull().default("draft"),
  /** legacy — ролик снят до платформы, хранит только метрики и уроки. */
  legacy: boolean("legacy").notNull().default(false),
  format: text("format").notNull().default("survive24"),
  params: jsonb("params").$type<ProjectParams>().notNull().default({}),
  promptVersionId: integer("prompt_version_id"),
  parentId: integer("parent_id"),
  youtubeUrl: text("youtube_url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GateResult = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "info";
  detail: string;
};

export const stepRuns = pgTable("step_runs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  stepKey: text("step_key").notNull(),
  attempt: integer("attempt").notNull().default(1),
  prompt: text("prompt").notNull().default(""),
  output: text("output").notNull().default(""),
  source: text("source").$type<"manual" | "mock" | "api">().notNull().default("manual"),
  model: text("model"),
  gates: jsonb("gates").$type<GateResult[]>().notNull().default([]),
  approved: boolean("approved").notNull().default(false),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RetentionPoint = { t: number; pct: number };

export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  day: integer("day").notNull(), // 2, 7, 28
  views: integer("views"),
  browseViews: integer("browse_views"), // главная + рекомендации
  shortsViews: integer("shorts_views"),
  ctr: real("ctr"),
  avgViewPct: real("avg_view_pct"),
  avgViewSec: integer("avg_view_sec"),
  subsGained: integer("subs_gained"),
  watchHours: real("watch_hours"),
  engagedPct: real("engaged_pct"), // для шортсов: доля «продолжили смотреть»
  retention: jsonb("retention").$type<RetentionPoint[]>().notNull().default([]),
  notes: text("notes").notNull().default(""),
  source: text("source").$type<"manual" | "api">().notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channelSnapshots = pgTable("channel_snapshots", {
  id: serial("id").primaryKey(),
  day: date("day").notNull(),
  subscribers: integer("subscribers").notNull(),
  watchHours12m: real("watch_hours_12m"),
  shortsViews90d: integer("shorts_views_90d"),
  source: text("source").$type<"manual" | "api">().notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const marketItems = pgTable("market_items", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<"competitor_video" | "query" | "comment_theme" | "note">().notNull(),
  title: text("title").notNull(),
  channel: text("channel"),
  url: text("url"),
  views: integer("views"),
  publishedAt: date("published_at"),
  angle: text("angle").notNull().default(""),
  tags: text("tags").notNull().default(""),
  source: text("source").$type<"manual" | "api">().notNull().default("manual"),
  externalId: text("external_id"),
  channelId: text("channel_id"),
  /** Подписчики канала-автора: views / channelSubs — насколько ролик «выстрелил» относительно канала. */
  channelSubs: integer("channel_subs"),
  durationSec: integer("duration_sec"),
  likes: integer("likes"),
  comments: integer("comments"),
  /** Скрыт автором как нерелевантный: не показывается и не уходит в промпты, при синхронизации не возвращается. */
  hidden: boolean("hidden").notNull().default(false),
  /** Отмечен автором как важный референс: всегда попадает в промпты первым. */
  pinned: boolean("pinned").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channelVideos = pgTable("channel_videos", {
  videoId: text("video_id").primaryKey(),
  title: text("title").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  durationSec: integer("duration_sec"),
  views: integer("views"),
  likes: integer("likes"),
  comments: integer("comments"),
  isShort: boolean("is_short").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const videoHistory = pgTable("video_history", {
  videoId: text("video_id").notNull(),
  day: date("day").notNull(),
  views: integer("views"),
  likes: integer("likes"),
  comments: integer("comments"),
}, (t) => [primaryKey({ columns: [t.videoId, t.day] })]);

export const channelReports = pgTable("channel_reports", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SyncLogLine = { level: "ok" | "warn" | "error"; text: string };

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").$type<"schedule" | "manual" | "startup">().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok"),
  quotaUnits: integer("quota_units").notNull().default(0),
  log: jsonb("log").$type<SyncLogLine[]>().notNull().default([]),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
