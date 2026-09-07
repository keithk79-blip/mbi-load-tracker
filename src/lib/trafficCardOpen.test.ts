import { describe, expect, it } from "vitest";
import {
  CHICAGO_TRAFFIC_OPEN_KEYS,
  initialChicagoTrafficOpen,
} from "./trafficCardOpen";

function memoryStore(initial?: Record<string, string>) {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    removeItem(key: string) {
      map.delete(key);
    },
    getItem(key: string) {
      return map.get(key);
    },
  };
}

describe("Chicago traffic card open state", () => {
  it("defaults collapsed and does not honor stored true", () => {
    const local = memoryStore({
      "chitrader.load-tracker.chicago-traffic-open": "true",
      "chitrader.load-tracker.traffic-open": "1",
    });
    const session = memoryStore({
      "chitrader.load-tracker.chicago-traffic-open": "true",
    });

    expect(initialChicagoTrafficOpen([local, session])).toBe(false);

    for (const key of CHICAGO_TRAFFIC_OPEN_KEYS) {
      expect(local.getItem(key)).toBeUndefined();
      expect(session.getItem(key)).toBeUndefined();
    }
  });
});
