import type {
  UkHpiApiResponse,
  HousingSilverRow,
  HousingPropertyType,
} from "./types";
import { isMissingMonth } from "./types";

// Each property type's average-price field, and its sales-volume field where
// the source publishes one (only "all", "new-build", and "existing-property"
// get a sales volume in this API — the others are null, not fabricated).
const PROPERTY_TYPE_FIELDS: Record<
  HousingPropertyType,
  { price: string; salesVolume: string | null }
> = {
  all: { price: "averagePrice", salesVolume: "salesVolume" },
  detached: { price: "averagePriceDetached", salesVolume: null },
  "semi-detached": { price: "averagePriceSemiDetached", salesVolume: null },
  terraced: { price: "averagePriceTerraced", salesVolume: null },
  "flat-maisonette": { price: "averagePriceFlatMaisonette", salesVolume: null },
  "new-build": {
    price: "averagePriceNewBuild",
    salesVolume: "salesVolumeNewBuild",
  },
  "existing-property": {
    price: "averagePriceExistingProperty",
    salesVolume: "salesVolumeExistingProperty",
  },
};

/**
 * Transforms one region+month's raw UK HPI response into one silver row per
 * property type that actually has a published average price. A region with
 * only partial data (e.g. no new-build figure that month) yields fewer rows
 * rather than fabricated zeros — matches Pipeline 1's "no data means no row"
 * convention.
 */
export function transformRegionToSilverRows(
  regionSlug: string,
  payload: UkHpiApiResponse,
): HousingSilverRow[] {
  if (isMissingMonth(payload)) return [];
  const topic = payload.result.primaryTopic as Record<
    string,
    number | string | undefined
  >;
  const period = topic.refMonth as string | undefined;
  if (!period) return [];

  const rows: HousingSilverRow[] = [];
  for (const [propertyType, fields] of Object.entries(PROPERTY_TYPE_FIELDS) as [
    HousingPropertyType,
    (typeof PROPERTY_TYPE_FIELDS)[HousingPropertyType],
  ][]) {
    const price = topic[fields.price];
    if (typeof price !== "number") continue;
    const salesVolume = fields.salesVolume
      ? topic[fields.salesVolume]
      : undefined;
    rows.push({
      period,
      region: regionSlug,
      propertyType,
      averagePrice: price,
      salesVolume: typeof salesVolume === "number" ? salesVolume : null,
    });
  }
  return rows;
}
