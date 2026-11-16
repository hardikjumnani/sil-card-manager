// Applies db/schema.sql to DATABASE_URL. Usage: npm run db:migrate
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (put it in .env.local)");
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const ssl = process.env.DATABASE_SSL === "false" || local ? false : "require";
const sql = postgres(url, { ssl, prepare: false, max: 1, onnotice: () => {} });
const schema = readFileSync(fileURLToPath(new URL("../db/schema.sql", import.meta.url)), "utf8");
try {
  await sql.unsafe(schema);
  console.log("Database schema applied.");
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
