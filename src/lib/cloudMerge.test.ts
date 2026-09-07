import { describe, expect, it } from "vitest";
import { collectDeviceLoads, mergeCloudLoads } from "./cloudMerge";
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

function store(loads: Load[]): Persisted {
  const loadsByDate: Record<string, Load[]> = {};
  for (const row of loads) {
    const bucket = loadsByDate[row.date] ?? [];
    bucket.push(row);
    loadsByDate[row.date] = bucket;
  }
  return { version: 1, loadsByDate };
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
    const pending: QueueOp[] = [
      { opId: "op-del", kind: "delete", loadId: "gone", queuedAt: "2026-09-08T12:00:00.000Z" },
    ];

    const { merged, toUpsert } = mergeCloudLoads({
      remote: [cached],
      cache: store([cached]),
      local: store([]),
      pending,
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
});
