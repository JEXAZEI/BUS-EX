import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export interface ExportRow {
  username: string;
  fullName: string;
  email: string;
  cashBalance: number;
  holdingsValue: number;
  netWorth: number;
  tradeCount: number;
}

/**
 * Final standings for every active student, plus how many trades they made
 * -- meant to be downloaded right before "Reset game for new term" wipes
 * everything, so a teacher has a record for grading.
 */
export async function getTermExportRows(): Promise<ExportRow[]> {
  const result = await db.execute<{
    username: string;
    full_name: string;
    email: string;
    cash_balance: string;
    holdings_value: string;
    net_worth: string;
    trade_count: string;
  }>(sql`
    select
      u.username,
      u.full_name,
      u.email,
      u.cash_balance,
      coalesce(sum(h.shares * (c.pool_cash / c.pool_shares)), 0) as holdings_value,
      u.cash_balance + coalesce(sum(h.shares * (c.pool_cash / c.pool_shares)), 0) as net_worth,
      coalesce(t.trade_count, 0) as trade_count
    from users u
    left join holdings h on h.user_id = u.id
    left join companies c on c.id = h.company_id
    left join (
      select user_id, count(*) as trade_count from trades group by user_id
    ) t on t.user_id = u.id
    where u.role = 'student' and u.is_active
    group by u.id, u.username, u.full_name, u.email, u.cash_balance, t.trade_count
    order by net_worth desc
  `);

  return result.rows.map((r) => ({
    username: r.username,
    fullName: r.full_name,
    email: r.email,
    cashBalance: parseFloat(r.cash_balance),
    holdingsValue: parseFloat(r.holdings_value),
    netWorth: parseFloat(r.net_worth),
    tradeCount: parseInt(r.trade_count, 10),
  }));
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: ExportRow[]): string {
  const header = ["Rank", "Name", "Email", "Username", "Net Worth", "Cash", "Holdings Value", "Trades"];
  const lines = [header.join(",")];
  rows.forEach((r, i) => {
    lines.push(
      [
        i + 1,
        r.fullName,
        r.email,
        r.username,
        r.netWorth.toFixed(2),
        r.cashBalance.toFixed(2),
        r.holdingsValue.toFixed(2),
        r.tradeCount,
      ]
        .map(csvEscape)
        .join(",")
    );
  });
  return lines.join("\r\n");
}
