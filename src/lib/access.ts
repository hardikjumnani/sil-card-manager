import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export type Role = "OWNER" | "EDITOR" | "VIEWER";
const rank: Record<Role, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError(401, "Not signed in");
  return { id: session.user.id, email: session.user.email ?? "", name: session.user.name ?? "" };
}

/** Returns the caller's role in the event, throwing 403/404 when insufficient. */
export async function requireEventRole(eventId: string, minRole: Role = "VIEWER") {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new HttpError(404, "Event not found");
  const rows = await sql<{ role: Role; is_personal: boolean }[]>`
    select m.role, e.is_personal from event_members m join events e on e.id = m.event_id
    where m.event_id = ${eventId} and m.user_id = ${user.id} and m.status = 'ACTIVE'`;
  if (rows.length === 0) throw new HttpError(404, "Event not found");
  const { role, is_personal } = rows[0];
  if (rank[role] < rank[minRole]) throw new HttpError(403, "You don't have permission to do that");
  return { user, role, isPersonal: is_personal };
}

/** Wraps a route handler so thrown HttpErrors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
