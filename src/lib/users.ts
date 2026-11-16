import { sql } from "@/lib/db";

/** Creates/updates the user row, activates pending invites and ensures the personal event. */
export async function onLogin(email: string, name: string | null, image: string | null) {
  const [user] = await sql<{ id: string }[]>`
    insert into users (email, name, image) values (${email.toLowerCase()}, ${name}, ${image})
    on conflict (email) do update set name = excluded.name, image = excluded.image
    returning id`;

  await sql`
    update event_members set user_id = ${user.id}, status = 'ACTIVE'
    where lower(email) = ${email.toLowerCase()} and user_id is null`;

  const personal = await sql`select id from events where created_by = ${user.id} and is_personal`;
  if (personal.length === 0) {
    await sql.begin(async (tx) => {
      const [ev] = await tx<{ id: string }[]>`
        insert into events (name, description, is_personal, created_by, owner_id)
        values ('My Cards', 'Your private collection of business cards', true, ${user.id}, ${user.id})
        on conflict do nothing returning id`;
      if (ev) {
        await tx`
          insert into event_members (event_id, user_id, email, role, status, invited_by)
          values (${ev.id}, ${user.id}, ${email.toLowerCase()}, 'OWNER', 'ACTIVE', ${user.id})`;
      }
    });
  }
  return user.id;
}
