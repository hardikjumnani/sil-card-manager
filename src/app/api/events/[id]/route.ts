import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handle, HttpError, requireEventRole } from "@/lib/access";
import { getEventForUser } from "@/lib/events";
import { deleteObjects } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { user } = await requireEventRole(id);
  return NextResponse.json(await getEventForUser(user.id, id));
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  await requireEventRole(id, "OWNER");
  const body = await req.json().catch(() => ({}));
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 200) : undefined;
  if (name === "") throw new HttpError(400, "Event name is required");
  const description = body.description !== undefined ? String(body.description).trim().slice(0, 2000) || null : undefined;
  const eventDate =
    body.eventDate !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(body.eventDate ?? "") ? body.eventDate : null) : undefined;
  await sql`
    update events set
      name = coalesce(${name ?? null}, name),
      description = ${description === undefined ? sql`description` : description},
      event_date = ${eventDate === undefined ? sql`event_date` : eventDate},
      updated_at = now()
    where id = ${id}`;
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { isPersonal } = await requireEventRole(id, "OWNER");
  if (isPersonal) throw new HttpError(400, "Your personal 'My Cards' space can't be deleted");
  const keys = await sql<{ storage_key: string }[]>`select storage_key from card_images where event_id = ${id}`;
  await sql`delete from events where id = ${id}`;
  await deleteObjects(keys.map((k) => k.storage_key)).catch((e) => console.error("storage cleanup", e));
  return NextResponse.json({ ok: true });
});
