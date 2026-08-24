import type * as schema from "./schema";
import type {
  Profile,
  Company,
  Holding,
  Trade,
  PriceHistoryPoint,
  NetWorthSnapshot,
  MarketEvent,
  EventTemplate,
} from "@/lib/types";

type UserRow = typeof schema.users.$inferSelect;
type CompanyRow = typeof schema.companies.$inferSelect;
type HoldingRow = typeof schema.holdings.$inferSelect;
type TradeRow = typeof schema.trades.$inferSelect;
type PriceHistoryRow = typeof schema.priceHistory.$inferSelect;
type NetWorthSnapshotRow = typeof schema.netWorthSnapshots.$inferSelect;
type EventRow = typeof schema.events.$inferSelect;
type EventTemplateRow = typeof schema.eventTemplates.$inferSelect;

const num = (v: string | number) => (typeof v === "number" ? v : parseFloat(v));
const numOrNull = (v: string | number | null) => (v === null ? null : num(v));

export function toProfile(row: UserRow): Profile {
  return {
    id: row.id,
    username: row.username,
    full_name: row.fullName,
    email: row.email,
    role: row.role,
    cash_balance: num(row.cashBalance),
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
  };
}

export function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    description: row.description,
    sector: row.sector,
    pool_cash: num(row.poolCash),
    pool_shares: num(row.poolShares),
    total_shares: num(row.totalShares),
    starting_pool_cash: num(row.startingPoolCash),
    starting_pool_shares: num(row.startingPoolShares),
    volatility: num(row.volatility),
    is_delisted: row.isDelisted,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toHolding(row: HoldingRow): Holding {
  return { user_id: row.userId, company_id: row.companyId, shares: num(row.shares) };
}

export function toTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    user_id: row.userId,
    company_id: row.companyId,
    side: row.side,
    shares: num(row.shares),
    cash_amount: num(row.cashAmount),
    price_per_share: num(row.pricePerShare),
    created_at: row.createdAt.toISOString(),
  };
}

export function toPriceHistoryPoint(row: PriceHistoryRow): PriceHistoryPoint {
  return {
    id: row.id,
    company_id: row.companyId,
    price: num(row.price),
    recorded_at: row.recordedAt.toISOString(),
  };
}

export function toNetWorthSnapshot(row: NetWorthSnapshotRow): NetWorthSnapshot {
  return {
    id: row.id,
    user_id: row.userId,
    net_worth: num(row.netWorth),
    recorded_at: row.recordedAt.toISOString(),
  };
}

export function toMarketEvent(row: EventRow): MarketEvent {
  return {
    id: row.id,
    event_type: row.eventType,
    title: row.title,
    description: row.description,
    affected_company_ids: row.affectedCompanyIds,
    price_impact_pct: numOrNull(row.priceImpactPct),
    cash_impact: numOrNull(row.cashImpact),
    triggered_by: row.triggeredBy,
    created_at: row.createdAt.toISOString(),
  };
}

export function toEventTemplate(row: EventTemplateRow): EventTemplate {
  return {
    id: row.id,
    event_type: row.eventType,
    title_template: row.titleTemplate,
    description_template: row.descriptionTemplate,
    min_impact_pct: numOrNull(row.minImpactPct),
    max_impact_pct: numOrNull(row.maxImpactPct),
    min_cash: numOrNull(row.minCash),
    max_cash: numOrNull(row.maxCash),
    weight: row.weight,
    is_active: row.isActive,
  };
}
