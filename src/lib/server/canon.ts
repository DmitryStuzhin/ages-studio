import "server-only";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { DEFAULT_CANON, type Canon } from "@/lib/canon";

export function expandHome(p: string) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

export async function getCanon(): Promise<Canon> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "canon") });
  const v = (row?.value ?? {}) as Partial<Canon>;
  return { ...DEFAULT_CANON, ...v, source: { ...DEFAULT_CANON.source, ...v.source } };
}

export async function saveCanon(next: Canon) {
  const db = await getDb();
  await db.insert(schema.settings).values({ key: "canon", value: next })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next } });
}

function section(md: string, title: RegExp) {
  const lines = md.split(/\r?\n/);
  const i = lines.findIndex((l) => /^#{2,3}\s/.test(l) && title.test(l));
  if (i < 0) return null;
  const out: string[] = [];
  for (const l of lines.slice(i + 1)) {
    if (/^#{1,3}\s/.test(l)) break;
    out.push(l);
  }
  return out.join("\n").trim() || null;
}

/** Самый свежий style.md в videos/* конвейера. */
async function latestStyleFile(dir: string) {
  const videos = path.join(dir, "videos");
  let best: { file: string; mtime: number } | null = null;
  for (const name of await fs.readdir(videos).catch(() => [] as string[])) {
    if (name.startsWith("_") || name === "test" || name === "example") continue;
    const file = path.join(videos, name, "style.md");
    const st = await fs.stat(file).catch(() => null);
    if (st && (!best || st.mtimeMs > best.mtime)) best = { file, mtime: st.mtimeMs };
  }
  return best?.file ?? null;
}

export type CanonImport = { ok: boolean; message: string; changed: string[] };

/** Перечитывает строку стиля и шаблон анимации из локального конвейера. */
export async function importCanonFromPipeline(): Promise<CanonImport> {
  const canon = await getCanon();
  const dir = expandHome(canon.pipelineDir);
  const exists = await fs.stat(dir).then((s) => s.isDirectory()).catch(() => false);
  if (!exists) return { ok: false, message: `Папка конвейера не найдена: ${dir}`, changed: [] };
  const file = await latestStyleFile(dir);
  if (!file) return { ok: false, message: "В videos/*/style.md конвейера нет ни одного файла стиля.", changed: [] };
  const md = await fs.readFile(file, "utf8");
  const next: Canon = { ...canon };
  const changed: string[] = [];
  const style = section(md, /style line|блок стиля|стиль/i)?.split(/\n/).find((l) => l.trim())?.trim();
  if (style && style !== canon.styleLine) { next.styleLine = style; changed.push("строка стиля"); }
  const anim = section(md, /animation|анимац/i)?.split(/\n/).find((l) => l.trim())?.trim();
  if (anim && anim.includes("<MOTION>") && anim !== canon.animTemplate) { next.animTemplate = anim; changed.push("шаблон анимации"); }
  if (style && !style.includes("9:16")) {
    const vertical = style
      .replace(/16:9 horizontal composition, centered subject, plenty of negative space/i, "9:16 vertical composition, subject fills the frame, key action in the middle, no important details in the top 15% and bottom 25%");
    if (vertical !== canon.styleLineVertical && vertical !== style) { next.styleLineVertical = vertical; changed.push("стиль шортсов"); }
  }
  next.source = { importedFrom: path.relative(dir, file), importedAt: new Date().toISOString() };
  await saveCanon(next);
  return { ok: true, message: changed.length ? `Обновлено: ${changed.join(", ")} (из ${next.source.importedFrom}).` : `Канон совпадает с ${next.source.importedFrom} — менять нечего.`, changed };
}
