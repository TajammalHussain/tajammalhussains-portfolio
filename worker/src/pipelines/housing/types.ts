// HM Land Registry's UK House Price Index Linked Data API. No API key, real
// government open data, published monthly with roughly a 2-month lag (e.g.
// the June figures land in late August) — see README for the source URL
// pattern. A "missing" month is a valid 200 response whose primaryTopic is
// the literal string "elda:missingEndpoint" rather than an observation
// object; that's how the pipeline finds the latest published month.
export interface UkHpiApiResponse {
  result: {
    primaryTopic:
      | "elda:missingEndpoint"
      | {
          averagePrice?: number;
          averagePriceDetached?: number;
          averagePriceSemiDetached?: number;
          averagePriceTerraced?: number;
          averagePriceFlatMaisonette?: number;
          averagePriceNewBuild?: number;
          averagePriceExistingProperty?: number;
          salesVolume?: number;
          salesVolumeNewBuild?: number;
          salesVolumeExistingProperty?: number;
          refMonth?: string;
        };
  };
}

export function isMissingMonth(payload: UkHpiApiResponse): boolean {
  return payload.result.primaryTopic === "elda:missingEndpoint";
}

// A curated set of real Land Registry region slugs: the four UK nations plus
// the nine official English regions. Confirmed against the live API before
// picking this list — see task notes; every slug here returns real data.
export const HOUSING_REGIONS: readonly { slug: string; name: string }[] = [
  { slug: "united-kingdom", name: "United Kingdom" },
  { slug: "england", name: "England" },
  { slug: "wales", name: "Wales" },
  { slug: "scotland", name: "Scotland" },
  { slug: "northern-ireland", name: "Northern Ireland" },
  { slug: "london", name: "London" },
  { slug: "south-east", name: "South East" },
  { slug: "south-west", name: "South West" },
  { slug: "east-of-england", name: "East of England" },
  { slug: "east-midlands", name: "East Midlands" },
  { slug: "west-midlands", name: "West Midlands" },
  { slug: "north-west", name: "North West" },
  { slug: "north-east", name: "North East" },
  { slug: "yorkshire-and-the-humber", name: "Yorkshire and the Humber" },
] as const;

export const HOUSING_PROPERTY_TYPES = [
  "all",
  "detached",
  "semi-detached",
  "terraced",
  "flat-maisonette",
  "new-build",
  "existing-property",
] as const;
export type HousingPropertyType = (typeof HOUSING_PROPERTY_TYPES)[number];

export interface HousingSilverRow {
  period: string; // YYYY-MM
  region: string; // slug
  propertyType: HousingPropertyType;
  averagePrice: number;
  salesVolume: number | null;
}

export interface HousingGoldRow {
  period: string;
  region: string;
  averagePrice: number;
  momChangePct: number | null;
  yoyChangePct: number | null;
}
