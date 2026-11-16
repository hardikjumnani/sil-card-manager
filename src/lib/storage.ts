import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const bucket = process.env.SUPABASE_BUCKET || "cards";
let client: SupabaseClient | null = null;

/** Server-only Supabase client using the new secret API key (sb_secret_...). Never expose it to the browser. */
function supabase() {
  const url = projectUrl(process.env.SUPABASE_URL);
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/**
 * Accepts the URL in any common copy-paste form and returns the bare project origin:
 * "https://ref.supabase.co/rest/v1/" -> "https://ref.supabase.co",
 * "https://supabase.com/dashboard/project/ref/..." -> "https://ref.supabase.co".
 */
function projectUrl(raw?: string) {
  const s = raw?.trim().replace(/^["']|["']$/g, "");
  if (!s) return undefined;
  try {
    const u = new URL(s);
    const dash = u.hostname.endsWith("supabase.com") && u.pathname.match(/\/project\/([a-z0-9]+)/);
    return dash ? `https://${dash[1]}.supabase.co` : u.origin;
  } catch {
    return s;
  }
}

const localRoot = path.join(process.cwd(), "uploads");
const localPath = (key: string) => {
  const p = path.join(localRoot, key);
  if (!p.startsWith(localRoot)) throw new Error("Bad storage key");
  return p;
};

export async function putObject(key: string, data: Buffer, contentType: string) {
  const sb = supabase();
  if (sb) {
    const { error } = await sb.storage.from(bucket).upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return;
  }
  if (process.env.VERCEL)
    throw new Error("Image storage isn't configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel, then redeploy.");
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
}

export async function getObject(key: string): Promise<Buffer> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.storage.from(bucket).download(key);
    if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  return readFile(localPath(key));
}

export async function deleteObjects(keys: string[]) {
  if (keys.length === 0) return;
  const sb = supabase();
  if (sb) {
    await sb.storage.from(bucket).remove(keys);
    return;
  }
  await Promise.all(keys.map((k) => unlink(localPath(k)).catch(() => {})));
}
