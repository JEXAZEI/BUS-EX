import "server-only";
import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db/client";
import type { EventType } from "@/lib/types";

export class EventError extends Error {}

interface TemplateRow {
  id: string;
  event_type: EventType;
  title_template: string;
  description_template: string;
  min_impact_pct: string | null;
  max_impact_pct: string | null;
  min_cash: string | null;
  max_cash: string | null;
}

export function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Shifts a company's spot price by `impactPct` by rescaling pool_cash only
 * (pool_shares is left untouched). Shared by admin/random market events and
 * by the ambient background drift in src/lib/services/drift.ts.
 *
 * pool_shares is never touched here because it's share-conservation
 * accounting -- pool_shares + everyone's holdings must always add up to
 * total_shares, which is only true for real trades (executeTrade in
 * trades.ts). A price shock has no counterparty and no shares actually
 * change hands, so scaling pool_shares here (an earlier version did, via
 * sqrt(factor) on both sides to hold pool_cash * pool_shares constant)
 * could push pool_shares above total_shares -- companies start with
 * pool_shares === total_shares, so even one negative-impact tick could
 * violate the DB's pool_shares <= total_shares check constraint and
 * silently break that company's price updates from then on.
 */
export async function applyPriceShock(
  client: PoolClient,
  companyId: string,
  impactPct: number,
  recordedAt: Date = new Date()
): Promise<number | null> {
  const res = await client.query<{ pool_cash: string; pool_shares: string; is_delisted: boolean }>(
    `select pool_cash, pool_shares, is_delisted from companies where id = $1 for update`,
    [companyId]
  );
  const company = res.rows[0];
  if (!company || company.is_delisted) return null;

  let factor = 1 + impactPct;
  if (factor <= 0.01) factor = 0.01;

  const poolCash = parseFloat(company.pool_cash);
  const poolShares = parseFloat(company.pool_shares);
  const newPoolCash = poolCash * factor;

  await client.query(
    `update companies set pool_cash = $1, updated_at = now() where id = $2`,
    [newPoolCash, companyId]
  );

  const newPrice = round(newPoolCash / poolShares, 6);
  // recordedAt defaults to "now" for a normal admin/random event, but
  // ambient drift's catch-up backfill (drift.ts) passes historical
  // timestamps so a long-idle company's chart fills in with realistic
  // intermediate points instead of one point dated "now".
  await client.query(`insert into price_history (company_id, price, recorded_at) values ($1, $2, $3)`, [
    companyId,
    newPrice,
    recordedAt,
  ]);

  return newPrice;
}

function substitute(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

/**
 * Core worker shared by the admin-triggered and system/cron-triggered
 * entry points. Not exported directly -- callers must decide (and enforce)
 * who's allowed to invoke it before calling runMarketEvent.
 */
export async function runMarketEvent(
  templateId: string | null,
  triggeredBy: string | null
): Promise<string> {
  return withTransaction(async (client) => {
    let template: TemplateRow | undefined;
    if (templateId) {
      const res = await client.query<TemplateRow>(
        `select id, event_type, title_template, description_template,
                min_impact_pct, max_impact_pct, min_cash, max_cash
         from event_templates where id = $1`,
        [templateId]
      );
      template = res.rows[0];
    } else {
      const res = await client.query<TemplateRow>(
        `select id, event_type, title_template, description_template,
                min_impact_pct, max_impact_pct, min_cash, max_cash
         from event_templates where is_active order by random() * weight desc limit 1`
      );
      template = res.rows[0];
    }
    if (!template) throw new EventError("No event template available");

    const requireRange = (min: string | null, max: string | null, label: string): [number, number] => {
      if (min === null || max === null) {
        throw new EventError(`Event template is missing ${label} and can't be used`);
      }
      return [parseFloat(min), parseFloat(max)];
    };

    let title = "";
    let description = "";
    let affected: string[] = [];
    let impactPct: number | null = null;
    let cashAmount: number | null = null;

    if (
      template.event_type === "price_shock" ||
      template.event_type === "scandal_delist" ||
      template.event_type === "relist"
    ) {
      const wantDelisted = template.event_type === "relist";
      const res = await client.query<{ id: string; name: string }>(
        `select id, name from companies where is_delisted = $1 order by random() limit 1`,
        [wantDelisted]
      );
      const company = res.rows[0];
      if (!company) throw new EventError("No eligible company for this event");
      affected = [company.id];

      if (template.event_type === "price_shock") {
        impactPct = randomInRange(
          ...requireRange(template.min_impact_pct, template.max_impact_pct, "min/max impact %")
        );
        await applyPriceShock(client, company.id, impactPct);
        title = substitute(template.title_template, { company: company.name });
        description = substitute(template.description_template, {
          company: company.name,
          pct: `${(impactPct * 100).toFixed(1)}%`,
        });
      } else if (template.event_type === "scandal_delist") {
        await client.query(
          `update companies set is_delisted = true, updated_at = now() where id = $1`,
          [company.id]
        );
        title = substitute(template.title_template, { company: company.name });
        description = substitute(template.description_template, { company: company.name });
      } else {
        await client.query(
          `update companies set is_delisted = false, updated_at = now() where id = $1`,
          [company.id]
        );
        title = substitute(template.title_template, { company: company.name });
        description = substitute(template.description_template, { company: company.name });
      }
    } else if (template.event_type === "sector_move") {
      const sectorRes = await client.query<{ sector: string }>(
        `select sector from companies where not is_delisted order by random() limit 1`
      );
      const sector = sectorRes.rows[0]?.sector;
      if (!sector) throw new EventError("No eligible sector for this event");

      impactPct = randomInRange(
        ...requireRange(template.min_impact_pct, template.max_impact_pct, "min/max impact %")
      );

      const companiesRes = await client.query<{ id: string }>(
        `select id from companies where sector = $1 and not is_delisted`,
        [sector]
      );
      affected = companiesRes.rows.map((r) => r.id);
      for (const id of affected) {
        await applyPriceShock(client, id, impactPct);
      }

      title = substitute(template.title_template, { sector });
      description = substitute(template.description_template, {
        sector,
        pct: `${(impactPct * 100).toFixed(1)}%`,
      });
    } else if (template.event_type === "cash_bonus" || template.event_type === "cash_tax") {
      cashAmount = round(
        randomInRange(...requireRange(template.min_cash, template.max_cash, "min/max cash")),
        2
      );
      if (template.event_type === "cash_tax") {
        await client.query(
          `update users set cash_balance = greatest(cash_balance - $1, 0) where role = 'student' and is_active`,
          [cashAmount]
        );
      } else {
        await client.query(
          `update users set cash_balance = cash_balance + $1 where role = 'student' and is_active`,
          [cashAmount]
        );
      }
      title = template.title_template;
      description = substitute(template.description_template, {
        amount: `$${cashAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      });
    }

    const eventRes = await client.query<{ id: string }>(
      `insert into events (event_type, title, description, affected_company_ids, price_impact_pct, cash_impact, triggered_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [template.event_type, title, description, affected, impactPct, cashAmount, triggeredBy]
    );

    return eventRes.rows[0]!.id;
  });
}
