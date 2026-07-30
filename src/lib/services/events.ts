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
 * Shifts a company's spot price by `impactPct` while keeping the AMM
 * invariant pool_cash * pool_shares constant. Shared by admin/random market
 * events and by the ambient background drift in src/lib/services/drift.ts.
 */
export async function applyPriceShock(
  client: PoolClient,
  companyId: string,
  impactPct: number
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
  const sqrtFactor = Math.sqrt(factor);
  const newPoolCash = poolCash * sqrtFactor;
  const newPoolShares = poolShares / sqrtFactor;

  await client.query(
    `update companies set pool_cash = $1, pool_shares = $2, updated_at = now() where id = $3`,
    [newPoolCash, newPoolShares, companyId]
  );

  const newPrice = round(newPoolCash / newPoolShares, 6);
  await client.query(`insert into price_history (company_id, price) values ($1, $2)`, [
    companyId,
    newPrice,
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
          parseFloat(template.min_impact_pct!),
          parseFloat(template.max_impact_pct!)
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
        parseFloat(template.min_impact_pct!),
        parseFloat(template.max_impact_pct!)
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
      cashAmount = round(randomInRange(parseFloat(template.min_cash!), parseFloat(template.max_cash!)), 2);
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
