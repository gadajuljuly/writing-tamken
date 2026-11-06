import "server-only";
import { SCHEMA_SQL } from "./schema.sql";

/**
 * Tiny SQL layer that runs on PGlite (local dev / tests, zero setup)
 * or on a real PostgreSQL server when DATABASE_URL is set (production).
 */
type Row = Record<string, any>;
interface Driver {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T>;
}

const g = globalThis as unknown as { __db?: Promise<Driver> };

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
    const wrap = (s: any): Driver => ({
      query: async (text, params = []) => (await s.unsafe(text, params as any[])) as any,
      exec: async (text) => { await s.unsafe(text); },
      transaction: (fn) => sql.begin((tx: any) => fn(wrap(tx))) as any,
    });
    return wrap(sql);
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR || "./.data/pglite";
  const pg = dir === "memory://" ? new PGlite() : new PGlite(dir);
  const wrap = (p: any): Driver => ({
    query: async (text, params = []) => (await p.query(text, params)).rows,
    exec: async (text) => { await p.exec(text); },
    transaction: (fn) => p.transaction((tx: any) => fn(wrap(tx))),
  });
  // PGlite has no nested transaction on tx; reuse same wrapper
  return wrap(pg);
}

export async function db(): Promise<Driver> {
  if (!g.__db) {
    g.__db = (async () => {
      const d = await createDriver();
      await d.exec(SCHEMA_SQL);
      return d;
    })();
    g.__db.catch(() => { g.__db = undefined; });
  }
  return g.__db;
}

export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await db()).query<T>(text, params);
}
export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}
