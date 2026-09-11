import { beforeEach, describe, expect, it } from "vitest";
import {
  STATION_CALL_YARDS,
  adjacentStationId,
  applyStationCallTombstones,
  boardsEquivalent,
  cleanStationDayRow,
  commitStationCell,
  commitStationNote,
  effectiveClose,
  emptyBoard,
  mergeBoardCells,
  normalizeStationCell,
  parseNumericCell,
  reconcileStationCallCloud,
  resetStationCallTombstones,
  setStationClose,
  setStationHour,
  setStationNote,
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
    expect(board["apollo"]?.note).toBeNull();
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
    note: StationDayBoard[string]["note"];
    hoursAt: StationDayBoard[string]["hoursAt"];
    closeAt: string;
    noteAt: string;
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

describe("station call notes", () => {
  it("commits empty and whitespace as blank", () => {
    expect(commitStationNote("")).toBeNull();
    expect(commitStationNote("   ")).toBeNull();
    expect(commitStationNote("\n\t")).toBeNull();
  });

  it("caps very long notes", () => {
    expect(commitStationNote("x".repeat(3000))?.length).toBe(2000);
  });

  it("cleanRow keeps a note and drops junk / blank notes", () => {
    const kept = cleanStationDayRow({
      hours: { "6": "4" },
      close: "5",
      note: "  Melrose late  ",
      noteAt: "2026-09-11T12:00:00.000Z",
      extra: "nope",
    });
    expect(kept.hours["6"]).toBe("4");
    expect(kept.close).toBe("5");
    expect(kept.note).toBe("Melrose late");
    expect(kept.noteAt).toBe("2026-09-11T12:00:00.000Z");

    const blank = cleanStationDayRow({ note: "   ", hours: { "8": "2" } });
    expect(blank.note).toBeNull();
    expect(blank.hours["8"]).toBe("2");

    const missing = cleanStationDayRow({ hours: { "9": "1" } });
    expect(missing.note).toBeNull();
    expect(missing.noteAt).toBeUndefined();
  });

  it("setStationNote stamps noteAt and does not wipe hours", () => {
    let store: StationCallStore = {};
    store = setStationHour(store, "2026-09-11", "melrose", "7", "6");
    store = setStationNote(store, "2026-09-11", "melrose", "scale backup", "2026-09-11T15:00:00.000Z");
    const row = store["2026-09-11"]!.melrose!;
    expect(row.note).toBe("scale backup");
    expect(row.noteAt).toBe("2026-09-11T15:00:00.000Z");
    expect(row.hours["7"]).toBe("6");

    store = setStationHour(store, "2026-09-11", "melrose", "8", "7");
    expect(store["2026-09-11"]!.melrose!.note).toBe("scale backup");
  });

  it("clears a note to null with a timestamp", () => {
    let store: StationCallStore = {};
    store = setStationNote(store, "2026-09-11", "batavia", "hold", "2026-09-11T10:00:00.000Z");
    store = setStationNote(store, "2026-09-11", "batavia", "  ", "2026-09-11T11:00:00.000Z");
    expect(store["2026-09-11"]!.batavia!.note).toBeNull();
    expect(store["2026-09-11"]!.batavia!.noteAt).toBe("2026-09-11T11:00:00.000Z");
  });

  it("merge: never-set local note does not overwrite a remote note", () => {
    const local = emptyBoard();
    const remote = boardWith("melrose", { note: "WF waiting", noteAt: "2026-09-11T12:00:00.000Z" });
    expect(mergeBoardCells(local, remote)["melrose"]!.note).toBe("WF waiting");
  });

  it("merge: newer note wins independently of hour cells", () => {
    const local = boardWith("calumet", {
      hours: { "9": "3" },
      hoursAt: { "9": "2026-09-11T14:00:00.000Z" },
      note: "old",
      noteAt: "2026-09-11T10:00:00.000Z",
    });
    const remote = boardWith("calumet", {
      hours: { "9": "1" },
      hoursAt: { "9": "2026-09-11T12:00:00.000Z" },
      note: "newer note",
      noteAt: "2026-09-11T13:00:00.000Z",
    });
    const merged = mergeBoardCells(local, remote);
    expect(merged["calumet"]!.hours["9"]).toBe("3");
    expect(merged["calumet"]!.note).toBe("newer note");
  });

  it("merge: explicit local note clear beats a stale remote fill", () => {
    const local = boardWith("elgin", {
      note: null,
      noteAt: "2026-09-11T16:00:00.000Z",
    });
    const remote = boardWith("elgin", {
      note: "stale",
      noteAt: "2026-09-11T12:00:00.000Z",
    });
    expect(mergeBoardCells(local, remote)["elgin"]!.note).toBeNull();
  });

  it("boardsEquivalent treats missing and blank notes as the same", () => {
    const a = boardWith("hooker", { note: null });
    const b = emptyBoard();
    expect(boardsEquivalent(a, b)).toBe(true);
    const c = boardWith("hooker", { note: "hi", noteAt: "2026-09-11T12:00:00.000Z" });
    expect(boardsEquivalent(a, c)).toBe(false);
  });

  it("reconcile pushes a local note so cloud picks it up", () => {
    let local: StationCallStore = {};
    local = setStationNote(local, "2026-09-11", "northlake", "doors stuck", "2026-09-11T14:00:00.000Z");
    const remote: StationCallStore = { "2026-09-11": emptyBoard() };
    const { merged, toPush } = reconcileStationCallCloud(local, remote);
    expect(merged["2026-09-11"]!.northlake!.note).toBe("doors stuck");
    expect(toPush).toHaveLength(1);
    expect(toPush[0]!.board["northlake"]!.note).toBe("doors stuck");
  });

  it("hour tombstones still blank a bounced 0 when a note is present", () => {
    let store: StationCallStore = {};
    store = setStationNote(store, "2026-09-11", "wheeling", "gate closed");
    store = setStationHour(store, "2026-09-11", "wheeling", "13", "0");
    store = setStationHour(store, "2026-09-11", "wheeling", "13", null);
    const bounced = boardWith("wheeling", {
      hours: { "13": "0" },
      note: "gate closed",
    });
    const applied = applyStationCallTombstones({ "2026-09-11": bounced });
    expect(applied["2026-09-11"]!["wheeling"]!.hours["13"]).toBeNull();
    expect(applied["2026-09-11"]!["wheeling"]!.note).toBe("gate closed");
  });
});
