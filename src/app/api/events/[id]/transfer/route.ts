import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handle, HttpError, isUuid, requireEventRole } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** Transfer ownership to another ACTIVE member. Previous owner becomes an EDITOR. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { user, isPersonal } = await requireEventRole(id, "OWNER");
  if (isPersonal) throw new HttpError(400, "Your personal space can't be transferred");
  const { memberId } = await req.json().catch(() => ({}));
  if (!isUuid(String(memberId))) throw new HttpError(400, "Pick a member");
  const [target] = await sql<{ user_id: string | null; status: string }[]>`
    select user_id, status from event_members where id = ${memberId} and event_id = ${id}`;
  if (!target) throw new HttpError(404, "Member not found");
  if (!target.user_id || target.status !== "ACTIVE")
    throw new HttpError(400, "That person must sign in once (accept the invite) before they can own the event");
  if (target.user_id === user.id) throw new HttpError(400, "You already own this event");

  await sql.begin(async (tx) => {
    await tx`update event_members set role = 'EDITOR' where event_id = ${id} and user_id = ${user.id}`;
    await tx`update event_members set role = 'OWNER' where id = ${memberId}`;
    await tx`update events set owner_id = ${target.user_id}, updated_at = now() where id = ${id}`;
  });
  return NextResponse.json({ ok: true });
});
