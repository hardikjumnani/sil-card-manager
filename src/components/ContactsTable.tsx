"use client";

import clsx from "clsx";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Columns3,
  Download,
  FileSpreadsheet,
  ImageIcon,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { CONTACT_FIELDS, META_COLUMNS, metaValue, type ContactData, type ContactRow, type FieldKey, type MetaKey } from "@/lib/fields";
import { api, Badge, Button, inputCls, Modal, toast } from "./ui";

const LABELS: Record<string, string> = Object.fromEntries([...CONTACT_FIELDS, ...META_COLUMNS].map((c) => [c.key, c.label]));
const DEFAULT_VISIBILITY: VisibilityState = {
  ...Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, f.default])),
  addedBy: true,
  addedAt: true,
  duplicate: false,
};
const STORAGE_KEY = "contacts-columns-v1";
const META_KEYS = new Set<string>(META_COLUMNS.map((m) => m.key));

function loadVisibility(): VisibilityState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_VISIBILITY, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_VISIBILITY;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export function ContactsTable({
  eventId,
  eventName,
  contacts,
  setContacts,
  canEdit,
  isOwner,
  currentUserId,
  onUploadClick,
}: {
  eventId: string;
  eventName: string;
  contacts: ContactRow[] | null;
  setContacts: Dispatch<SetStateAction<ContactRow[] | null>>;
  canEdit: boolean;
  isOwner: boolean;
  currentUserId: string;
  onUploadClick?: () => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_VISIBILITY);
  const [colsOpen, setColsOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => setColumnVisibility(loadVisibility()), []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch {}
  }, [columnVisibility]);

  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  const saveField = async (id: string, key: FieldKey, value: string) => {
    const before = contactsRef.current?.find((c) => c.id === id);
    if (!before || (before.data[key] ?? "") === value) return;
    setContacts((cs) => cs?.map((c) => (c.id === id ? { ...c, data: { ...c.data, [key]: value } } : c)) ?? cs);
    try {
      await api(`/api/contacts/${id}`, { method: "PATCH", json: { data: { [key]: value } } });
    } catch (e) {
      setContacts((cs) => cs?.map((c) => (c.id === id ? before : c)) ?? cs);
      toast((e as Error).message, "error");
    }
  };

  const columns = useMemo<ColumnDef<ContactRow>[]>(
    () => [
      {
        id: "select",
        enableHiding: false,
        enableSorting: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all"
            className="h-4 w-4 accent-indigo-600"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected();
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input type="checkbox" aria-label="Select row" className="h-4 w-4 accent-indigo-600" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
        ),
      },
      {
        id: "card",
        enableHiding: false,
        enableSorting: false,
        header: "Card",
        cell: ({ row }) => (
          <button
            onClick={() => setPreviewId(row.original.id)}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
            title="Review card and all fields"
          >
            <ImageIcon size={14} />
            {row.original.isDuplicate && <AlertTriangle size={13} className="text-amber-500" aria-label="Possible duplicate" />}
          </button>
        ),
      },
      ...CONTACT_FIELDS.map<ColumnDef<ContactRow>>((f) => ({
        id: f.key,
        accessorFn: (r) => r.data[f.key] ?? "",
        header: f.label,
        cell: ({ row, getValue }) => (
          <EditableCell value={getValue() as string} editable={canEdit} wide={f.width >= 28} onSave={(v) => saveField(row.original.id, f.key, v)} />
        ),
      })),
      ...META_COLUMNS.map<ColumnDef<ContactRow>>((m) => ({
        id: m.key,
        accessorFn: (r) => (m.key === "addedAt" ? r.createdAt : metaValue(r, m.key)),
        header: m.label,
        cell: ({ row }) => <span className="whitespace-nowrap text-slate-500">{metaValue(row.original, m.key as MetaKey)}</span>,
      })),
    ],
    // saveField reads the latest contacts via a ref, so columns only rebuild when permissions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit],
  );

  const table = useReactTable({
    data: contacts ?? [],
    columns,
    state: { sorting, globalFilter, rowSelection, columnVisibility },
    getRowId: (r) => r.id,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: "includesString",
    autoResetPageIndex: false,
  });

  const rows = table.getRowModel().rows;
  const selected = table.getSelectedRowModel().rows;
  const dataColumns = table.getVisibleLeafColumns().filter((c) => c.id in LABELS);

  const copyForSheets = async () => {
    const source = selected.length ? selected : rows;
    if (!source.length) return toast("Nothing to copy", "info");
    const clean = (v: unknown) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
    const header = dataColumns.map((c) => LABELS[c.id]);
    const lines = source.map((r) =>
      dataColumns.map((c) => clean(META_KEYS.has(c.id) ? metaValue(r.original, c.id as MetaKey) : r.original.data[c.id as FieldKey])),
    );
    await copyText([header, ...lines].map((l) => l.join("\t")).join("\n"));
    toast(`Copied ${source.length} row${source.length === 1 ? "" : "s"}. Paste into cell A1 of your Google Sheet.`);
  };

  const deleteSelected = async () => {
    const allowed = selected.filter((r) => isOwner || r.original.addedById === currentUserId);
    if (!allowed.length) return toast("You can only delete contacts you added", "error");
    const skipped = selected.length - allowed.length;
    if (!confirm(`Delete ${allowed.length} contact${allowed.length > 1 ? "s" : ""}?${skipped ? ` (${skipped} added by others will be kept)` : ""}`)) return;
    const ids = allowed.map((r) => r.original.id);
    const failed: string[] = [];
    for (const id of ids) await api(`/api/contacts/${id}`, { method: "DELETE" }).catch(() => failed.push(id));
    setContacts((cs) => cs?.filter((c) => !ids.includes(c.id) || failed.includes(c.id)) ?? cs);
    setRowSelection({});
    toast(failed.length ? `${failed.length} could not be deleted` : `Deleted ${ids.length - failed.length} contacts`, failed.length ? "error" : "success");
  };

  if (contacts === null) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200/70" />
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <FileSpreadsheet className="text-slate-300" size={44} />
        <h3 className="mt-3 font-semibold text-slate-800">No contacts yet</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">Upload photos of business cards and the AI will fill this sheet with every detail it finds.</p>
        {onUploadClick && (
          <Button variant="primary" className="mt-5" onClick={onUploadClick}>
            <Upload size={16} /> Upload cards
          </Button>
        )}
      </div>
    );
  }

  const previewIndex = previewId ? rows.findIndex((r) => r.original.id === previewId) : -1;
  const previewRow = previewId ? contacts.find((c) => c.id === previewId) : undefined;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={clsx(inputCls, "pl-9")} placeholder="Search contacts…" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {selected.length > 0 && (
            <>
              <span className="text-sm text-slate-500">{selected.length} selected</span>
              {canEdit && (
                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={deleteSelected}>
                  <Trash2 size={14} /> Delete
                </Button>
              )}
            </>
          )}
          <div className="relative">
            <Button size="sm" onClick={() => setColsOpen((o) => !o)}>
              <Columns3 size={14} /> Columns
            </Button>
            {colsOpen && (
              <Popover onClose={() => setColsOpen(false)}>
                <div className="mb-2 flex justify-between gap-2 border-b border-slate-100 pb-2 text-xs">
                  <button className="text-indigo-600 hover:underline" onClick={() => table.toggleAllColumnsVisible(true)}>Show all</button>
                  <button className="text-indigo-600 hover:underline" onClick={() => setColumnVisibility(DEFAULT_VISIBILITY)}>Reset</button>
                </div>
                <div className="max-h-80 space-y-0.5 overflow-auto">
                  {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                      <input type="checkbox" className="accent-indigo-600" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                      {LABELS[c.id]}
                    </label>
                  ))}
                </div>
              </Popover>
            )}
          </div>
          <div className="relative">
            <Button size="sm" onClick={() => setDlOpen((o) => !o)}>
              <Download size={14} /> Download
            </Button>
            {dlOpen && (
              <Popover onClose={() => setDlOpen(false)}>
                <a className="block rounded px-2 py-1.5 text-sm hover:bg-slate-50" href={`/api/events/${eventId}/export?format=xlsx`} onClick={() => setDlOpen(false)}>
                  Excel (.xlsx)
                </a>
                <a className="block rounded px-2 py-1.5 text-sm hover:bg-slate-50" href={`/api/events/${eventId}/export?format=csv`} onClick={() => setDlOpen(false)}>
                  CSV
                </a>
                <p className="mt-1 border-t border-slate-100 px-2 pt-1.5 text-[11px] text-slate-400">All columns, all contacts in “{eventName}”</p>
              </Popover>
            )}
          </div>
          <Button size="sm" variant="primary" onClick={copyForSheets}>
            <ClipboardCopy size={14} /> Copy for Google Sheets{selected.length ? ` (${selected.length})` : ""}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="scroll-thin max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {h.column.getCanSort() ? (
                      <button className="flex items-center gap-1 hover:text-slate-800" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getIsSorted() === "asc" && <ArrowUp size={12} />}
                        {h.column.getIsSorted() === "desc" && <ArrowDown size={12} />}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={clsx("group", r.getIsSelected() ? "bg-indigo-50/60" : "hover:bg-slate-50")}>
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="border-b border-slate-100 px-3 py-1.5 align-top">
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No contacts match “{globalFilter}”.</p>}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {rows.length} of {contacts.length} contacts.{canEdit && " Click any cell to edit."} Copy pastes the visible columns
        {selected.length ? " of the selected rows" : ""}; it lines up as columns in Google Sheets.
      </p>

      {previewRow && (
        <ReviewModal
          key={previewRow.id}
          row={previewRow}
          canEdit={canEdit}
          onClose={() => setPreviewId(null)}
          onSave={async (data) => {
            setContacts((cs) => cs?.map((c) => (c.id === previewRow.id ? { ...c, data } : c)) ?? cs);
            await api(`/api/contacts/${previewRow.id}`, { method: "PATCH", json: { data } });
            toast("Saved");
          }}
          onPrev={previewIndex > 0 ? () => setPreviewId(rows[previewIndex - 1].original.id) : undefined}
          onNext={previewIndex >= 0 && previewIndex < rows.length - 1 ? () => setPreviewId(rows[previewIndex + 1].original.id) : undefined}
        />
      )}
    </div>
  );
}

function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
      {children}
    </div>
  );
}

function EditableCell({ value, editable, wide, onSave }: { value: string; editable: boolean; wide: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const width = wide ? "w-72" : "w-44";
  if (!editing) {
    return (
      <div
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={() => {
          if (!editable) return;
          setDraft(value);
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (editable && e.key === "Enter") {
            setDraft(value);
            setEditing(true);
          }
        }}
        title={value}
        className={clsx(width, "min-h-[28px] truncate rounded px-1.5 py-1", editable && "cursor-text hover:bg-white hover:ring-1 hover:ring-slate-300", !value && "text-slate-300")}
      >
        {value || (editable ? "—" : "")}
      </div>
    );
  }
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onSave(draft.trim());
  };
  return (
    <textarea
      autoFocus
      rows={Math.min(4, Math.max(1, Math.ceil(draft.length / (wide ? 40 : 24))))}
      className={clsx(width, "block resize-none rounded border border-indigo-400 bg-white px-1.5 py-1 text-sm outline-none ring-2 ring-indigo-500/20")}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function ReviewModal({
  row,
  canEdit,
  onClose,
  onSave,
  onPrev,
  onNext,
}: {
  row: ContactRow;
  canEdit: boolean;
  onClose: () => void;
  onSave: (d: ContactData) => Promise<void>;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [draft, setDraft] = useState<ContactData>(row.data);
  const [busy, setBusy] = useState(false);
  const dirty = CONTACT_FIELDS.some((f) => (draft[f.key] ?? "") !== (row.data[f.key] ?? ""));

  const save = async () => {
    setBusy(true);
    try {
      const full: ContactData = {};
      for (const f of CONTACT_FIELDS) full[f.key] = (draft[f.key] ?? "").trim();
      await onSave(full);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={row.data.fullName || row.data.company || "Contact"} wide>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="md:sticky md:top-16 md:self-start">
          {row.cardImageId ? (
            <a href={`/api/images/${row.cardImageId}`} target="_blank" rel="noreferrer" title="Open full size">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/images/${row.cardImageId}`} alt="Business card" className="w-full rounded-xl border border-slate-200 bg-slate-50 object-contain" />
            </a>
          ) : (
            <div className="flex aspect-[16/10] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-400">Image not available</div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Added by <strong className="text-slate-700">{row.addedByName || row.addedByEmail}</strong></span>
            <span>· {new Date(row.createdAt).toLocaleString()}</span>
            {row.isDuplicate && <Badge tone="amber">Possible duplicate</Badge>}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={!onPrev} onClick={onPrev}><ChevronLeft size={14} /> Previous</Button>
            <Button size="sm" disabled={!onNext} onClick={onNext}>Next <ChevronRight size={14} /></Button>
          </div>
        </div>
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            {CONTACT_FIELDS.map((f) => (
              <label key={f.key} className={clsx("block", f.width >= 28 && "sm:col-span-2")}>
                <span className="mb-0.5 block text-xs font-medium text-slate-500">{f.label}</span>
                <input
                  className={inputCls}
                  value={draft[f.key] ?? ""}
                  readOnly={!canEdit}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          {canEdit && (
            <div className="sticky bottom-0 -mx-5 mt-4 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 pt-3">
              <Button onClick={() => setDraft(row.data)} disabled={!dirty || busy}>Undo changes</Button>
              <Button variant="primary" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
