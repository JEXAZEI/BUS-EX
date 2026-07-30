import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import { adminSetStartingCash, AdminError } from "@/lib/services/admin";

const schema = z.object({ startingCash: z.number().positive().max(10_000_000) });

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || (profile.role !== "teacher" && profile.role !== "owner")) {
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

  try {
    await adminSetStartingCash(parsed.data.startingCash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
