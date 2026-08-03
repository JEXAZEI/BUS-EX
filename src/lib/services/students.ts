import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies as companiesTable, holdings, trades, users } from "@/lib/db/schema";

export interface StudentSummary {
  id: string;
  username: string;
  isActive: boolean;
  cashBalance: number;
  netWorth: number;
}

/** Every student (active or not) with their current cash and net worth, for the admin-only "Students" list. */
export async function listStudents(): Promise<StudentSummary[]> {
  const result = await db.execute<{
    id: string;
    username: string;
    is_active: boolean;
    cash_balance: string;
    net_worth: string;
  }>(sql`
    select
      u.id, u.username, u.is_active, u.cash_balance,
      u.cash_balance + coalesce(sum(h.shares * (c.pool_cash / c.pool_shares)), 0) as net_worth
    from users u
    left join holdings h on h.user_id = u.id
    left join companies c on c.id = h.company_id
    where u.role = 'student'
    group by u.id, u.username, u.is_active, u.cash_balance
    order by u.username
  `);

  return result.rows.map((r) => ({
    id: r.id,
    username: r.username,
    isActive: r.is_active,
    cashBalance: parseFloat(r.cash_balance),
    netWorth: parseFloat(r.net_worth),
  }));
}

export interface StudentDetail {
  id: string;
  username: string;
  isActive: boolean;
  cashBalance: number;
  netWorth: number;
  holdings: { companyId: string; companyName: string; ticker: string; shares: number; value: number }[];
  trades: {
    id: string;
    side: string;
    shares: number;
    cashAmount: number;
    companyName: string;
    ticker: string;
    createdAt: string;
  }[];
}

/** A single student's full portfolio + recent trade history, for an admin/teacher to look up. Read-only. */
export async function getStudentDetail(userId: string): Promise<StudentDetail | null> {
  const [userRow] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, "student")))
    .limit(1);
  if (!userRow) return null;

  const [holdingRows, tradeRows] = await Promise.all([
    db
      .select({ shares: holdings.shares, company: companiesTable })
      .from(holdings)
      .innerJoin(companiesTable, eq(companiesTable.id, holdings.companyId))
      .where(and(eq(holdings.userId, userId), gt(holdings.shares, "0"))),
    db
      .select({
        id: trades.id,
        side: trades.side,
        shares: trades.shares,
        cashAmount: trades.cashAmount,
        createdAt: trades.createdAt,
        companyName: companiesTable.name,
        companyTicker: companiesTable.ticker,
      })
      .from(trades)
      .innerJoin(companiesTable, eq(companiesTable.id, trades.companyId))
      .where(eq(trades.userId, userId))
      .orderBy(desc(trades.createdAt))
      .limit(50),
  ]);

  const holdingsList = holdingRows.map((h) => {
    const price = parseFloat(h.company.poolCash) / parseFloat(h.company.poolShares);
    const shares = parseFloat(h.shares);
    return {
      companyId: h.company.id,
      companyName: h.company.name,
      ticker: h.company.ticker,
      shares,
      value: shares * price,
    };
  });

  const holdingsValue = holdingsList.reduce((sum, h) => sum + h.value, 0);
  const cashBalance = parseFloat(userRow.cashBalance);

  return {
    id: userRow.id,
    username: userRow.username,
    isActive: userRow.isActive,
    cashBalance,
    netWorth: cashBalance + holdingsValue,
    holdings: holdingsList,
    trades: tradeRows.map((t) => ({
      id: t.id,
      side: t.side,
      shares: parseFloat(t.shares),
      cashAmount: parseFloat(t.cashAmount),
      companyName: t.companyName,
      ticker: t.companyTicker,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}
