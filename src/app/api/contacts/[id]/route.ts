import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handle, HttpError, isUuid, requireEventRole } from "@/lib/access";
import { FIELD_KEYS, type ContactData } from "@/lib/fields";
import { refreshDuplicates } from "@/lib/contacts";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!isUuid(id)) throw new HttpError(404, "Contact not found");
  const [c] = await sql<{ event_id: string; added_by: string; data: ContactData }[]>`
    select event_id, added_by, data from contacts where id = ${id}`;
  if (!c) throw new HttpError(404, "Contact not found");
  return c;
}

/** Edit fields of a contact. Body: { data: { fieldKey: "value", ... } } (merged). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const c = await load(id);
  await requireEventRole(c.event_id, "EDITOR");
  const body = await req.json().catch(() => ({}));
  const next: ContactData = { ...c.data };
  for (const key of FIELD_KEYS) {
    if (body?.data && key in body.data) {
      const v = String(body.data[key] ?? "").trim().slice(0, 5000);
      if (v) next[key] = v;
      else delete next[key];
    }
  }
  await sql`update contacts set data = ${sql.json(next)}, updated_at = now() where id = ${id}`;
  await refreshDuplicates(c.event_id);
  return NextResponse.json({ ok: true, data: next });
});

/** Owners can delete any row; editors can delete rows they added. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const c = await load(id);
  const { user, role } = await requireEventRole(c.event_id, "EDITOR");
  if (role !== "OWNER" && c.added_by !== user.id) throw new HttpError(403, "You can only delete contacts you added");
  await sql`delete from contacts where id = ${id}`;
  await refreshDuplicates(c.event_id);
  return NextResponse.json({ ok: true });
});
