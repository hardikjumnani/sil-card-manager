import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getEventForUser } from "@/lib/events";
import { isUuid } from "@/lib/access";
import { EventWorkspace } from "@/components/EventWorkspace";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const session = await auth();
  const event = await getEventForUser(session!.user.id, id);
  if (!event) notFound();
  const u = session!.user;
  return <EventWorkspace event={event} currentUser={{ id: u.id, name: u.name ?? "", email: u.email ?? "" }} />;
}
