import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const bucket = process.env.SUPABASE_BUCKET || "cards";
let client: SupabaseClient | null = null;

/** Server-only Supabase client using the new secret API key (sb_secret_...). Never expose it to the browser. */
function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
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
