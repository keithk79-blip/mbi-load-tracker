import { afterEach, describe, expect, it } from "vitest";
import type { Load } from "../types";
import { enqueueUpsert, QUEUE_KEY, readQueue } from "./queue";
import { batchCreatedAt } from "./quantity";
import {
  allLoads,
  commitStoreRef,
  forgetDeletedId,
  gcLoadDeletedIds,
  LAST_CLOUD_SYNC_KEY,
  loadsForDate,
  readLastSuccessfulSyncAt,
  readStore,
  rememberDeletedIds,
  snapshotFromLoads,
  STORAGE_KEY,
  upsertLoad,
  upsertLoadIntoRef,
  writeLastSuccessfulSyncAt,
  writeStore,
  type Persisted,
} from "./storage";

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

function load(id: string, date: string): Load {
  return {
    id,
    truck: "418",
    pickup: "Melrose",
    commodity: "Trash (MSW)",
    destination: "Covanta",
    stationId: "melrose",
    date,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
  };
}

describe("loadsByDate isolation", () => {
  it("does not rewrite other dates when a load is saved on the selected day", () => {
    let store: Persisted = { version: 1, loadsByDate: {} };
    store = upsertLoad(store, load("fri", "2026-09-04"));
    store = upsertLoad(store, load("fri-2", "2026-09-04"));
    store = upsertLoad(store, load("sat", "2026-09-05"));

    expect(loadsForDate(store, "2026-09-04")).toHaveLength(2);
    expect(loadsForDate(store, "2026-09-05")).toHaveLength(1);

    store = upsertLoad(store, load("sat-2", "2026-09-05"));

    expect(loadsForDate(store, "2026-09-04").map((row) => row.id)).toEqual([
      "fri",
      "fri-2",
    ]);
    expect(loadsForDate(store, "2026-09-05")).toHaveLength(2);
    expect(loadsForDate(store, "2026-09-03")).toHaveLength(0);
  });
});

describe("snapshotFromLoads dispatch order", () => {
  it("stores each day in createdAt ascending even when updatedAt is newer", () => {
    const date = "2026-09-11";
    const later = {
      ...load("later", date),
      createdAt: `${date}T14:00:00.000Z`,
      updatedAt: `${date}T20:00:00.000Z`,
    };
    const earlier = {
      ...load("earlier", date),
      createdAt: `${date}T10:00:00.000Z`,
    };
    const snap = snapshotFromLoads([later, earlier]);
    expect(loadsForDate(snap, date).map((row) => row.id)).toEqual([
      "earlier",
      "later",
    ]);
  });
});

describe("qty batch upsert through store ref", () => {
  const date = "2026-09-08";
  const base = "2026-09-08T15:00:00.000Z";

  function qtyLoad(index: number): Load {
    const createdAt = batchCreatedAt(base, index);
    return {
      ...load(`qty-${index}`, date),
      createdAt,
      updatedAt: createdAt,
    };
  }

  it("stale storeRef overwrites earlier qty saves so only the last load remains", () => {
    const stale: Persisted = { version: 1, loadsByDate: {} };
    let last = stale;
    for (let i = 0; i < 3; i++) {
      last = upsertLoad(stale, qtyLoad(i));
    }
    expect(allLoads(last).map((row) => row.id)).toEqual(["qty-2"]);
  });

  it("qty=3 saveLoad-style upserts keep 3 loads in the store and enqueue 3 queue ops", () => {
    const storeRef = { current: { version: 1, loadsByDate: {} } as Persisted };

    for (let i = 0; i < 3; i++) {
      const row = qtyLoad(i);
      const next = upsertLoadIntoRef(storeRef, row);
      writeStore(commitStoreRef(storeRef, next));
      enqueueUpsert(row);
    }

    const persisted = readStore();
    expect(allLoads(storeRef.current)).toHaveLength(3);
    expect(allLoads(persisted).map((row) => row.id)).toEqual([
      "qty-0",
      "qty-1",
      "qty-2",
    ]);
    expect(allLoads(persisted).map((row) => row.createdAt)).toEqual([
      "2026-09-08T15:00:00.000Z",
      "2026-09-08T15:00:01.000Z",
      "2026-09-08T15:00:02.000Z",
    ]);
    expect(readQueue().map((op) => (op.kind === "upsert" ? op.load.id : ""))).toEqual([
      "qty-0",
      "qty-1",
      "qty-2",
    ]);
    expect(memory.has(STORAGE_KEY)).toBe(true);
    expect(memory.has(QUEUE_KEY)).toBe(true);
  });
});

describe("deletedIds tombstones", () => {
  it("round-trips deletedIds through STORAGE_KEY", () => {
    const next = rememberDeletedIds(
      { version: 1, loadsByDate: { "2026-09-08": [load("A", "2026-09-08"), load("B", "2026-09-08")] } },
      ["A"],
    );
    writeStore(next);
    const read = readStore();
    expect(allLoads(read).map((row) => row.id)).toEqual(["B"]);
    expect(read.deletedIds).toEqual(["A"]);
  });

  it("upserting a tombstoned id forgets the tombstone", () => {
    const afterDelete = rememberDeletedIds(
      { version: 1, loadsByDate: { "2026-09-08": [load("A", "2026-09-08")] } },
      ["A"],
    );
    expect(afterDelete.deletedIds).toEqual(["A"]);
    const saved = upsertLoad(afterDelete, load("A", "2026-09-08"));
    expect(saved.deletedIds).toBeUndefined();
    expect(allLoads(saved).map((row) => row.id)).toEqual(["A"]);
    expect(forgetDeletedId(afterDelete, "A").deletedIds).toBeUndefined();
  });

  it("gc never drops a load tombstone after remote and local copies are gone", () => {
    const a = load("A", "2026-09-08");
    const empty: Persisted = { version: 1, loadsByDate: {} };
    const localWithA: Persisted = { version: 1, loadsByDate: { "2026-09-08": [a] } };
    expect(gcLoadDeletedIds(["A"], [], empty, localWithA)).toEqual(["A"]);
    expect(gcLoadDeletedIds(["A"], [a], empty, empty)).toEqual(["A"]);
    expect(gcLoadDeletedIds(["A"], [], empty, empty)).toEqual(["A"]);
  });
});

describe("lastSuccessfulSyncAt", () => {
  it("round-trips an ISO timestamp", () => {
    expect(readLastSuccessfulSyncAt()).toBeNull();
    writeLastSuccessfulSyncAt("2026-09-10T22:00:00.000Z");
    expect(readLastSuccessfulSyncAt()).toBe("2026-09-10T22:00:00.000Z");
  });

  it("ignores invalid values", () => {
    memory.set(LAST_CLOUD_SYNC_KEY, "not-a-date");
    expect(readLastSuccessfulSyncAt()).toBeNull();
  });
});
