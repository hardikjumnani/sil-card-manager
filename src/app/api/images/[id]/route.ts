import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handle, HttpError, isUuid, requireEventRole } from "@/lib/access";
import { deleteObjects, getObject } from "@/lib/storage";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!isUuid(id)) throw new HttpError(404, "Image not found");
  const [img] = await sql<{ event_id: string; storage_key: string; mime_type: string; uploaded_by: string; status: string }[]>`
    select event_id, storage_key, mime_type, uploaded_by, status from card_images where id = ${id}`;
  if (!img) throw new HttpError(404, "Image not found");
  return img;
}

/** Serves the card image to members of its event. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const img = await load(id);
  await requireEventRole(img.event_id);
  const data = await getObject(img.storage_key);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": img.mime_type, "Cache-Control": "private, max-age=86400" },
  });
});

/** Removes an unprocessed/failed upload (contacts already extracted from it are kept). */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const img = await load(id);
  const { user, role } = await requireEventRole(img.event_id, "EDITOR");
  if (img.uploaded_by !== user.id && role !== "OWNER") throw new HttpError(403, "Not your upload");
  await sql`delete from card_images where id = ${id}`;
  await deleteObjects([img.storage_key]).catch(() => {});
  return NextResponse.json({ ok: true });
});
