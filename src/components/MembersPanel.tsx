"use client";

import clsx from "clsx";
import { Crown, LogOut, Mail, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { EventSummary } from "@/lib/events";
import { api, Avatar, Badge, Button, inputCls, toast } from "./ui";

type Member = {
  id: string;
  email: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  status: "PENDING" | "ACTIVE";
  userId: string | null;
  name: string;
  image: string | null;
  invitedBy: string;
};

const ROLE_HELP = {
  EDITOR: "Can upload cards, edit rows and export",
  VIEWER: "Can view, copy and export only",
};

export function MembersPanel({ event, currentUserId, onChanged }: { event: EventSummary; currentUserId: string; onChanged: () => void }) {
  const router = useRouter();
  const isOwner = event.role === "OWNER";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<"EDITOR" | "VIEWER">("EDITOR");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await api<Member[]>(`/api/events/${event.id}/members`));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [event.id]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      await load();
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">People in this event</h3>
          <p className="text-xs text-slate-500">
            Created by {event.createdBy.name || event.createdBy.email} · Owned by {event.owner.name || event.owner.email}
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {members === null && <li className="px-5 py-6 text-sm text-slate-400">Loading…</li>}
          {members?.map((m) => {
            const self = m.userId === currentUserId;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.name} email={m.email} image={m.image} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                    {m.name || m.email}
                    {self && <span className="text-xs font-normal text-slate-400">(you)</span>}
                    {m.status === "PENDING" && <Badge tone="amber">Invite pending</Badge>}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {[m.name && m.email, m.invitedBy && m.role !== "OWNER" && `added by ${m.invitedBy}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.role === "OWNER" ? (
                    <Badge tone="indigo"><Crown size={11} className="mr-1" /> Owner</Badge>
                  ) : isOwner ? (
                    <select
                      className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                      value={m.role}
                      onChange={(e) =>
                        act(() => api(`/api/events/${event.id}/members/${m.id}`, { method: "PATCH", json: { role: e.target.value } }), "Role updated")
                      }
                    >
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  ) : (
                    <Badge>{m.role === "EDITOR" ? "Editor" : "Viewer"}</Badge>
                  )}
                  {isOwner && m.role !== "OWNER" && m.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Make owner"
                      onClick={() => {
                        if (!confirm(`Make ${m.name || m.email} the owner of "${event.name}"? You'll become an editor.`)) return;
                        act(() => api(`/api/events/${event.id}/transfer`, { method: "POST", json: { memberId: m.id } }), "Ownership transferred").then(() =>
                          router.refresh(),
                        );
                      }}
                    >
                      <Crown size={14} />
                    </Button>
                  )}
                  {isOwner && m.role !== "OWNER" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-400 hover:text-red-600"
                      title="Remove"
                      onClick={() => confirm(`Remove ${m.name || m.email}?`) && act(() => api(`/api/events/${event.id}/members/${m.id}`, { method: "DELETE" }), "Member removed")}
                    >
                      <X size={14} />
                    </Button>
                  )}
                  {!isOwner && self && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={async () => {
                        if (!confirm(`Leave "${event.name}"? You'll lose access to its cards.`)) return;
                        try {
                          await api(`/api/events/${event.id}/members/${m.id}`, { method: "DELETE" });
                          router.push("/events");
                          router.refresh();
                        } catch (e) {
                          toast((e as Error).message, "error");
                        }
                      }}
                    >
                      <LogOut size={14} /> Leave
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {isOwner ? (
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <UserPlus size={18} /> Add people
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Enter their Google account emails. They&apos;ll see this event as soon as they sign in. Share this site&apos;s link with them.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              await act(() => api(`/api/events/${event.id}/members`, { method: "POST", json: { emails, role } }), "People added");
              setEmails("");
              setBusy(false);
            }}
          >
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-3 text-slate-400" />
              <textarea
                className={clsx(inputCls, "pl-9")}
                rows={3}
                placeholder="alex@company.com, sam@company.com"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["EDITOR", "VIEWER"] as const).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRole(r)}
                  className={clsx(
                    "rounded-lg border px-3 py-2 text-left text-xs",
                    role === r ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <div className="text-sm font-medium text-slate-800">{r === "EDITOR" ? "Editor" : "Viewer"}</div>
                  <div className="text-slate-500">{ROLE_HELP[r]}</div>
                </button>
              ))}
            </div>
            <Button variant="primary" className="w-full" disabled={busy || !emails.trim()}>
              {busy ? "Adding…" : "Add to event"}
            </Button>
          </form>
        </section>
      ) : (
        <section className="h-fit rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          Only the owner can add or remove people. Ask {event.owner.name || event.owner.email} to invite someone.
        </section>
      )}
    </div>
  );
}
