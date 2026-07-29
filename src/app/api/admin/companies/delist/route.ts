import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import { adminSetCompanyDelisted } from "@/lib/services/admin";

const schema = z.object({ companyId: z.string().uuid(), delisted: z.boolean() });

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "teacher" && profile.role !== "owner")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await adminSetCompanyDelisted(parsed.data.companyId, parsed.data.delisted);
  return NextResponse.json({ ok: true });
}
