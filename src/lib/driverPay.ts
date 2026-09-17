import { yearsOfService } from "./rosterHireDate";

export const PAY_TIERS = [1, 2, 3, 4, 5] as const;
export type PayTier = (typeof PAY_TIERS)[number];

/**
 * First year (before 1st anniversary) = Tier 1.
 * Each anniversary moves up one tier. 4th anniversary (start of year 5) = Tier 5 max.
 */
export function payTierFromHireDate(
  hireDate: string | null | undefined,
  asOf: string,
): PayTier | null {
  const years = yearsOfService(hireDate ?? null, asOf);
  if (years === null) return null;
  if (years < 1) return 1;
  if (years < 2) return 2;
  if (years < 3) return 3;
  if (years < 4) return 4;
  return 5;
}

export function payTierLabel(tier: PayTier | null): string {
  return tier ? `Tier ${tier}` : "No tier";
}
