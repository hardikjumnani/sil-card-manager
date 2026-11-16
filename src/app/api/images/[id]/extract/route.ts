import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handle, HttpError, isUuid, requireEventRole } from "@/lib/access";
import { getObject } from "@/lib/storage";
import { extractCard } from "@/lib/extract";
import { refreshDuplicates } from "@/lib/contacts";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** Runs the vision model on one uploaded card and stores the resulting contact(s). */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  if (!isUuid(id)) throw new HttpError(404, "Image not found");
  const [img] = await sql<{ event_id: string; uploaded_by: string }[]>`
    select event_id, uploaded_by from card_images where id = ${id}`;
  if (!img) throw new HttpError(404, "Image not found");
  const { user } = await requireEventRole(img.event_id, "EDITOR");

  // Claim the image atomically so it is never processed twice (stale PROCESSING claims expire after 3 min).
  const [claimed] = await sql<{ storage_key: string; mime_type: string }[]>`
    update card_images set status = 'PROCESSING', error = null, processed_at = now()
    where id = ${id} and (status in ('UPLOADED','FAILED') or (status = 'PROCESSING' and processed_at < now() - interval '3 minutes'))
    returning storage_key, mime_type`;
  if (!claimed) return NextResponse.json({ status: "skipped", contacts: 0 });

  try {
    const image = await getObject(claimed.storage_key);
    const result = await extractCard(image, claimed.mime_type);
    await sql.begin(async (tx) => {
      for (const data of result.contacts) {
        await tx`
          insert into contacts (event_id, card_image_id, added_by, data)
          values (${img.event_id}, ${id}, ${img.uploaded_by ?? user.id}, ${tx.json(data)})`;
      }
      await tx`
        update card_images set status = 'DONE', provider = ${result.provider},
          raw_json = ${tx.json(result.raw as never)}, processed_at = now(),
          error = ${result.contacts.length === 0 ? "No business card details found in this image" : null}
        where id = ${id}`;
    });
    if (result.contacts.length) await refreshDuplicates(img.event_id);
    return NextResponse.json({ status: "done", contacts: result.contacts.length, provider: result.provider });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("extract failed", id, message);
    await sql`update card_images set status = 'FAILED', error = ${message.slice(0, 1000)} where id = ${id}`;
    return NextResponse.json({ status: "failed", error: friendly(message) }, { status: 502 });
  }
});

function friendly(msg: string) {
  if (/^AI busy/.test(msg)) return "The AI service is overloaded right now. Retry in a minute or two.";
  if (/429|quota|rate limited/i.test(msg)) {
    const mins = Number(msg.match(/retry in ~(\d+) min/)?.[1] ?? 1);
    return mins > 60
      ? `The free AI quota for today is used up. It resets at midnight US Pacific time (about ${Math.round(mins / 60)} h). Add a Groq key or enable Gemini billing to keep going.`
      : `The free AI quota is busy. Retry in about ${mins} minute${mins === 1 ? "" : "s"}.`;
  }
  if (/No vision model/i.test(msg)) return msg;
  return "Couldn't read this card. Retry, or try a clearer photo.";
}
