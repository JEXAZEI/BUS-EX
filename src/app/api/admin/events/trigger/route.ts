import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({ templateId: z.string().uuid().nullable().optional() });

export async function POST(request: Request) {
  const supabase = await createClient();
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine -- means "pick a random template".
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("trigger_market_event", {
    p_template_id: parsed.data.templateId ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, eventId: data });
}
