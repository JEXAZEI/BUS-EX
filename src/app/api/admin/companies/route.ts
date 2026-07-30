import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { companyUpsertSchema } from "@/lib/validation";
import { adminUpsertCompany, AdminError } from "@/lib/services/admin";

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

  const parsed = companyUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const c = parsed.data;

  try {
    const id = await adminUpsertCompany({
      id: c.id,
      name: c.name,
      ticker: c.ticker,
      description: c.description ?? "",
      sector: c.sector,
      startingPoolCash: c.startingPoolCash,
      startingPoolShares: c.startingPoolShares,
      volatility: c.volatility,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof AdminError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "That ticker is already in use" }, { status: 409 });
    }
    console.error("Company upsert failed:", err);
    return NextResponse.json({ error: "Failed to save company" }, { status: 500 });
  }
}
