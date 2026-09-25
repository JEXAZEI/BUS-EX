import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { adminRenameSchema } from "@/lib/validation";
import { renameUserAsStaff, RenameNotPermittedError } from "@/lib/services/users";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

// Teachers and owners. renameUserAsStaff additionally enforces that a
// teacher may only rename a *student*.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || (profile.role !== "teacher" && profile.role !== "owner")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!(await checkAndRecordRateLimit(profile.id, "admin-users-rename", 60, 30))) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = adminRenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid name" },
      { status: 400 }
    );
  }

  try {
    await renameUserAsStaff(parsed.data.userId, parsed.data.fullName, profile.role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RenameNotPermittedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Admin rename failed:", err);
    return NextResponse.json({ error: "Could not update that name" }, { status: 500 });
  }
}
