"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Button, inputCls, Modal, toast } from "./ui";

export function EventForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: { name: string; eventDate: string | null; description: string | null };
  submitLabel: string;
  onSubmit: (v: { name: string; eventDate: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit({ name, eventDate, description });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Event name</span>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Web Summit 2026" required autoFocus maxLength={200} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Date <span className="font-normal text-slate-400">(optional)</span></span>
        <input type="date" className={inputCls} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span></span>
        <textarea className={inputCls} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Where, who, why" maxLength={2000} />
      </label>
      <div className="flex justify-end">
        <Button variant="primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}

export function CreateEventButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus size={16} /> New event
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create an event">
        <EventForm
          submitLabel="Create event"
          onSubmit={async (v) => {
            try {
              const { id } = await api<{ id: string }>("/api/events", { method: "POST", json: v });
              router.push(`/events/${id}`);
            } catch (e) {
              toast((e as Error).message, "error");
            }
          }}
        />
      </Modal>
    </>
  );
}
