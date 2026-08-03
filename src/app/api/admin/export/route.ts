import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { getTermExportRows, toCsv } from "@/lib/services/export";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || (profile.role !== "teacher" && profile.role !== "owner")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const rows = await getTermExportRows();
  const csv = toCsv(rows);
  const filename = `bus-ex-results-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
