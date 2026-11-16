import { sql } from "@/lib/db";
import type { ContactData, ContactRow } from "@/lib/fields";
import { identityKeys } from "@/lib/extract/normalize";

export async function listContacts(eventId: string): Promise<ContactRow[]> {
  const rows = await sql<
    {
      id: string;
      data: ContactData;
      added_by: string;
      name: string | null;
      email: string;
      created_at: Date;
      card_image_id: string | null;
      is_duplicate: boolean;
    }[]
  >`
    select c.id, c.data, c.added_by, u.name, u.email, c.created_at, c.card_image_id, c.is_duplicate
    from contacts c join users u on u.id = c.added_by
    where c.event_id = ${eventId}
    order by c.created_at desc, c.id`;
  return rows.map((r) => ({
    id: r.id,
    data: r.data ?? {},
    addedById: r.added_by,
    addedByName: r.name ?? "",
    addedByEmail: r.email,
    createdAt: r.created_at.toISOString(),
    cardImageId: r.card_image_id,
    isDuplicate: r.is_duplicate,
  }));
}

/** Flags contacts within an event that share an email or phone number with another contact. */
export async function refreshDuplicates(eventId: string) {
  const rows = await sql<{ id: string; data: ContactData; is_duplicate: boolean }[]>`
    select id, data, is_duplicate from contacts where event_id = ${eventId}`;
  const owners = new Map<string, Set<string>>();
  for (const r of rows)
    for (const k of identityKeys(r.data ?? {})) {
      if (!owners.has(k)) owners.set(k, new Set());
      owners.get(k)!.add(r.id);
    }
  const dup = new Set<string>();
  for (const ids of owners.values()) if (ids.size > 1) ids.forEach((id) => dup.add(id));
  const changedOn = rows.filter((r) => dup.has(r.id) && !r.is_duplicate).map((r) => r.id);
  const changedOff = rows.filter((r) => !dup.has(r.id) && r.is_duplicate).map((r) => r.id);
  if (changedOn.length) await sql`update contacts set is_duplicate = true where id in ${sql(changedOn)}`;
  if (changedOff.length) await sql`update contacts set is_duplicate = false where id in ${sql(changedOff)}`;
}
