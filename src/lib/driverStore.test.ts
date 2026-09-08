import { afterEach, describe, expect, it } from "vitest";
import { DAYS_KEY, persistDriverDays, readDriverDaysPayload, writeDayStore } from "./driverStore";

const memory = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

afterEach(() => {
  memory.clear();
});

describe("driver-days payload", () => {
  it("keeps manual offs when a day snapshot is rewritten", () => {
    persistDriverDays({
      days: {
        "2026-09-08": {
          date: "2026-09-08",
          base: 143,
          offs: 4,
          available: 139,
          locked: false,
          lockedAt: "t0",
        },
      },
      manualOffs: {
        "2026-09-08": [{ name: "Mike Davy", kind: "ncns" }],
      },
      manualOffsDeleted: [],
    });

    writeDayStore({
      "2026-09-08": {
        date: "2026-09-08",
        base: 143,
        offs: 5,
        available: 138,
        locked: false,
        lockedAt: "t1",
      },
    });

    const payload = readDriverDaysPayload();
    expect(payload.days["2026-09-08"]?.available).toBe(138);
    expect(payload.manualOffs["2026-09-08"]).toEqual([
      { name: "Mike Davy", kind: "ncns" },
    ]);
    expect(JSON.parse(memory.get(DAYS_KEY) ?? "{}").manualOffs["2026-09-08"][0].kind).toBe(
      "ncns",
    );
  });
});
