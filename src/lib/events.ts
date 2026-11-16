import { sql } from "@/lib/db";
import type { Role } from "@/lib/access";

export type EventSummary = {
  id: string;
  name: string;
  description: string | null;
  eventDate: string | null;
  isPersonal: boolean;
  role: Role;
  contactCount: number;
  createdAt: string;
  createdBy: { id: string; name: string; email: string };
  owner: { id: string; name: string; email: string };
  members: { name: string; email: string; image: string | null }[];
  memberCount: number;
};

type Row = {
  id: string;
  name: string;
  description: string | null;
  event_date: string | null;
  is_personal: boolean;
  role: Role;
  contact_count: number;
  created_at: Date;
  creator_id: string;
  creator_name: string | null;
  creator_email: string;
  owner_id: string;
  owner_name: string | null;
  owner_email: string;
  members: { name: string | null; email: string; image: string | null }[];
  member_count: number;
};

function map(r: Row): EventSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    eventDate: r.event_date,
    isPersonal: r.is_personal,
    role: r.role,
    contactCount: Number(r.contact_count),
    createdAt: r.created_at.toISOString(),
    createdBy: { id: r.creator_id, name: r.creator_name ?? "", email: r.creator_email },
    owner: { id: r.owner_id, name: r.owner_name ?? "", email: r.owner_email },
    members: (r.members ?? []).map((m) => ({ name: m.name ?? "", email: m.email, image: m.image })),
    memberCount: Number(r.member_count),
  };
}

async function query(userId: string, eventId: string | null) {
  return sql<Row[]>`
    select e.id, e.name, e.description, to_char(e.event_date, 'YYYY-MM-DD') as event_date, e.is_personal,
           m.role, e.created_at,
           (select count(*)::int from contacts c where c.event_id = e.id) as contact_count,
           cu.id as creator_id, cu.name as creator_name, cu.email as creator_email,
           ou.id as owner_id, ou.name as owner_name, ou.email as owner_email,
           (select count(*)::int from event_members x where x.event_id = e.id) as member_count,
           coalesce((select json_agg(json_build_object('name', u.name, 'email', x.email, 'image', u.image))
                     from (select * from event_members x where x.event_id = e.id order by x.created_at limit 5) x
                     left join users u on u.id = x.user_id), '[]'::json) as members
    from events e
    join event_members m on m.event_id = e.id and m.user_id = ${userId} and m.status = 'ACTIVE'
    join users cu on cu.id = e.created_by
    join users ou on ou.id = e.owner_id
    where ${eventId === null ? sql`true` : sql`e.id = ${eventId}`}
    order by e.is_personal desc, coalesce(e.event_date, e.created_at::date) desc, e.created_at desc`;
}

export async function listEventsForUser(userId: string) {
  return (await query(userId, null)).map(map);
}

export async function getEventForUser(userId: string, eventId: string) {
  const rows = await query(userId, eventId);
  return rows[0] ? map(rows[0]) : null;
}
