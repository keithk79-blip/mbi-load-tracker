import { beforeEach, describe, expect, it } from "vitest";
import {
  STATION_CALL_YARDS,
  adjacentStationId,
  applyStationCallTombstones,
  commitStationCell,
  effectiveClose,
  emptyBoard,
  mergeBoardCells,
  normalizeStationCell,
  parseNumericCell,
  reconcileStationCallCloud,
  resetStationCallTombstones,
  setStationClose,
  setStationHour,
  startForStation,
  type StationCallStore,
  type StationDayBoard,
} from "./stationCalls";

beforeEach(() => {
  resetStationCallTombstones();
});

describe("station call carry-over", () => {
  it("uses prior Close as next Start", () => {
    let store: StationCallStore = {};
    store = setStationClose(store, "2026-09-05", "melrose", 15);
    expect(startForStation(store, "2026-09-06", "melrose")).toBe(15);
    expect(startForStation(store, "2026-09-06", "calumet")).toBe(0);
  });

  it("falls back to last numeric hour when Close is blank", () => {
    let store: StationCallStore = {};
    store = setStationHour(store, "2026-09-05", "northlake", "6", 10);
    store = setStationHour(store, "2026-09-05", "northlake", "9", 12);
    const row = store["2026-09-05"]!.northlake!;
    expect(effectiveClose(row, 0)).toBe(12);
    expect(startForStation(store, "2026-09-06", "northlake")).toBe(12);
  });

  it("keeps decimal Close for next Start", () => {
    let store: StationCallStore = {};
    store = setStationClose(store, "2026-09-05", "melrose", "1.5");
    expect(startForStation(store, "2026-09-06", "melrose")).toBe(1.5);
  });

  it("skips letter Close and uses last numeric hour", () => {
    let store: StationCallStore = {};
    store = setStationHour(store, "2026-09-05", "medill", "8", "4.5");
    store = setStationHour(store, "2026-09-05", "medill", "15", "late");
    store = setStationClose(store, "2026-09-05", "medill", "n/a");
    expect(effectiveClose(store["2026-09-05"]!.medill!, 0)).toBe(4.5);
    expect(startForStation(store, "2026-09-06", "medill")).toBe(4.5);
  });

  it("starts empty hours", () => {
    const board = emptyBoard();
    expect(board["apollo"]?.hours).toEqual({});
    expect(board["apollo"]?.close).toBeNull();
  });
});

describe("station call cell text", () => {
  it("commits empty and whitespace as blank", () => {
    expect(commitStationCell("")).toBeNull();
    expect(commitStationCell("   ")).toBeNull();
    expect(normalizeStationCell("")).toBeUndefined();
    expect(normalizeStationCell("   ")).toBeUndefined();
  });

  it("keeps decimals and letters instead of flooring or stripping", () => {
    expect(commitStationCell("1.5")).toBe("1.5");
    expect(commitStationCell("0.25")).toBe("0.25");
    expect(commitStationCell("late")).toBe("late");
    expect(commitStationCell("N/A")).toBe("N/A");
    expect(normalizeStationCell(1.5)).toBe("1.5");
    expect(normalizeStationCell(12)).toBe("12");
  });

  it("does not bounce empty back to 0", () => {
    let store: StationCallStore = {};
    store = setStationHour(store, "2026-09-08", "melrose", "10", "8");
    store = setStationHour(store, "2026-09-08", "melrose", "10", null);
    expect(store["2026-09-08"]!.melrose!.hours["10"]).toBeNull();
    store = setStationClose(store, "2026-09-08", "melrose", "3");
    store = setStationClose(store, "2026-09-08", "melrose", "");
    expect(store["2026-09-08"]!.melrose!.close).toBeNull();
  });

  it("parses numeric summaries and ignores letters", () => {
    expect(parseNumericCell("")).toBeNull();
    expect(parseNumericCell("   ")).toBeNull();
    expect(parseNumericCell("1.5")).toBe(1.5);
    expect(parseNumericCell("12")).toBe(12);
    expect(parseNumericCell(0)).toBe(0);
    expect(parseNumericCell("late")).toBeNull();
    expect(parseNumericCell("1.5x")).toBeNull();
  });

  it("persists letter and decimal hour cells", () => {
    let store: StationCallStore = {};
    store = setStationHour(store, "2026-09-08", "calumet", "7", "1.5");
    store = setStationHour(store, "2026-09-08", "calumet", "8", "WF");
    expect(store["2026-09-08"]!.calumet!.hours["7"]).toBe("1.5");
    expect(store["2026-09-08"]!.calumet!.hours["8"]).toBe("WF");
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

function boardWith(
  stationId: string,
  patch: Partial<{
    hours: StationDayBoard[string]["hours"];
    close: StationDayBoard[string]["close"];
    hoursAt: StationDayBoard[string]["hoursAt"];
    closeAt: string;
  }>,
): StationDayBoard {
  const board = emptyBoard();
  board[stationId] = { ...board[stationId]!, ...patch, hours: { ...patch.hours } };
  return board;
}

describe("station call merge / clears", () => {
  it("commit empty → null (not 0)", () => {
    expect(commitStationCell("")).toBeNull();
    expect(commitStationCell("   ")).toBeNull();
    expect(commitStationCell("0")).toBe("0");
  });

  it("merge local-cleared hour vs remote 0 → blank wins", () => {
    const local = boardWith("c-heights", { hours: { "9": null } });
    const remote = boardWith("c-heights", { hours: { "9": "0" } });
    const merged = mergeBoardCells(local, remote);
    expect(merged["c-heights"]!.hours["9"]).toBeNull();
    expect(merged["c-heights"]!.hours["9"]).not.toBe("0");
  });

  it("merge local-cleared Close vs remote 0 → blank wins", () => {
    const local = boardWith("calumet", { close: null, closeAt: "2026-09-09T13:00:00.000Z" });
    const remote = boardWith("calumet", { close: "0" });
    const merged = mergeBoardCells(local, remote);
    expect(merged["calumet"]!.close).toBeNull();
  });

  it("does not treat default Close null as a clear over a remote fill", () => {
    const local = emptyBoard();
    const remote = boardWith("melrose", { close: "15" });
    expect(mergeBoardCells(local, remote)["melrose"]!.close).toBe("15");
  });

  it("keeps other hour fills while a cleared cell stays blank", () => {
    let local: StationCallStore = {};
    local = setStationHour(local, "2026-09-09", "medill", "7", "6", "2026-09-09T12:00:00.000Z");
    local = setStationHour(local, "2026-09-09", "medill", "9", "0", "2026-09-09T12:01:00.000Z");
    local = setStationHour(local, "2026-09-09", "medill", "9", null, "2026-09-09T13:00:00.000Z");

    const remote = boardWith("medill", {
      hours: { "9": "0", "11": "4" },
    });
    const merged = mergeBoardCells(local["2026-09-09"]!, remote);
    expect(merged["medill"]!.hours["7"]).toBe("6");
    expect(merged["medill"]!.hours["9"]).toBeNull();
    expect(merged["medill"]!.hours["11"]).toBe("4");
  });

  it("reconcile pushes a local clear so cloud does not keep a stale 0", () => {
    let local: StationCallStore = {};
    local = setStationHour(local, "2026-09-09", "c-heights", "9", null, "2026-09-09T14:00:00.000Z");
    const remote: StationCallStore = {
      "2026-09-09": boardWith("c-heights", { hours: { "9": "0" } }),
    };
    const { merged, toPush } = reconcileStationCallCloud(local, remote);
    expect(merged["2026-09-09"]!["c-heights"]!.hours["9"]).toBeNull();
    expect(toPush).toHaveLength(1);
    expect(toPush[0]!.date).toBe("2026-09-09");
    expect(toPush[0]!.board["c-heights"]!.hours["9"]).toBeNull();
  });

  it("tombstones blank a stale hydrate board that still has remote 0", () => {
    let store: StationCallStore = {};
    store = setStationHour(store, "2026-09-09", "wheeling", "13", "0");
    store = setStationHour(store, "2026-09-09", "wheeling", "13", null);
    const bounced = boardWith("wheeling", { hours: { "13": "0" } });
    const applied = applyStationCallTombstones({ "2026-09-09": bounced });
    expect(applied["2026-09-09"]!["wheeling"]!.hours["13"]).toBeNull();
  });

  it("newer remote fill still wins over an older local value", () => {
    const local = boardWith("hooker", {
      hours: { "8": "10" },
      hoursAt: { "8": "2026-09-09T10:00:00.000Z" },
    });
    const remote = boardWith("hooker", {
      hours: { "8": "12" },
      hoursAt: { "8": "2026-09-09T11:00:00.000Z" },
    });
    expect(mergeBoardCells(local, remote)["hooker"]!.hours["8"]).toBe("12");
  });
});
