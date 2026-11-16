import { NextResponse } from "next/server";
import { handle, requireEventRole } from "@/lib/access";
import { listContacts } from "@/lib/contacts";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await requireEventRole(id);
  return NextResponse.json(await listContacts(id));
});
