import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { getCompanyQuotes } from "@/lib/services/quotes";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const quotes = await getCompanyQuotes();
  return NextResponse.json({
    quotes: quotes
      .filter((q) => !q.company.is_delisted)
      .map((q) => ({
        ticker: q.company.ticker,
        price: q.price,
        pctChange: q.pctChange,
      })),
  });
}
