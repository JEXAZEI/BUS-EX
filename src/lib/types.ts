export type UserRole = "student" | "teacher" | "owner";
export type TradeSide = "buy" | "sell";
export type EventType =
  | "price_shock"
  | "sector_move"
  | "scandal_delist"
  | "relist"
  | "cash_bonus"
  | "cash_tax";

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  cash_balance: number;
  is_active: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  ticker: string;
  description: string;
  sector: string;
  pool_cash: number;
  pool_shares: number;
  total_shares: number;
  starting_pool_cash: number;
  starting_pool_shares: number;
  volatility: number;
  is_delisted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Holding {
  user_id: string;
  company_id: string;
  shares: number;
}

export interface Trade {
  id: string;
  user_id: string;
  company_id: string;
  side: TradeSide;
  shares: number;
  cash_amount: number;
  price_per_share: number;
  created_at: string;
}

export interface PriceHistoryPoint {
  id: number;
  company_id: string;
  price: number;
  recorded_at: string;
}

export interface NetWorthSnapshot {
  id: number;
  user_id: string;
  net_worth: number;
  recorded_at: string;
}

export interface MarketEvent {
  id: string;
  event_type: EventType;
  title: string;
  description: string;
  affected_company_ids: string[];
  price_impact_pct: number | null;
  cash_impact: number | null;
  triggered_by: string | null;
  created_at: string;
}

export interface EventTemplate {
  id: string;
  event_type: EventType;
  title_template: string;
  description_template: string;
  min_impact_pct: number | null;
  max_impact_pct: number | null;
  min_cash: number | null;
  max_cash: number | null;
  weight: number;
  is_active: boolean;
}

export function companyPrice(company: Pick<Company, "pool_cash" | "pool_shares">): number {
  return company.pool_cash / company.pool_shares;
}
