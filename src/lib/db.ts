import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __sql: Sql | undefined;
}

function client(): Sql {
  if (globalThis.__sql) return globalThis.__sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const ssl = process.env.DATABASE_SSL === "false" || local ? false : "require";
  // prepare:false keeps it compatible with pgbouncer / Supabase's transaction pooler.
  return (globalThis.__sql = postgres(url, { ssl, prepare: false, max: 5, idle_timeout: 20, onnotice: () => {} }));
}

/** Lazily-connected postgres.js client (created on first use, reused across hot reloads). */
export const sql = new Proxy(function () {} as unknown as Sql, {
  apply: (_t, _this, args) => (client() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => {
    const c = client() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});
