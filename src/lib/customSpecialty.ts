/** Four dispatcher-named specialty cards for odd-ball requested loads. */

export const CUSTOM_SPECIALTY_IDS = [
  "custom-1",
  "custom-2",
  "custom-3",
  "custom-4",
] as const;

export type CustomSpecialtyId = (typeof CUSTOM_SPECIALTY_IDS)[number];

export const CUSTOM_SPECIALTY_DEFAULT_NAMES: Record<CustomSpecialtyId, string> = {
  "custom-1": "Odd-ball 1",
  "custom-2": "Odd-ball 2",
  "custom-3": "Odd-ball 3",
  "custom-4": "Odd-ball 4",
};

export const CUSTOM_SPECIALTY_LOAD_TYPES = [
  "Leachate",
  "Walking-floor",
  "Trash",
] as const;

export type CustomSpecialtyLoadType = (typeof CUSTOM_SPECIALTY_LOAD_TYPES)[number];

const NAMES_KEY = "chitrader.load-tracker.specialty-custom-names.v1";

export function isCustomSpecialtyId(id: string): id is CustomSpecialtyId {
  return (CUSTOM_SPECIALTY_IDS as readonly string[]).includes(id);
}

function cleanLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function readCustomSpecialtyNames(): Record<CustomSpecialtyId, string> {
  const next = { ...CUSTOM_SPECIALTY_DEFAULT_NAMES };
  try {
    const raw = localStorage.getItem(NAMES_KEY);
    if (!raw) return next;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const id of CUSTOM_SPECIALTY_IDS) {
      const value = parsed[id];
      if (typeof value === "string" && cleanLabel(value)) {
        next[id] = cleanLabel(value);
      }
    }
  } catch {
    /* keep defaults */
  }
  return next;
}

export function writeCustomSpecialtyName(id: CustomSpecialtyId, name: string): void {
  const names = readCustomSpecialtyNames();
  names[id] = cleanLabel(name) || CUSTOM_SPECIALTY_DEFAULT_NAMES[id];
  localStorage.setItem(NAMES_KEY, JSON.stringify(names));
}

export function customSpecialtyDisplayName(id: string): string {
  if (!isCustomSpecialtyId(id)) return id;
  return readCustomSpecialtyNames()[id];
}

export function lookupCustomSpecialtyIdByName(raw: string): CustomSpecialtyId | null {
  const name = cleanLabel(raw).toLowerCase();
  if (!name) return null;
  if (isCustomSpecialtyId(name)) return name;
  const names = readCustomSpecialtyNames();
  for (const id of CUSTOM_SPECIALTY_IDS) {
    if (names[id].toLowerCase() === name) return id;
    if (CUSTOM_SPECIALTY_DEFAULT_NAMES[id].toLowerCase() === name) return id;
  }
  return null;
}

export function isCustomSpecialtyLoadType(raw: string): raw is CustomSpecialtyLoadType {
  return (CUSTOM_SPECIALTY_LOAD_TYPES as readonly string[]).includes(raw);
}

export function formatCustomSpecialtyChip(
  loadType: CustomSpecialtyLoadType,
  destination: string,
): string {
  const dest = cleanLabel(destination);
  return dest ? `${loadType} · ${dest}` : loadType;
}

export function parseCustomSpecialtyChip(raw: string): {
  loadType: CustomSpecialtyLoadType | null;
  destination: string;
} {
  const text = cleanLabel(raw);
  const sep = text.indexOf(" · ");
  if (sep > 0) {
    const left = text.slice(0, sep);
    const right = text.slice(sep + 3);
    if (isCustomSpecialtyLoadType(left)) {
      return { loadType: left, destination: right };
    }
  }
  if (isCustomSpecialtyLoadType(text)) {
    return { loadType: text, destination: "" };
  }
  return { loadType: null, destination: text };
}

export function customSpecialtyLaneChips(
  destination: string,
  commodity: string,
): string[] {
  const parsed = parseCustomSpecialtyChip(destination);
  const typeFromCommodity = commodityLoadType(commodity);
  const loadType = parsed.loadType ?? typeFromCommodity;
  const dest = parsed.destination || cleanLabel(destination);
  const chips: string[] = [];
  if (loadType && dest) chips.push(formatCustomSpecialtyChip(loadType, dest));
  if (dest) chips.push(dest);
  if (loadType) chips.push(loadType);
  return chips;
}

export function commodityLoadType(commodity: string): CustomSpecialtyLoadType | null {
  const key = commodity.replace(/\s+/g, " ").trim().toLowerCase();
  if (!key) return null;
  if (key.includes("leach")) return "Leachate";
  if (key.includes("trash") || key.includes("msw")) return "Trash";
  if (
    key.includes("walk") ||
    key.includes("recycle") ||
    key.includes("yard") ||
    key.includes("cardboard") ||
    key.includes("wood") ||
    key.includes("c&d") ||
    key.includes("c and d")
  ) {
    return "Walking-floor";
  }
  return null;
}

export function isCustomSpecialtyCommodity(commodity: string, destination: string): boolean {
  if (parseCustomSpecialtyChip(destination).loadType) return true;
  return commodityLoadType(commodity) !== null;
}
