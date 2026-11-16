import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { handle, HttpError, isUuid, requireEventRole } from "@/lib/access";
import { putObject } from "@/lib/storage";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB; the browser shrinks images well below this.
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Upload a single card image into a batch (one request per file, so the browser can show per-file progress). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id: batchId } = await params;
  if (!isUuid(batchId)) throw new HttpError(404, "Batch not found");
  const [batch] = await sql<{ event_id: string; uploaded_by: string }[]>`
    select event_id, uploaded_by from batches where id = ${batchId}`;
  if (!batch) throw new HttpError(404, "Batch not found");
  const { user } = await requireEventRole(batch.event_id, "EDITOR");
  if (batch.uploaded_by !== user.id) throw new HttpError(403, "Not your batch");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file");
  const ext = TYPES[file.type];
  if (!ext) throw new HttpError(415, "Only JPEG, PNG or WEBP images are supported");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Image too large (max 4 MB after compression)");

  const imageId = randomUUID();
  const key = `${batch.event_id}/${batchId}/${imageId}.${ext}`;
  try {
    await putObject(key, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (e) {
    console.error("storage put failed", e);
    throw new HttpError(502, e instanceof Error && /storage/i.test(e.message) ? e.message : "Couldn't save the image. Please retry.");
  }
  const originalName = String(form.get("name") || file.name || "card").slice(0, 255);
  await sql`
    insert into card_images (id, batch_id, event_id, uploaded_by, storage_key, original_name, mime_type, size_bytes)
    values (${imageId}, ${batchId}, ${batch.event_id}, ${user.id}, ${key}, ${originalName}, ${file.type}, ${file.size})`;
  return NextResponse.json({ id: imageId }, { status: 201 });
});
