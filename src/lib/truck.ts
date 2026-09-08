/** Known broker / sub abbreviations used in the truck field. */
export const KNOWN_BROKER_CODES = [
  "VZ",
  "CGH",
  "CL",
  "G2",
  "GI",
  "TJ",
] as const;

export const TRUCK_MAX_LENGTH = 6;

const KNOWN_BROKER_SET = new Set<string>(KNOWN_BROKER_CODES);

/** Letters + digits, uppercase. Numeric trucks stay unchanged aside from length. */
export function sanitizeTruck(raw: string, maxLength = TRUCK_MAX_LENGTH): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, maxLength);
}

export function isNumericTruck(truck: string): boolean {
  return /^\d+$/.test(truck.trim());
}

/**
 * Broker / SUBS truck: a known abbreviation, or any letter-based code
 * (not a pure numeric unit). Matching is by pattern, not a closed list only.
 */
export function isBrokerTruck(truck: string): boolean {
  const code = sanitizeTruck(truck);
  if (!code || isNumericTruck(code)) return false;
  if (KNOWN_BROKER_SET.has(code)) return true;
  return /[A-Z]/.test(code);
}
