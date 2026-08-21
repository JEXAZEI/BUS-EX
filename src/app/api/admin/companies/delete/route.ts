import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import { adminDeleteCompany, AdminError } from "@/lib/services/admin";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

const schema = z.object({ companyId: z.string().uuid() });

// Owner-only, matching the destructiveness of /admin/users/delete -- though
// adminDeleteCompany itself refuses to delete a company that already has
// trade history, so the realistic blast radius here is small.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || profile.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  if (!(await checkAndRecordRateLimit(profile.id, "admin-companies-delete", 60, 30))) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
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
    await adminDeleteCompany(parsed.data.companyId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Company delete failed:", err);
    return NextResponse.json({ error: "Failed to delete company" }, { status: 500 });
  }
}
