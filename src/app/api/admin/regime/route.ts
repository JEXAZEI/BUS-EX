import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import { setRegime } from "@/lib/services/regime";

const schema = z.object({
  regime: z.enum(["bull", "bear", "neutral"]),
  durationHours: z.number().positive().max(240).optional(),
});

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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const durationMinutes = parsed.data.durationHours ? parsed.data.durationHours * 60 : undefined;
  await setRegime(parsed.data.regime, durationMinutes);
  return NextResponse.json({ ok: true });
}
