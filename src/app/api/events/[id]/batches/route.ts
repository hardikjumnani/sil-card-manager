import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handle, requireEventRole } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** Batch history plus images still waiting for extraction (for the "resume" banner). */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { user } = await requireEventRole(id);
  const batches = await sql`
    select b.id, b.created_at, u.name, u.email,
           count(i.id)::int as total,
           count(*) filter (where i.status = 'DONE')::int as done,
           count(*) filter (where i.status = 'FAILED')::int as failed,
           count(*) filter (where i.status in ('UPLOADED','PROCESSING'))::int as pending,
           (select count(*)::int from contacts c join card_images ci on ci.id = c.card_image_id where ci.batch_id = b.id) as contacts
    from batches b join users u on u.id = b.uploaded_by
    left join card_images i on i.batch_id = b.id
    where b.event_id = ${id}
    group by b.id, u.name, u.email
    having count(i.id) > 0
    order by b.created_at desc
    limit 100`;
  const pending = await sql`
    select id, original_name, status, error, size_bytes
    from card_images
    where event_id = ${id} and uploaded_by = ${user.id}
      and (status in ('UPLOADED','FAILED') or (status = 'PROCESSING' and processed_at < now() - interval '3 minutes'))
    order by created_at`;
  return NextResponse.json({
    batches: batches.map((b) => ({
      id: b.id,
      createdAt: b.created_at,
      uploadedBy: b.name || b.email,
      total: b.total,
      done: b.done,
      failed: b.failed,
      pending: b.pending,
      contacts: b.contacts,
    })),
    pending: pending.map((p) => ({ id: p.id, name: p.original_name, status: p.status, error: p.error, size: p.size_bytes })),
  });
});

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { user } = await requireEventRole(id, "EDITOR");
  const [b] = await sql<{ id: string }[]>`
    insert into batches (event_id, uploaded_by) values (${id}, ${user.id}) returning id`;
  return NextResponse.json({ id: b.id }, { status: 201 });
});
