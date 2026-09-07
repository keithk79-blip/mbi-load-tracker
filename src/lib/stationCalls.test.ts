import { describe, expect, it } from "vitest";
import {
  STATION_CALL_YARDS,
  adjacentStationId,
  effectiveClose,
  emptyBoard,
  setStationClose,
  setStationHour,
  startForStation,
  type StationCallStore,
} from "./stationCalls";

describe("station call carry-over", () => {
  it("uses prior Close as next Start", () => {
    let store: StationCallStore = {};
    store = setStationClose(store, "2026-09-05", "melrose", 15);
    expect(startForStation(store, "2026-09-06", "melrose")).toBe(15);
    expect(startForStation(store, "2026-09-06", "calumet")).toBe(0);
  });

  it("falls back to last hour when Close is blank", () => {
    let store: StationCallStore = {};
    store = setStationHour(store, "2026-09-05", "northlake", "6", 10);
    store = setStationHour(store, "2026-09-05", "northlake", "9", 12);
    const row = store["2026-09-05"]!.northlake!;
    expect(effectiveClose(row, 0)).toBe(12);
    expect(startForStation(store, "2026-09-06", "northlake")).toBe(12);
  });

  it("starts empty hours", () => {
    const board = emptyBoard();
    expect(board["apollo"]?.hours).toEqual({});
    expect(board["apollo"]?.close).toBeNull();
  });
});

describe("adjacentStationId", () => {
  const first = STATION_CALL_YARDS[0]!.id;
  const second = STATION_CALL_YARDS[1]!.id;
  const last = STATION_CALL_YARDS[STATION_CALL_YARDS.length - 1]!.id;
  const secondLast = STATION_CALL_YARDS[STATION_CALL_YARDS.length - 2]!.id;

  it("moves down one station on Enter (mid-row)", () => {
    expect(adjacentStationId(first, 1)).toBe(second);
    expect(adjacentStationId(secondLast, 1)).toBe(last);
  });

  it("returns null on the last station so Enter can blur", () => {
    expect(adjacentStationId(last, 1)).toBeNull();
  });

  it("moves up one station on Shift+Enter", () => {
    expect(adjacentStationId(second, -1)).toBe(first);
    expect(adjacentStationId(last, -1)).toBe(secondLast);
  });

  it("returns null on the first station so Shift+Enter can blur", () => {
    expect(adjacentStationId(first, -1)).toBeNull();
  });

  it("returns null for an unknown station", () => {
    expect(adjacentStationId("not-a-yard", 1)).toBeNull();
  });
});
