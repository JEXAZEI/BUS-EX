import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { getCompanyQuotes } from "@/lib/services/quotes";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The UI polls this every 20s (~3/min); this is well above that so normal
  // use never gets close, but still bounds a tight scripted polling loop.
  if (!(await checkAndRecordRateLimit(profile.id, "companies-prices", 60, 40))) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
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
