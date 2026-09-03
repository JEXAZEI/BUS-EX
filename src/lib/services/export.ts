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

function csvQuote(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Neutralises a cell that Excel/Sheets would otherwise evaluate as a formula.
 *
 * Validation already keeps commas, quotes and newlines out of every field, so
 * the file's structure can't be broken -- but it does allow a leading `-`
 * in a name (legitimately, for hyphenated names) and a leading `+`, `@` or
 * `-` in a username or email. All four are formula lead-ins, so a student
 * registering as "-Alice" or "@bob" turns the teacher's gradebook cell into
 * a #NAME? error on open. `=` is already rejected everywhere, and none of
 * `( ) | !` can get through either, so this is spreadsheet corruption rather
 * than a code-execution route -- still worth not shipping.
 *
 * The standard mitigation: prefix a single quote, which spreadsheets strip on
 * display and treat as "this cell is text". Applied only to the free-text
 * columns; the numeric ones are produced by toFixed here, so guarding them
 * would just turn a negative number into a string and break sorting.
 */
function csvGuardFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? csvQuote(`'${value}`) : csvQuote(value);
}

export function toCsv(rows: ExportRow[]): string {
  const header = ["Rank", "Name", "Email", "Username", "Net Worth", "Cash", "Holdings Value", "Trades"];
  const lines = [header.join(",")];
  rows.forEach((r, i) => {
    lines.push(
      [
        csvQuote(i + 1),
        csvGuardFormula(r.fullName),
        csvGuardFormula(r.email),
        csvGuardFormula(r.username),
        csvQuote(r.netWorth.toFixed(2)),
        csvQuote(r.cashBalance.toFixed(2)),
        csvQuote(r.holdingsValue.toFixed(2)),
        csvQuote(r.tradeCount),
      ].join(",")
    );
  });
  return lines.join("\r\n");
}
