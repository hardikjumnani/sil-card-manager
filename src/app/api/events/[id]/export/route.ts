import ExcelJS from "exceljs";
import { sql } from "@/lib/db";
import { handle, HttpError, isUuid, requireEventRole } from "@/lib/access";
import { listContacts } from "@/lib/contacts";
import { CONTACT_FIELDS, META_COLUMNS } from "@/lib/fields";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** GET ?format=xlsx|csv[&addedBy=<userId>] — exports the event's cards (optionally one person's), including "Added By". */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  await requireEventRole(id);
  const q = new URL(req.url).searchParams;
  const format = q.get("format") === "csv" ? "csv" : "xlsx";
  const addedBy = q.get("addedBy");
  if (addedBy && !isUuid(addedBy)) throw new HttpError(400, "Invalid person");
  const [ev] = await sql<{ name: string }[]>`select name from events where id = ${id}`;
  const contacts = (await listContacts(id)).filter((c) => !addedBy || c.addedById === addedBy);
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (s: string) => s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
  let who = "";
  if (addedBy) {
    const [u] = await sql<{ name: string | null; email: string }[]>`select name, email from users where id = ${addedBy}`;
    who = u ? "_" + safe(u.name?.split(/\s+/)[0] || u.email.split("@")[0]) : "";
  }
  const base = `${safe(ev.name) || "cards"}${who}_${stamp}`;

  const header = [...CONTACT_FIELDS.map((f) => f.label), ...META_COLUMNS.map((m) => m.label)];
  const rows = contacts.map((c) => [
    ...CONTACT_FIELDS.map((f) => c.data[f.key] ?? ""),
    c.addedByName || c.addedByEmail,
    new Date(c.createdAt),
    c.isDuplicate ? "Yes" : "",
  ]);

  if (format === "csv") {
    const esc = (v: unknown) => {
      const s = v instanceof Date ? v.toISOString().replace("T", " ").slice(0, 19) : String(v ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Scaler Business Cards Manager";
  const ws = wb.addWorksheet("Cards", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [...CONTACT_FIELDS, ...META_COLUMNS].map((c) => ({ header: c.label, key: c.key, width: c.width }));
  rows.forEach((r) => ws.addRow(r));
  const header1 = ws.getRow(1);
  header1.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  ws.getColumn(CONTACT_FIELDS.length + 2).numFmt = "yyyy-mm-dd hh:mm";
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
});
