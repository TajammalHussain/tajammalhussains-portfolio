import type { Env } from "../../lib/env";
import type { HousingSilverRow, HousingGoldRow } from "./types";

/** `ON CONFLICT(period, region, property_type) DO UPDATE` — idempotent re-runs. */
export async function upsertHousingSilver(
  env: Env,
  rows: HousingSilverRow[],
  bronzeId: number,
): Promise<number> {
  if (rows.length === 0) return 0;
  const stmt = env.DB.prepare(`
    INSERT INTO housing_readings_silver (period, region, property_type, average_price, sales_volume, source_bronze_id)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(period, region, property_type) DO UPDATE SET
      average_price = excluded.average_price,
      sales_volume = excluded.sales_volume,
      source_bronze_id = excluded.source_bronze_id
  `);
  const batch = rows.map((r) =>
    stmt.bind(
      r.period,
      r.region,
      r.propertyType,
      r.averagePrice,
      r.salesVolume,
      bronzeId,
    ),
  );
  await env.DB.batch(batch);
  return rows.length;
}

export async function upsertHousingGold(
  env: Env,
  rows: HousingGoldRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const stmt = env.DB.prepare(`
    INSERT INTO housing_regional_gold (period, region, average_price, mom_change_pct, yoy_change_pct, computed_at)
    VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
    ON CONFLICT(period, region) DO UPDATE SET
      average_price = excluded.average_price,
      mom_change_pct = excluded.mom_change_pct,
      yoy_change_pct = excluded.yoy_change_pct,
      computed_at = datetime('now')
  `);
  const batch = rows.map((r) =>
    stmt.bind(
      r.period,
      r.region,
      r.averagePrice,
      r.momChangePct,
      r.yoyChangePct,
    ),
  );
  await env.DB.batch(batch);
  return rows.length;
}

/**
 * Reads back "all property types" silver history for one region, as a
 * period -> averagePrice map — everything gold's mom/yoy computation needs,
 * regardless of how far back a comparison period happens to be.
 */
export async function getAllPropertyTypeHistory(
  env: Env,
  region: string,
): Promise<Map<string, number>> {
  const result = await env.DB.prepare(
    `SELECT period, average_price FROM housing_readings_silver
     WHERE region = ?1 AND property_type = 'all'`,
  )
    .bind(region)
    .all<{ period: string; average_price: number }>();
  return new Map(result.results.map((r) => [r.period, r.average_price]));
}
