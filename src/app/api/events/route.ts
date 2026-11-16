import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handle, HttpError, requireUser } from "@/lib/access";
import { listEventsForUser } from "@/lib/events";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json(await listEventsForUser(user.id));
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 200);
  if (!name) throw new HttpError(400, "Event name is required");
  const description = String(body.description ?? "").trim().slice(0, 2000) || null;
  const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(body.eventDate ?? "") ? body.eventDate : null;

  const id = await sql.begin(async (tx) => {
    const [ev] = await tx<{ id: string }[]>`
      insert into events (name, description, event_date, created_by, owner_id)
      values (${name}, ${description}, ${eventDate}, ${user.id}, ${user.id}) returning id`;
    await tx`
      insert into event_members (event_id, user_id, email, role, status, invited_by)
      values (${ev.id}, ${user.id}, ${user.email.toLowerCase()}, 'OWNER', 'ACTIVE', ${user.id})`;
    return ev.id;
  });
  return NextResponse.json({ id }, { status: 201 });
});
