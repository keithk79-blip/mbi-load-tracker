import { describe, expect, it } from "vitest";
import {
  collectDeviceLoads,
  deviceLoadsForPush,
  mergeCloudLoads,
  reconcilePersistedSnapshot,
  shouldApplyRealtimeDelete,
  shouldApplyRealtimeUpsert,
  snapshotDropsDeviceLoads,
  snapshotForDeviceBackup,
  snapshotLosesDeviceDates,
  snapshotLosesDeviceLoads,
} from "./cloudMerge";
import type { QueueOp } from "./queue";
import { allLoads, type Persisted } from "./storage";
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

  it("does not flag a busy day that only lost some rows (324 → 306)", () => {
    const today = busyToday(324);
    const remote = today.slice(0, 306);
    expect(snapshotLosesDeviceDates(remote, store(today), store(today), [])).toBe(
      false,
    );
    expect(snapshotLosesDeviceLoads(remote, store(today), store(today), [])).toBe(
      true,
    );
    expect(snapshotDropsDeviceLoads(remote, store(today), store(today), [])).toHaveLength(
      18,
    );
  });
});

const TODAY = "2026-09-09";

function busyToday(n: number, date = TODAY): Load[] {
  return Array.from({ length: n }, (_, i) =>
    load(`sep9-${String(i).padStart(3, "0")}`, date, {
      truck: String(100 + (i % 80)),
      updatedAt: `${date}T12:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
    }),
  );
}

function upsertOp(row: Load): QueueOp {
  return {
    opId: `up-${row.id}`,
    kind: "upsert",
    load: row,
    queuedAt: row.updatedAt,
  };
}

describe("2026-09-09 count oscillation (324 → 306 class)", () => {
  const today = busyToday(324);
  const remote306 = today.slice(0, 306);
  const localOnly18 = today.slice(306);

  it("local add then stale remote refresh keeps all 324 and upserts the 18", () => {
    const { merged, toUpsert } = mergeCloudLoads({
      remote: remote306,
      cache: store(today),
      local: store(today),
      pending: [],
    });

    const onToday = merged.filter((row) => row.date === TODAY);
    expect(onToday).toHaveLength(324);
    expect(toUpsert.map((row) => row.id).sort()).toEqual(
      localOnly18.map((row) => row.id).sort(),
    );
    expect(toUpsert).toHaveLength(18);
  });

  it("stale persist of 306 with live/local 324 does not shrink the day", () => {
    const live = store(today);
    const incoming = store(remote306);
    const next = reconcilePersistedSnapshot({
      incoming,
      live,
      cache: incoming,
      local: live,
      lastGood: live,
      pending: [],
    });

    expect(next).not.toBeNull();
    expect(allIds(next!).filter((id) => id.startsWith("sep9-"))).toHaveLength(324);
    expect((next!.loadsByDate[TODAY] ?? []).length).toBe(324);
  });

  it("after persist, cache still has 324 (remote subset is not written through)", () => {
    const live = store(today);
    const cache = reconcilePersistedSnapshot({
      incoming: store(remote306),
      live,
      cache: store(remote306),
      local: live,
      lastGood: live,
      pending: [],
    });
    expect(cache).not.toBeNull();
    expect((cache!.loadsByDate[TODAY] ?? []).length).toBe(324);
    expect(snapshotLosesDeviceLoads(allLoads(cache!), live, live, [])).toBe(false);
    expect(
      snapshotLosesDeviceLoads(allLoads(store(remote306)), live, live, []),
    ).toBe(true);
  });

  it("restore-from-local-backup when remote and cache are missing the 18", () => {
    const local = store(today);
    const cache = store(remote306);
    const { merged, toUpsert } = mergeCloudLoads({
      remote: remote306,
      cache,
      local,
      pending: [],
    });

    expect(merged.filter((row) => row.date === TODAY)).toHaveLength(324);
    expect(toUpsert).toHaveLength(18);

    const next = reconcilePersistedSnapshot({
      incoming: store(merged),
      live: cache,
      cache,
      local,
      lastGood: cache,
      pending: [],
    });
    expect((next!.loadsByDate[TODAY] ?? []).length).toBe(324);
  });

  it("in-flight refresh extra (storeRef) restores loads cache/local already lost", () => {
    const live = store(today);
    const poisoned = store(remote306);
    const { merged } = mergeCloudLoads({
      remote: remote306,
      cache: poisoned,
      local: poisoned,
      pending: [],
      extra: [live],
    });
    expect(merged.filter((row) => row.date === TODAY)).toHaveLength(324);
  });

  it("count stays 324 across merge then stale persist", () => {
    const counts: number[] = [];
    const { merged } = mergeCloudLoads({
      remote: remote306,
      cache: store(today),
      local: store(today),
      pending: [],
    });
    counts.push(merged.filter((row) => row.date === TODAY).length);

    const afterPersist = reconcilePersistedSnapshot({
      incoming: store(remote306),
      live: store(merged),
      cache: store(merged),
      local: store(today),
      lastGood: store(today),
      pending: [],
    });
    counts.push((afterPersist!.loadsByDate[TODAY] ?? []).length);

    expect(counts).toEqual([324, 324]);
  });

  it("local delete then remote still has the row stays deleted and is not upserted", () => {
    const gone = today[0];
    const kept = today.slice(1);
    const { merged, toUpsert } = mergeCloudLoads({
      remote: today,
      cache: store(kept, [gone.id]),
      local: store(today, [gone.id]),
      pending: [],
    });

    expect(merged.map((row) => row.id)).not.toContain(gone.id);
    expect(merged.filter((row) => row.date === TODAY)).toHaveLength(323);
    expect(toUpsert.map((row) => row.id)).not.toContain(gone.id);
  });

  it("concurrent upsert echo with older or equal updatedAt is ignored", () => {
    const row = today[0];
    const echoOlder = load(row.id, TODAY, {
      ...row,
      truck: "ECHO",
      updatedAt: "2026-09-09T01:00:00.000Z",
    });
    const echoEqual = load(row.id, TODAY, { ...row, truck: "ECHO" });
    const pending = new Set<string>();

    expect(shouldApplyRealtimeUpsert(echoOlder, store(today), pending)).toBe(false);
    expect(shouldApplyRealtimeUpsert(echoEqual, store(today), pending)).toBe(false);
    expect(
      shouldApplyRealtimeUpsert(
        load(row.id, TODAY, {
          ...row,
          truck: "418",
          updatedAt: "2026-09-09T23:59:59.000Z",
        }),
        store(today),
        pending,
      ),
    ).toBe(true);
  });

  it("realtime echo of an in-flight upsert is ignored so the day does not rewrite", () => {
    const row = localOnly18[0];
    expect(
      shouldApplyRealtimeUpsert(row, store(today), new Set([row.id])),
    ).toBe(false);
  });

  it("Push all does not resurrect tombstones even after GC-style remote absence", () => {
    const gone = today[0];
    const kept = today.slice(1);
    const cacheAfterDelete = store(kept, [gone.id]);
    const staleLocal = store(today);

    const toPush = deviceLoadsForPush(cacheAfterDelete, staleLocal, []);
    expect(toPush.map((row) => row.id)).not.toContain(gone.id);
    expect(toPush).toHaveLength(323);

    const afterRemoteCaughtUp = reconcilePersistedSnapshot({
      incoming: store(kept, [gone.id]),
      live: cacheAfterDelete,
      cache: cacheAfterDelete,
      local: store(kept, [gone.id]),
      lastGood: cacheAfterDelete,
      pending: [],
    });
    expect(afterRemoteCaughtUp!.deletedIds).toContain(gone.id);
    expect(allIds(afterRemoteCaughtUp!)).not.toContain(gone.id);
  });

  it("tombstone beats a remote upsert of the same id on persist", () => {
    const gone = today[0];
    const kept = today.slice(1);
    const next = reconcilePersistedSnapshot({
      incoming: store(today),
      live: store(kept, [gone.id]),
      cache: store(kept, [gone.id]),
      local: store(kept, [gone.id]),
      lastGood: store(kept, [gone.id]),
      pending: [],
    });
    expect(next!.deletedIds).toContain(gone.id);
    expect(allIds(next!)).not.toContain(gone.id);
    expect((next!.loadsByDate[TODAY] ?? []).length).toBe(323);
  });

  it("pending upsert wins over a stale remote copy of the same id", () => {
    const newer = load("sep9-000", TODAY, {
      truck: "999",
      updatedAt: "2026-09-09T18:00:00.000Z",
    });
    const { merged } = mergeCloudLoads({
      remote: remote306,
      cache: store(today),
      local: store(today),
      pending: [upsertOp(newer)],
    });
    expect(merged.find((row) => row.id === "sep9-000")?.truck).toBe("999");
    expect(merged.filter((row) => row.date === TODAY)).toHaveLength(324);
  });

  it("does not apply a remote delete while a pending upsert for that id exists", () => {
    const inflight = localOnly18[0];
    expect(shouldApplyRealtimeDelete(inflight.id, [upsertOp(inflight)])).toBe(false);
    expect(shouldApplyRealtimeDelete(inflight.id, [])).toBe(true);
    expect(shouldApplyRealtimeDelete(undefined, [])).toBe(false);
  });

  it("empty remote still restores the local 2026-09-09 backup", () => {
    const { merged, toUpsert } = mergeCloudLoads({
      remote: [],
      cache: store([]),
      local: store(today),
      pending: [],
    });
    expect(merged.filter((row) => row.date === TODAY)).toHaveLength(324);
    expect(toUpsert).toHaveLength(324);
    expect(
      snapshotLosesDeviceDates(merged, store([]), store(today), []),
    ).toBe(false);
  });
});
