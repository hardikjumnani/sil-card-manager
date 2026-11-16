"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Lock, Pencil, Table2, Trash2, Upload, Users } from "lucide-react";
import type { EventSummary } from "@/lib/events";
import type { ContactRow } from "@/lib/fields";
import { api, Badge, Button, inputCls, Modal, toast } from "./ui";
import { EventForm } from "./CreateEventButton";
import { Uploader } from "./Uploader";
import { ContactsTable } from "./ContactsTable";
import { MembersPanel } from "./MembersPanel";

type Tab = "cards" | "upload" | "members";

export function EventWorkspace({
  event,
  currentUser,
}: {
  event: EventSummary;
  currentUser: { id: string; name: string; email: string };
}) {
  const currentUserId = currentUser.id;
  const router = useRouter();
  const canEdit = event.role !== "VIEWER";
  const isOwner = event.role === "OWNER";
  const [tab, setTab] = useState<Tab>(event.contactCount === 0 && canEdit ? "upload" : "cards");
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);

  const loadContacts = useCallback(async () => {
    try {
      setContacts(await api<ContactRow[]>(`/api/events/${event.id}/contacts`));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [event.id]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Warn before leaving while uploads/extraction are running.
  useEffect(() => {
    if (!uploadBusy) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [uploadBusy]);

  const tabs: { key: Tab; label: string; icon: typeof Table2; count?: number; show: boolean }[] = [
    { key: "upload", label: "Upload cards", icon: Upload, show: canEdit },
    { key: "cards", label: "Cards", icon: Table2, count: contacts?.length, show: true },
    { key: "members", label: "Members", icon: Users, count: event.memberCount, show: !event.isPersonal },
  ];

  return (
    <div>
      <Link href="/events" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> All events
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{event.name}</h1>
            {event.isPersonal ? (
              <Badge><Lock size={11} className="mr-1" /> Private</Badge>
            ) : (
              <Badge tone={isOwner ? "indigo" : "slate"}>You: {event.role.toLowerCase()}</Badge>
            )}
          </div>
          {event.description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{event.description}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {event.eventDate && (
              <span className="flex items-center gap-1">
                <CalendarDays size={12} /> {new Date(event.eventDate + "T00:00:00").toLocaleDateString(undefined, { dateStyle: "medium" })}
              </span>
            )}
            {!event.isPersonal && (
              <>
                <span>Created by <strong className="font-medium text-slate-700">{event.createdBy.name || event.createdBy.email}</strong></span>
                <span>Owner <strong className="font-medium text-slate-700">{event.owner.name || event.owner.email}</strong></span>
              </>
            )}
          </div>
        </div>
        {isOwner && !event.isPersonal && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setEditOpen(true)}><Pencil size={14} /> Edit</Button>
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            <t.icon size={16} /> {t.label}
            {t.count !== undefined && <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
            {t.key === "upload" && uploadBusy && <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />}
          </button>
        ))}
      </div>

      <div className="pt-5">
        {/* Tabs stay mounted so uploads keep running while you look at the table. */}
        <div className={clsx(tab !== "cards" && "hidden")}>
          <ContactsTable
            eventId={event.id}
            eventName={event.name}
            contacts={contacts}
            setContacts={setContacts}
            canEdit={canEdit}
            isOwner={isOwner}
            isPersonal={event.isPersonal}
            currentUserId={currentUserId}
            currentUserName={currentUser.name}
            currentUserEmail={currentUser.email}
          />
        </div>
        {canEdit && (
          <div className={clsx(tab !== "upload" && "hidden")}>
            <Uploader eventId={event.id} onContactsChanged={loadContacts} onBusyChange={setUploadBusy} onViewContacts={() => setTab("cards")} />
          </div>
        )}
        {!event.isPersonal && tab === "members" && (
          <MembersPanel event={event} currentUserId={currentUserId} onChanged={() => router.refresh()} />
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit event">
        <EventForm
          initial={event}
          submitLabel="Save changes"
          onSubmit={async (v) => {
            try {
              await api(`/api/events/${event.id}`, { method: "PATCH", json: v });
              setEditOpen(false);
              router.refresh();
              toast("Event updated");
            } catch (e) {
              toast((e as Error).message, "error");
            }
          }}
        />
      </Modal>
      <DeleteEventModal open={deleteOpen} onClose={() => setDeleteOpen(false)} event={event} />
    </div>
  );
}

function DeleteEventModal({ open, onClose, event }: { open: boolean; onClose: () => void; event: EventSummary }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Delete event">
      <p className="text-sm text-slate-600">
        This permanently deletes <strong>{event.name}</strong>, all {event.contactCount} cards and every uploaded card image, for all members.
      </p>
      <label className="mt-4 block text-sm text-slate-700">
        Type <strong>{event.name}</strong> to confirm
        <input className={clsx(inputCls, "mt-1")} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          disabled={confirm !== event.name || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/events/${event.id}`, { method: "DELETE" });
              router.push("/events");
              router.refresh();
            } catch (e) {
              toast((e as Error).message, "error");
              setBusy(false);
            }
          }}
        >
          Delete forever
        </Button>
      </div>
    </Modal>
  );
}
