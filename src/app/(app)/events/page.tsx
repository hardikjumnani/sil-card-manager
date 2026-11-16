import Link from "next/link";
import { CalendarDays, Lock, Users } from "lucide-react";
import { auth } from "@/auth";
import { listEventsForUser } from "@/lib/events";
import { Avatar, Badge } from "@/components/ui";
import { CreateEventButton } from "@/components/CreateEventButton";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const session = await auth();
  const events = await listEventsForUser(session!.user.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your events</h1>
          <p className="mt-1 text-sm text-slate-500">
            Each event has its own contact sheet. Invite teammates to scan cards into the same sheet.
          </p>
        </div>
        <CreateEventButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/events/${e.id}`}
            className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-slate-900 group-hover:text-indigo-700">{e.name}</h2>
              {e.isPersonal ? (
                <Badge><Lock size={11} className="mr-1" /> Private</Badge>
              ) : (
                <Badge tone={e.role === "OWNER" ? "indigo" : "slate"}>{e.role.toLowerCase()}</Badge>
              )}
            </div>
            {e.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{e.description}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              {e.eventDate && (
                <span className="flex items-center gap-1">
                  <CalendarDays size={14} /> {new Date(e.eventDate + "T00:00:00").toLocaleDateString(undefined, { dateStyle: "medium" })}
                </span>
              )}
              <span>
                <strong className="text-slate-800">{e.contactCount}</strong> contact{e.contactCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-auto flex items-center justify-between pt-4">
              <div className="flex -space-x-2">
                {e.members.map((m) => (
                  <Avatar key={m.email} name={m.name} email={m.email} image={m.image} size={26} />
                ))}
                {e.memberCount > e.members.length && (
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 ring-2 ring-white">
                    +{e.memberCount - e.members.length}
                  </span>
                )}
              </div>
              {!e.isPersonal && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Users size={12} /> Owner: {e.owner.name || e.owner.email}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
