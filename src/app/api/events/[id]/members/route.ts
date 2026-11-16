import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handle, HttpError, requireEventRole } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await requireEventRole(id);
  const rows = await sql`
    select m.id, m.email, m.role, m.status, m.user_id, m.created_at, u.name, u.image,
           iu.name as invited_by_name, iu.email as invited_by_email
    from event_members m
    left join users u on u.id = m.user_id
    left join users iu on iu.id = m.invited_by
    where m.event_id = ${id}
    order by case m.role when 'OWNER' then 0 when 'EDITOR' then 1 else 2 end, m.created_at`;
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      status: r.status,
      userId: r.user_id,
      name: r.name ?? "",
      image: r.image,
      invitedBy: r.invited_by_name || r.invited_by_email || "",
      createdAt: r.created_at,
    })),
  );
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { user, isPersonal } = await requireEventRole(id, "OWNER");
  if (isPersonal) throw new HttpError(400, "Create an event to collaborate. 'My Cards' is private.");
  const body = await req.json().catch(() => ({}));
  const emails = String(body.emails ?? body.email ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const role = body.role === "VIEWER" ? "VIEWER" : "EDITOR";
  if (emails.length === 0) throw new HttpError(400, "Enter at least one email address");
  const bad = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (bad.length) throw new HttpError(400, `Invalid email: ${bad.join(", ")}`);

  for (const email of emails) {
    const [existing] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
    await sql`
      insert into event_members (event_id, user_id, email, role, status, invited_by)
      values (${id}, ${existing?.id ?? null}, ${email}, ${role}, ${existing ? "ACTIVE" : "PENDING"}, ${user.id})
      on conflict (event_id, email) do nothing`;
  }
  return NextResponse.json({ ok: true }, { status: 201 });
});
