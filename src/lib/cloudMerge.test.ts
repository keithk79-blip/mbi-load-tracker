import { describe, expect, it } from "vitest";
import {
  collectDeviceLoads,
  deviceLoadsForPush,
  deviceWinsDateAgainstRemote,
  isProtectedDeviceLoad,
  mergeCloudLoads,
  reconcilePersistedSnapshot,
  shouldApplyRealtimeDelete,
  shouldApplyRealtimeUpsert,
  snapshotDropsDeviceLoads,
  snapshotDropsProtectedDeviceLoads,
  snapshotForDeviceBackup,
  snapshotLosesDeviceDates,
  snapshotLosesDeviceLoads,
  snapshotLosesProtectedDeviceLoads,
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

function upsertOp(row: Load): QueueOp {
  return {
    opId: `up-${row.id}`,
    kind: "upsert",
    load: row,
    queuedAt: row.updatedAt,
  };
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

  it("returns merged loads in createdAt dispatch order, not updatedAt", () => {
    const first = load("first", "2026-09-11", {
      createdAt: "2026-09-11T10:00:00.000Z",
      updatedAt: "2026-09-11T18:00:00.000Z",
    });
    const second = load("second", "2026-09-11", {
      createdAt: "2026-09-11T10:05:00.000Z",
      updatedAt: "2026-09-11T10:05:00.000Z",
    });
    const qty0 = load("qty-0", "2026-09-11", {
      createdAt: "2026-09-11T11:00:00.000Z",
      updatedAt: "2026-09-11T19:00:00.000Z",
    });
    const qty1 = load("qty-1", "2026-09-11", {
      createdAt: "2026-09-11T11:00:01.000Z",
      updatedAt: "2026-09-11T19:00:01.000Z",
    });

    const { merged } = mergeCloudLoads({
      remote: [first, qty1, second, qty0],
      cache: store([]),
      local: store([]),
      pending: [],
    });

    expect(merged.map((row) => row.id)).toEqual([
      "first",
      "second",
      "qty-0",
      "qty-1",
    ]);
  });

  it("drops stale cache-only rows that are not in the pending queue when remote is complete", () => {
    const remote = [load("already-cloud", "2026-09-07")];
    const cache = store([
      load("already-cloud", "2026-09-07"),
      load("desktop-only", "2026-09-08"),
    ]);

    const { merged, toUpsert, toTombstone } = mergeCloudLoads({
      remote,
      cache,
      local: store([]),
      pending: [],
    });

    expect(merged.map((row) => row.id)).toEqual(["already-cloud"]);
    expect(toUpsert.map((row) => row.id)).toEqual([]);
    expect(toTombstone).toContain("desktop-only");
  });

  it("pending local save survives a thinner complete remote and is upserted", () => {
    const remote = [load("already-cloud", "2026-09-07")];
    const inflight = load("just-logged", "2026-09-08", {
      updatedAt: "2026-09-08T18:00:00.000Z",
    });

    const { merged, toUpsert, toTombstone } = mergeCloudLoads({
      remote,
      cache: store([load("already-cloud", "2026-09-07"), inflight]),
      local: store([inflight]),
      pending: [upsertOp(inflight)],
    });

    expect(merged.map((row) => row.id).sort()).toEqual([
      "already-cloud",
      "just-logged",
    ]);
    expect(toUpsert.map((row) => row.id)).toEqual(["just-logged"]);
    expect(toTombstone).not.toContain("just-logged");
  });

  it("unions STORAGE_KEY local loads when remote is empty", () => {
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

describe("2026-09-09 count oscillation (324 → 306 class)", () => {
  const today = busyToday(324);
  const remote306 = today.slice(0, 306);
  const localOnly18 = today.slice(306);

  it("pending local saves survive a thinner remote; stale ghosts do not", () => {
    const pending18 = localOnly18.map(upsertOp);
    const { merged, toUpsert, toTombstone } = mergeCloudLoads({
      remote: remote306,
      cache: store(today),
      local: store(today),
      pending: pending18,
    });

    const onToday = merged.filter((row) => row.date === TODAY);
    expect(onToday).toHaveLength(324);
    expect(toUpsert.map((row) => row.id).sort()).toEqual(
      localOnly18.map((row) => row.id).sort(),
    );
    expect(toUpsert).toHaveLength(18);
    expect(toTombstone).toEqual([]);
  });

  it("stale local-only ghosts not in pending are dropped when remote is a complete snapshot", () => {
    const { merged, toUpsert, toTombstone } = mergeCloudLoads({
      remote: remote306,
      cache: store(today),
      local: store(today),
      pending: [],
    });

    expect(merged.filter((row) => row.date === TODAY)).toHaveLength(306);
    expect(toUpsert).toHaveLength(0);
    expect(toTombstone.sort()).toEqual(localOnly18.map((row) => row.id).sort());
  });

  it("stale persist of 306 does not re-union unprotected local 324 ghosts", () => {
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
    expect(allIds(next!).filter((id) => id.startsWith("sep9-"))).toHaveLength(306);
    expect((next!.loadsByDate[TODAY] ?? []).length).toBe(306);
  });

  it("persist still keeps pending local saves that a 306 snapshot omitted", () => {
    const live = store(today);
    const incoming = store(remote306);
    const next = reconcilePersistedSnapshot({
      incoming,
      live,
      cache: incoming,
      local: live,
      lastGood: live,
      pending: localOnly18.map(upsertOp),
    });

    expect((next!.loadsByDate[TODAY] ?? []).length).toBe(324);
    expect(snapshotLosesProtectedDeviceLoads(allLoads(next!), live, live, localOnly18.map(upsertOp))).toBe(
      false,
    );
  });

  it("after persist, unprotected 306 snapshot is written through", () => {
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
    expect((cache!.loadsByDate[TODAY] ?? []).length).toBe(306);
    expect(snapshotLosesDeviceLoads(allLoads(cache!), live, live, [])).toBe(true);
    expect(
      snapshotLosesProtectedDeviceLoads(allLoads(cache!), live, live, []),
    ).toBe(false);
    expect(
      snapshotDropsProtectedDeviceLoads(allLoads(store(remote306)), live, live, []),
    ).toHaveLength(0);
  });

  it("does not restore-from-local-backup ghosts when remote is a complete 306", () => {
    const local = store(today);
    const cache = store(remote306);
    const { merged, toUpsert, toTombstone } = mergeCloudLoads({
      remote: remote306,
      cache,
      local,
      pending: [],
    });

    expect(merged.filter((row) => row.date === TODAY)).toHaveLength(306);
    expect(toUpsert).toHaveLength(0);
    expect(toTombstone).toHaveLength(18);

    const next = reconcilePersistedSnapshot({
      incoming: store(merged, toTombstone),
      live: cache,
      cache,
      local,
      lastGood: cache,
      pending: [],
    });
    expect((next!.loadsByDate[TODAY] ?? []).length).toBe(306);
    expect(next!.deletedIds).toEqual(expect.arrayContaining(toTombstone));
  });

  it("in-flight refresh extra restores loads saved during the fetch", () => {
    const refreshStartedAt = "2026-09-09T18:00:00.000Z";
    const inflight18 = localOnly18.map((row) =>
      load(row.id, TODAY, { ...row, updatedAt: "2026-09-09T18:00:01.000Z" }),
    );
    const live = store([...remote306, ...inflight18]);
    const poisoned = store(remote306);
    const { merged, toUpsert } = mergeCloudLoads({
      remote: remote306,
      cache: poisoned,
      local: poisoned,
      pending: [],
      extra: [live],
      refreshStartedAt,
    });
    expect(merged.filter((row) => row.date === TODAY)).toHaveLength(324);
    expect(toUpsert).toHaveLength(18);
  });

  it("count drops stale ghosts across merge then persist (306, not 324)", () => {
    const counts: number[] = [];
    const { merged, toTombstone } = mergeCloudLoads({
      remote: remote306,
      cache: store(today),
      local: store(today),
      pending: [],
    });
    counts.push(merged.filter((row) => row.date === TODAY).length);

    const afterPersist = reconcilePersistedSnapshot({
      incoming: store(merged, toTombstone),
      live: store(today),
      cache: store(today),
      local: store(today),
      lastGood: store(today),
      pending: [],
    });
    counts.push((afterPersist!.loadsByDate[TODAY] ?? []).length);

    expect(counts).toEqual([306, 306]);
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
    expect(merged.filter((row) => row.date === TODAY)).toHaveLength(306);
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

  it("loads newer than lastSuccessfulSync survive a thin remote without a pending op", () => {
    const lastSuccessfulSyncAt = "2026-09-09T17:00:00.000Z";
    const fresh = localOnly18.map((row) =>
      load(row.id, TODAY, { ...row, updatedAt: "2026-09-09T17:00:01.000Z" }),
    );
    const { merged, toUpsert } = mergeCloudLoads({
      remote: remote306,
      cache: store([...remote306, ...fresh]),
      local: store([...remote306, ...fresh]),
      pending: [],
      lastSuccessfulSyncAt,
    });
    expect(merged.filter((row) => row.date === TODAY)).toHaveLength(324);
    expect(toUpsert).toHaveLength(18);
  });
});

const SEP10 = "2026-09-10";

describe("2026-09-10 desktop 406 vs mobile/cloud 435 ghost inflation", () => {
  const desktop406 = busyToday(406, SEP10);
  const ghosts29 = Array.from({ length: 29 }, (_, i) =>
    load(`ghost-${String(i).padStart(2, "0")}`, SEP10, {
      truck: String(900 + i),
      createdAt: `${SEP10}T14:00:00.000Z`,
      // Server trigger stamps updated_at=now() on the mobile toUpsert.
      updatedAt: `${SEP10}T21:30:00.000Z`,
    }),
  );
  const remote435 = [...desktop406, ...ghosts29];

  it("device-win heuristic matches 406 ⊂ 435 with a small extra tail", () => {
    expect(deviceWinsDateAgainstRemote(desktop406, remote435, SEP10)).toBe(true);
    expect(deviceWinsDateAgainstRemote(desktop406, desktop406, SEP10)).toBe(false);
    expect(deviceWinsDateAgainstRemote(ghosts29, remote435, SEP10)).toBe(false);
  });

  it("desktop last-good 406 does not adopt the 29 remote ghosts and marks them toDelete", () => {
    const { merged, toUpsert, toDelete, toTombstone } = mergeCloudLoads({
      remote: remote435,
      cache: store(desktop406),
      local: store(desktop406),
      pending: [],
    });

    expect(merged.filter((row) => row.date === SEP10)).toHaveLength(406);
    expect(merged.map((row) => row.id).some((id) => id.startsWith("ghost-"))).toBe(
      false,
    );
    expect(toUpsert).toHaveLength(0);
    expect(toDelete.map((row) => row.id).sort()).toEqual(
      ghosts29.map((row) => row.id).sort(),
    );
    expect(toTombstone.sort()).toEqual(ghosts29.map((row) => row.id).sort());
  });

  it("pending local save on desktop still survives the 435 remote snapshot", () => {
    const inflight = load("desktop-new", SEP10, {
      updatedAt: `${SEP10}T22:00:00.000Z`,
    });
    const { merged, toUpsert, toDelete } = mergeCloudLoads({
      remote: remote435,
      cache: store(desktop406),
      local: store([...desktop406, inflight]),
      pending: [upsertOp(inflight)],
    });

    expect(merged.map((row) => row.id)).toContain("desktop-new");
    expect(merged.filter((row) => row.date === SEP10)).toHaveLength(407);
    expect(toUpsert.map((row) => row.id)).toEqual(["desktop-new"]);
    expect(toDelete).toHaveLength(29);
  });

  it("mobile 435 matching inflated remote does not toUpsert ghosts", () => {
    const { merged, toUpsert, toDelete } = mergeCloudLoads({
      remote: remote435,
      cache: store(remote435),
      local: store(remote435),
      pending: [],
    });

    expect(merged.filter((row) => row.date === SEP10)).toHaveLength(435);
    expect(toUpsert).toHaveLength(0);
    expect(toDelete).toHaveLength(0);
  });

  it("after cloud is recovered to 406, mobile 435 drops ghosts and does not re-cloud them", () => {
    const { merged, toUpsert, toDelete, toTombstone } = mergeCloudLoads({
      remote: desktop406,
      cache: store(remote435),
      local: store(remote435),
      pending: [],
    });

    expect(merged.filter((row) => row.date === SEP10)).toHaveLength(406);
    expect(toUpsert).toHaveLength(0);
    expect(toDelete).toHaveLength(0);
    expect(toTombstone.sort()).toEqual(ghosts29.map((row) => row.id).sort());

    const next = reconcilePersistedSnapshot({
      incoming: store(merged, toTombstone),
      live: store(remote435),
      cache: store(remote435),
      local: store(remote435),
      lastGood: store(remote435),
      pending: [],
    });
    expect((next!.loadsByDate[SEP10] ?? []).length).toBe(406);
    expect(next!.deletedIds).toEqual(expect.arrayContaining(toTombstone));

    const backup = snapshotForDeviceBackup(next!, store(remote435), []);
    expect(backup).not.toBeNull();
    expect((backup!.loadsByDate[SEP10] ?? []).length).toBe(406);
    const pushed = deviceLoadsForPush(next!, store(remote435), []).map((row) => row.id);
    expect(pushed.filter((id) => id.startsWith("ghost-"))).toEqual([]);
  });

  it("a thin phone cache does not win the date and wipe cloud", () => {
    const partial = desktop406.slice(0, 10);
    expect(deviceWinsDateAgainstRemote(partial, remote435, SEP10)).toBe(false);
    const { merged, toDelete } = mergeCloudLoads({
      remote: remote435,
      cache: store(partial),
      local: store(partial),
      pending: [],
    });
    expect(merged.filter((row) => row.date === SEP10)).toHaveLength(435);
    expect(toDelete).toHaveLength(0);
  });

  it("large genuine remote growth is adopted, not deleted", () => {
    const extra94 = Array.from({ length: 94 }, (_, i) =>
      load(`new-${i}`, SEP10, { createdAt: `${SEP10}T23:00:00.000Z` }),
    );
    const remote500 = [...desktop406, ...extra94];
    expect(deviceWinsDateAgainstRemote(desktop406, remote500, SEP10)).toBe(false);
    const { merged, toDelete } = mergeCloudLoads({
      remote: remote500,
      cache: store(desktop406),
      local: store(desktop406),
      pending: [],
    });
    expect(merged.filter((row) => row.date === SEP10)).toHaveLength(500);
    expect(toDelete).toHaveLength(0);
  });

  it("after lastSuccessfulSync, a genuine extra with newer createdAt is kept even on a device-win date", () => {
    const lastSuccessfulSyncAt = `${SEP10}T20:00:00.000Z`;
    const genuine = load("phone-logged", SEP10, {
      createdAt: `${SEP10}T20:05:00.000Z`,
      updatedAt: `${SEP10}T20:05:00.000Z`,
    });
    const remote = [...desktop406, ...ghosts29, genuine];
    const { merged, toDelete } = mergeCloudLoads({
      remote,
      cache: store(desktop406),
      local: store(desktop406),
      pending: [],
      lastSuccessfulSyncAt,
    });
    expect(merged.map((row) => row.id)).toContain("phone-logged");
    expect(merged.filter((row) => row.date === SEP10)).toHaveLength(407);
    expect(toDelete.map((row) => row.id).sort()).toEqual(
      ghosts29.map((row) => row.id).sort(),
    );
    expect(toDelete.map((row) => row.id)).not.toContain("phone-logged");
  });

  it("tombstones still stick: local delete is not upserted when remote still has the row", () => {
    const gone = desktop406[0];
    const kept = desktop406.slice(1);
    const { merged, toUpsert } = mergeCloudLoads({
      remote: desktop406,
      cache: store(kept, [gone.id]),
      local: store(desktop406, [gone.id]),
      pending: [],
    });
    expect(merged.map((row) => row.id)).not.toContain(gone.id);
    expect(toUpsert.map((row) => row.id)).not.toContain(gone.id);
  });
});

describe("isProtectedDeviceLoad", () => {
  const row = load("x", "2026-09-10", { updatedAt: "2026-09-10T12:00:00.000Z" });
  const deleted = new Set<string>();

  it("treats pending upserts as protected", () => {
    expect(
      isProtectedDeviceLoad(row, { pending: [upsertOp(row)], deleted }),
    ).toBe(true);
  });

  it("treats rows newer than lastSuccessfulSync as protected", () => {
    expect(
      isProtectedDeviceLoad(row, {
        pending: [],
        deleted,
        lastSuccessfulSyncAt: "2026-09-10T11:59:59.000Z",
      }),
    ).toBe(true);
    expect(
      isProtectedDeviceLoad(row, {
        pending: [],
        deleted,
        lastSuccessfulSyncAt: "2026-09-10T12:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("treats rows stamped at or after refreshStartedAt as protected", () => {
    expect(
      isProtectedDeviceLoad(row, {
        pending: [],
        deleted,
        refreshStartedAt: "2026-09-10T12:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("does not protect stale local-only rows", () => {
    expect(isProtectedDeviceLoad(row, { pending: [], deleted })).toBe(false);
  });
});

