/** Keys that must never reopen the Chicago traffic card after a refresh. */
export const CHICAGO_TRAFFIC_OPEN_KEYS = [
  "chitrader.load-tracker.chicago-traffic-open",
  "chitrader.load-tracker.traffic-open",
] as const;

type StorageLike = Pick<Storage, "removeItem">;

function browserStores(): Array<StorageLike | undefined> {
  try {
    return [globalThis.localStorage, globalThis.sessionStorage];
  } catch {
    return [];
  }
}

/** Drop any leftover open-flag so a refresh cannot restore expanded. */
export function forgetChicagoTrafficOpen(
  stores: Array<StorageLike | undefined | null> = browserStores(),
): void {
  for (const store of stores) {
    if (!store) continue;
    for (const key of CHICAGO_TRAFFIC_OPEN_KEYS) {
      try {
        store.removeItem(key);
      } catch {
        // private mode / disabled storage
      }
    }
  }
}

/** Always collapsed. Ignores storage and native details restoration. */
export function initialChicagoTrafficOpen(
  stores?: Array<StorageLike | undefined | null>,
): boolean {
  forgetChicagoTrafficOpen(stores);
  return false;
}
