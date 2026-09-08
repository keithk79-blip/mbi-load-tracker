import { describe, expect, it } from "vitest";
import {
  collectDeviceLoads,
  deviceLoadsForPush,
  mergeCloudLoads,
  snapshotForDeviceBackup,
  snapshotLosesDeviceDates,
} from "./cloudMerge";
import type { QueueOp } from "./queue";
import type { Persisted } from "./storage";
import type { Load } from "../types";

function load(
  id: string,
  date: string,
  extra: Partial<Load> = {},
): Load {
  return {
    id,
    truck: extra.truck ?? "2970",
    pickup: extra.pickup ?? "Hooker Street",
    commodity: extra.commodity ?? "Trash (MSW)",
    destination: extra.destination ?? "Landfill",
    stationId: extra.stationId ?? "hooker",
    date,
    createdAt: extra.createdAt ?? `${date}T12:00:00.000Z`,
    updatedAt: extra.updatedAt ?? `${date}T12:00:00.000Z`,
    seeded: extra.seeded,
    createdBy: extra.createdBy,
    displayName: extra.displayName,
  };
}

function store(loads: Load[], deletedIds?: string[]): Persisted {
  const loadsByDate: Record<string, Load[]> = {};
  for (const row of loads) {
    const bucket = loadsByDate[row.date] ?? [];
    bucket.push(row);
    loadsByDate[row.date] = bucket;
  }
  return deletedIds?.length
    ? { version: 1, loadsByDate, deletedIds }
    : { version: 1, loadsByDate };
}

function deleteOp(id: string): QueueOp {
  return { opId: `del-${id}`, kind: "delete", loadId: id, queuedAt: "2026-09-08T12:00:00.000Z" };
}

describe("mergeCloudLoads", () => {
  it("keeps cache-only Sep 8 loads when remote is empty and queue is empty", () => {
    const sep8 = [
      load("hooker-msw", "2026-09-08", { truck: "2970", pickup: "Hooker Street" }),
      load("other-msw", "2026-09-08", { truck: "418", pickup: "Melrose" }),
    ];

    const { merged, toUpsert } = mergeCloudLoads({
      remote: [],
      cache: store(sep8),
      local: store([]),
      pending: [],
    });

    expect(merged.map((row) => row.id).sort()).toEqual(["hooker-msw", "other-msw"]);
    expect(toUpsert.map((row) => row.id).sort()).toEqual(["hooker-msw", "other-msw"]);
  });

  it("remote empty, local has Sep 8 loads → Sep 8 survives", () => {
    const sep8 = Array.from({ length: 82 }, (_, i) =>
      load(`sep8-${i}`, "2026-09-08", {
        truck: String(100 + (i % 50)),
        commodity: i % 3 === 0 ? "Leachate (tanker)" : "Trash (MSW)",
      }),
    );

    const { merged, toUpsert } = mergeCloudLoads({
      remote: [],
      cache: store([]),
      local: store(sep8),
      pending: [],
    });

    const kept = merged.filter((row) => row.date === "2026-09-08");
    expect(kept).toHaveLength(82);
    expect(toUpsert).toHaveLength(82);
    expect(snapshotLosesDeviceDates(merged, store([]), store(sep8), [])).toBe(
      false,
    );
    expect(snapshotLosesDeviceDates([], store([]), store(sep8), [])).toBe(true);
  });

  it("does not drop cache-only rows that are not in the pending queue", () => {
    const remote = [load("already-cloud", "2026-09-07")];
    const cache = store([
      load("already-cloud", "2026-09-07"),
      load("desktop-only", "2026-09-08"),
    ]);

    const { merged, toUpsert } = mergeCloudLoads({
      remote,
      cache,
      local: store([]),
      pending: [],
    });

    expect(merged.map((row) => row.id).sort()).toEqual([
      "already-cloud",
      "desktop-only",
    ]);
    expect(toUpsert.map((row) => row.id)).toEqual(["desktop-only"]);
  });

  it("unions STORAGE_KEY local loads that never made it into cloud-cache", () => {
    const localOnly = load("legacy-local", "2026-09-06", { truck: "55" });
    const { merged, toUpsert } = mergeCloudLoads({
      remote: [],
      cache: store([]),
      local: store([localOnly]),
      pending: [],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("legacy-local");
    expect(toUpsert).toHaveLength(1);
  });

  it("skips seeded sample loads", () => {
    const seeded = load("seed-1", "2026-09-08", { seeded: true });
    const real = load("real-1", "2026-09-08");
    const { merged, toUpsert } = mergeCloudLoads({
      remote: [],
      cache: store([real]),
      local: store([seeded]),
      pending: [],
    });

    expect(merged.map((row) => row.id)).toEqual(["real-1"]);
    expect(toUpsert.map((row) => row.id)).toEqual(["real-1"]);
  });

  it("lets a pending upsert win over a stale remote row", () => {
    const remote = [load("same", "2026-09-08", { updatedAt: "2026-09-08T10:00:00.000Z" })];
    const pending: QueueOp[] = [
      {
        opId: "op-1",
        kind: "upsert",
        queuedAt: "2026-09-08T11:00:00.000Z",
        load: load("same", "2026-09-08", {
          truck: "999",
          updatedAt: "2026-09-08T11:00:00.000Z",
        }),
      },
    ];

    const { merged, toUpsert } = mergeCloudLoads({
      remote,
      cache: store([]),
      local: store([]),
      pending,
    });

    expect(merged[0].truck).toBe("999");
    expect(toUpsert).toHaveLength(1);
    expect(toUpsert[0].truck).toBe("999");
  });

  it("honors a pending delete and does not re-upsert that id", () => {
    const cached = load("gone", "2026-09-08");
    const pending: QueueOp[] = [deleteOp("gone")];

    const { merged, toUpsert } = mergeCloudLoads({
      remote: [cached],
      cache: store([cached]),
      local: store([]),
      pending,
    });

    expect(merged).toEqual([]);
    expect(toUpsert).toEqual([]);
  });

  it("drops a tombstoned id when remote still has it and the queue is empty", () => {
    const gone = load("A", "2026-09-08");
    const kept = load("B", "2026-09-08", { truck: "418" });

    const { merged, toUpsert } = mergeCloudLoads({
      remote: [gone, kept],
      cache: store([kept], ["A"]),
      local: store([gone, kept]),
      pending: [],
    });

    expect(merged.map((row) => row.id)).toEqual(["B"]);
    expect(toUpsert.map((row) => row.id)).toEqual([]);
  });

  it("does not restore tombstoned loads when remote is empty after a full-day delete", () => {
    const a = load("A", "2026-09-08");
    const b = load("B", "2026-09-08");

    const { merged, toUpsert } = mergeCloudLoads({
      remote: [],
      cache: store([], ["A", "B"]),
      local: store([a, b], ["A", "B"]),
      pending: [],
    });

    expect(merged).toEqual([]);
    expect(toUpsert).toEqual([]);
  });

  it("keeps the newer updatedAt when cache and remote disagree", () => {
    const older = load("row", "2026-09-08", { updatedAt: "2026-09-08T08:00:00.000Z" });
    const newer = load("row", "2026-09-08", {
      truck: "418",
      updatedAt: "2026-09-08T09:00:00.000Z",
    });

    const { merged, toUpsert } = mergeCloudLoads({
      remote: [older],
      cache: store([newer]),
      local: store([]),
      pending: [],
    });

    expect(merged[0].truck).toBe("418");
    expect(toUpsert).toHaveLength(1);
  });
});

describe("collectDeviceLoads", () => {
  it("unions cloud-cache and STORAGE_KEY and skips seeds", () => {
    const cacheLoad = load("cache-1", "2026-09-08");
    const localLoad = load("local-1", "2026-09-07");
    const seed = load("seed-1", "2026-09-07", { seeded: true });

    const collected = collectDeviceLoads(store([cacheLoad]), store([localLoad, seed]));
    expect(collected.map((row) => row.id).sort()).toEqual(["cache-1", "local-1"]);
  });

  it("prefers the newer copy when the same id is in both stores", () => {
    const older = load("dup", "2026-09-08", { updatedAt: "2026-09-08T08:00:00.000Z" });
    const newer = load("dup", "2026-09-08", {
      truck: "55",
      updatedAt: "2026-09-08T10:00:00.000Z",
    });

    const collected = collectDeviceLoads(store([older]), store([newer]));
    expect(collected).toHaveLength(1);
    expect(collected[0].truck).toBe("55");
  });

  it("omits a load that is still in STORAGE_KEY but tombstoned on cache", () => {
    const a = load("A", "2026-09-08");
    const b = load("B", "2026-09-08");
    const collected = collectDeviceLoads(store([b], ["A"]), store([a, b]));
    expect(collected.map((row) => row.id)).toEqual(["B"]);
  });
});

describe("delete then backup / Push all (resurrection bug)", () => {
  const a = load("A", "2026-09-08");
  const b = load("B", "2026-09-08", { truck: "418" });

  it("backup must not re-union a deleted load still sitting in STORAGE_KEY", () => {
    const cacheAfterDelete = store([b], ["A"]);
    const staleLocal = store([a, b]);

    const backup = snapshotForDeviceBackup(cacheAfterDelete, staleLocal, []);
    expect(backup).not.toBeNull();
    expect(allIds(backup!)).toEqual(["B"]);
    expect(backup!.deletedIds).toEqual(["A"]);
  });

  it("Push all must not enqueue a leftover local copy after flush", () => {
    const cacheAfterDelete = store([b], ["A"]);
    const staleLocal = store([a, b]);

    const toPush = deviceLoadsForPush(cacheAfterDelete, staleLocal, []);
    expect(toPush.map((row) => row.id)).toEqual(["B"]);
  });

  it("pending delete wins over leftover local when Push all runs before flush", () => {
    const cacheAfterDelete = store([b], ["A"]);
    const staleLocal = store([a, b]);

    const toPush = deviceLoadsForPush(cacheAfterDelete, staleLocal, [deleteOp("A")]);
    expect(toPush.map((row) => row.id)).toEqual(["B"]);
  });

  it("empty-remote day protection still holds when nothing was deleted", () => {
    const { merged, toUpsert } = mergeCloudLoads({
      remote: [],
      cache: store([a, b]),
      local: store([a, b]),
      pending: [],
    });

    expect(merged.map((row) => row.id).sort()).toEqual(["A", "B"]);
    expect(toUpsert.map((row) => row.id).sort()).toEqual(["A", "B"]);
    expect(snapshotLosesDeviceDates(merged, store([a, b]), store([a, b]), [])).toBe(
      false,
    );
    expect(snapshotLosesDeviceDates([], store([a, b]), store([a, b]), [])).toBe(true);
  });
});

function allIds(store: Persisted): string[] {
  return Object.values(store.loadsByDate)
    .flat()
    .map((row) => row.id)
    .sort();
}

describe("snapshotLosesDeviceDates", () => {
  it("flags an empty snapshot when STORAGE_KEY still has Sep 8 loads", () => {
    const sep8 = [load("keep-me", "2026-09-08")];
    expect(
      snapshotLosesDeviceDates([], store([]), store(sep8), []),
    ).toBe(true);
  });

  it("does not flag a union snapshot that still has that date", () => {
    const sep8 = [load("keep-me", "2026-09-08")];
    expect(
      snapshotLosesDeviceDates(sep8, store([]), store(sep8), []),
    ).toBe(false);
  });

  it("does not flag an empty snapshot when the only device rows are tombstoned", () => {
    const gone = [load("A", "2026-09-08")];
    expect(
      snapshotLosesDeviceDates([], store([], ["A"]), store(gone, ["A"]), []),
    ).toBe(false);
  });
});
