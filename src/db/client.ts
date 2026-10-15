import "server-only";
import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";
import { BOOTSTRAP_SQL } from "./bootstrap";
import { seed } from "./seed";

export type DB = ReturnType<typeof drizzlePglite<typeof schema>>;

type Holder = { db: DB; ready: Promise<void> };
const g = globalThis as unknown as { __agesDb?: Holder };

function create(): Holder {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url });
    const db = drizzlePg(pool, { schema }) as unknown as DB;
    const ready = (async () => {
      await pool.query(BOOTSTRAP_SQL);
      await seed(db);
    })();
    return { db, ready };
  }
  // Локальный режим без установки Postgres: встроенный PostgreSQL (PGlite) в папке .data
  const dir = path.resolve(process.cwd(), process.env.PGLITE_DIR ?? ".data/pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  const ready = (async () => {
    await client.exec(BOOTSTRAP_SQL);
    await seed(db);
  })();
  return { db, ready };
}

export async function getDb(): Promise<DB> {
  if (!g.__agesDb) g.__agesDb = create();
  await g.__agesDb.ready;
  return g.__agesDb.db;
}

export { schema };
