import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handle, HttpError, isUuid, requireEventRole } from "@/lib/access";

type Ctx = { params: Promise<{ id: string; memberId: string }> };

async function getMember(eventId: string, memberId: string) {
  if (!isUuid(memberId)) throw new HttpError(404, "Member not found");
  const [m] = await sql<{ id: string; user_id: string | null; role: string }[]>`
    select id, user_id, role from event_members where id = ${memberId} and event_id = ${eventId}`;
  if (!m) throw new HttpError(404, "Member not found");
  return m;
}

/** Change a member's role (EDITOR/VIEWER). Owner only. Use /transfer to change ownership. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id, memberId } = await params;
  await requireEventRole(id, "OWNER");
  const m = await getMember(id, memberId);
  if (m.role === "OWNER") throw new HttpError(400, "Transfer ownership to change the owner's role");
  const body = await req.json().catch(() => ({}));
  const role = body.role === "VIEWER" ? "VIEWER" : body.role === "EDITOR" ? "EDITOR" : null;
  if (!role) throw new HttpError(400, "Role must be EDITOR or VIEWER");
  await sql`update event_members set role = ${role} where id = ${memberId}`;
  return NextResponse.json({ ok: true });
});

/** Owner removes anyone except themselves; any member can remove themselves (leave). */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id, memberId } = await params;
  const { user, role } = await requireEventRole(id);
  const m = await getMember(id, memberId);
  const self = m.user_id === user.id;
  if (m.role === "OWNER") throw new HttpError(400, "The owner can't be removed. Transfer ownership first.");
  if (!self && role !== "OWNER") throw new HttpError(403, "Only the owner can remove members");
  await sql`delete from event_members where id = ${memberId}`;
  return NextResponse.json({ ok: true });
});
