import { beforeEach, describe, expect, it } from "vitest";
import {
  STATION_CALL_YARDS,
  adjacentStationId,
  applyStationCallTombstones,
  cleanStationDayRow,
  commitStationCell,
  commitStationNote,
  effectiveClose,
  emptyBoard,
  extractStationNotesFromRawDays,
  loadStationNotes,
  mergeBoardCells,
  mergeStationNoteStores,
  normalizeStationCell,
  noteForStation,
  notesEquivalent,
  parseNumericCell,
  reconcileStationCallCloud,
  reconcileStationNotesCloud,
  resetStationCallTombstones,
  seedStationNotes,
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

describe("station call notes", () => {
  it("commits empty and whitespace as blank", () => {
    expect(commitStationNote("")).toBeNull();
    expect(commitStationNote("   ")).toBeNull();
    expect(commitStationNote("\n\t")).toBeNull();
  });

  it("caps very long notes", () => {
    expect(commitStationNote("x".repeat(3000))?.length).toBe(2000);
  });

  it("cleanRow keeps hours/close and drops leftover per-date notes", () => {
    const kept = cleanStationDayRow({
      hours: { "6": "4" },
      close: "5",
      note: "  Melrose late  ",
      noteAt: "2026-09-11T12:00:00.000Z",
      extra: "nope",
    });
    expect(kept.hours["6"]).toBe("4");
    expect(kept.close).toBe("5");
    expect(kept).not.toHaveProperty("note");
    expect(kept).not.toHaveProperty("noteAt");

    const blank = cleanStationDayRow({ note: "   ", hours: { "8": "2" } });
    expect(blank).not.toHaveProperty("note");
    expect(blank.hours["8"]).toBe("2");
  });

  it("extracts the newest non-empty per-station note from dated boards", () => {
    const extracted = extractStationNotesFromRawDays({
      "2026-09-10": {
        melrose: { note: "old", noteAt: "2026-09-10T12:00:00.000Z" },
        batavia: { note: "hold", noteAt: "2026-09-10T12:00:00.000Z" },
      },
      "2026-09-11": {
        melrose: { note: "new", noteAt: "2026-09-11T15:00:00.000Z" },
        batavia: { note: "  ", noteAt: "2026-09-11T16:00:00.000Z" },
        calumet: { hours: { "9": "3" } },
      },
    });
    expect(extracted.melrose).toEqual({
      note: "new",
      noteAt: "2026-09-11T15:00:00.000Z",
    });
    expect(extracted.batavia).toEqual({
      note: "hold",
      noteAt: "2026-09-10T12:00:00.000Z",
    });
    expect(extracted.calumet).toBeUndefined();
  });

  it("setStationNote is per station and does not touch hour boards", () => {
    let days: StationCallStore = {};
    days = setStationHour(days, "2026-09-11", "melrose", "7", "6");
    days = setStationHour(days, "2026-09-10", "melrose", "7", "5");
    let notes = setStationNote({}, "melrose", "scale backup", "2026-09-11T15:00:00.000Z");
    expect(noteForStation(notes, "melrose")).toBe("scale backup");
    expect(notes.melrose!.noteAt).toBe("2026-09-11T15:00:00.000Z");
    expect(days["2026-09-11"]!.melrose!.hours["7"]).toBe("6");
    expect(days["2026-09-10"]!.melrose!.hours["7"]).toBe("5");
    expect(days["2026-09-11"]!.melrose!).not.toHaveProperty("note");
    expect(noteForStation(notes, "melrose")).toBe("scale backup");
  });

  it("clearing a note on any day clears it globally", () => {
    let notes = setStationNote({}, "batavia", "hold", "2026-09-11T10:00:00.000Z");
    notes = setStationNote(notes, "batavia", "  ", "2026-09-11T11:00:00.000Z");
    expect(noteForStation(notes, "batavia")).toBeNull();
    expect(notes.batavia!.noteAt).toBe("2026-09-11T11:00:00.000Z");
  });

  it("seeds global notes from legacy dated notes only when global is empty", () => {
    const seeded = seedStationNotes(
      { elgin: { note: null, noteAt: "2026-09-11T18:00:00.000Z" } },
      {
        elgin: { note: "should not return", noteAt: "2026-09-10T12:00:00.000Z" },
        melrose: { note: "from monday", noteAt: "2026-09-10T12:00:00.000Z" },
      },
    );
    expect(seeded.elgin?.note).toBeNull();
    expect(seeded.melrose?.note).toBe("from monday");
    expect(seeded.melrose?.noteAt).toBe("2026-09-10T12:00:00.000Z");
  });

  it("does not copy a global note onto day boards", () => {
    const notes = setStationNote({}, "melrose", "scale backup", "2026-09-11T15:00:00.000Z");
    let days: StationCallStore = {};
    days = setStationHour(days, "2026-09-11", "melrose", "8", "7");
    days = setStationHour(days, "2026-09-12", "melrose", "8", "8");
    expect(days["2026-09-11"]!.melrose!).not.toHaveProperty("note");
    expect(days["2026-09-12"]!.melrose!).not.toHaveProperty("note");
    expect(noteForStation(notes, "melrose")).toBe("scale backup");
  });

  it("merge: never-set local note does not overwrite a remote note", () => {
    const merged = mergeStationNoteStores(
      {},
      { melrose: { note: "WF waiting", noteAt: "2026-09-11T12:00:00.000Z" } },
    );
    expect(merged.melrose?.note).toBe("WF waiting");
  });

  it("merge: newer note wins independently of hour cells", () => {
    const localDays = boardWith("calumet", {
      hours: { "9": "3" },
      hoursAt: { "9": "2026-09-11T14:00:00.000Z" },
    });
    const remoteDays = boardWith("calumet", {
      hours: { "9": "1" },
      hoursAt: { "9": "2026-09-11T12:00:00.000Z" },
    });
    expect(mergeBoardCells(localDays, remoteDays)["calumet"]!.hours["9"]).toBe("3");

    const mergedNotes = mergeStationNoteStores(
      { calumet: { note: "old", noteAt: "2026-09-11T10:00:00.000Z" } },
      { calumet: { note: "newer note", noteAt: "2026-09-11T13:00:00.000Z" } },
    );
    expect(mergedNotes.calumet?.note).toBe("newer note");
  });

  it("merge: explicit local note clear beats a stale remote fill", () => {
    const merged = mergeStationNoteStores(
      { elgin: { note: null, noteAt: "2026-09-11T16:00:00.000Z" } },
      { elgin: { note: "stale", noteAt: "2026-09-11T12:00:00.000Z" } },
    );
    expect(merged.elgin?.note).toBeNull();
  });

  it("notesEquivalent treats missing and blank notes as the same", () => {
    expect(notesEquivalent({ note: null }, undefined)).toBe(true);
    expect(
      notesEquivalent(
        { note: "hi", noteAt: "2026-09-11T12:00:00.000Z" },
        { note: null },
      ),
    ).toBe(false);
  });

  it("reconcile pushes a local note so cloud picks it up", () => {
    const local = setStationNote({}, "northlake", "doors stuck", "2026-09-11T14:00:00.000Z");
    const { merged, toPush } = reconcileStationNotesCloud(local, {});
    expect(merged.northlake?.note).toBe("doors stuck");
    expect(toPush).toHaveLength(1);
    expect(toPush[0]!.stationId).toBe("northlake");
    expect(toPush[0]!.row.note).toBe("doors stuck");
  });

  it("reconcile seeds from per-date boards then pushes the global note", () => {
    const legacy = extractStationNotesFromRawDays({
      "2026-09-09": {
        wheeling: { note: "gate closed", noteAt: "2026-09-09T10:00:00.000Z" },
      },
    });
    const { merged, toPush } = reconcileStationNotesCloud({}, {}, legacy);
    expect(merged.wheeling?.note).toBe("gate closed");
    expect(toPush[0]!.row.note).toBe("gate closed");
  });

  it("hour tombstones still blank a bounced 0 without depending on notes", () => {
    let store: StationCallStore = {};
    store = setStationHour(store, "2026-09-11", "wheeling", "13", "0");
    store = setStationHour(store, "2026-09-11", "wheeling", "13", null);
    const bounced = boardWith("wheeling", { hours: { "13": "0" } });
    const applied = applyStationCallTombstones({ "2026-09-11": bounced });
    expect(applied["2026-09-11"]!["wheeling"]!.hours["13"]).toBeNull();
    expect(noteForStation({ wheeling: { note: "gate closed" } }, "wheeling")).toBe(
      "gate closed",
    );
  });
});

describe("station note localStorage", () => {
  const memory = new Map<string, string>();
  const DAYS_KEY = "chitrader.load-tracker.station-calls.v1";
  const NOTES_KEY = "chitrader.load-tracker.station-call-notes.v1";

  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
        clear: () => memory.clear(),
      },
    });
  });

  it("seeds a global note from leftover per-date board JSON", () => {
    memory.set(
      DAYS_KEY,
      JSON.stringify({
        version: 1,
        days: {
          "2026-09-10": {
            melrose: {
              hours: { "8": "4" },
              close: null,
              note: "seed me",
              noteAt: "2026-09-10T12:00:00.000Z",
            },
          },
        },
      }),
    );
    const notes = loadStationNotes();
    expect(noteForStation(notes, "melrose")).toBe("seed me");
    const persisted = JSON.parse(memory.get(NOTES_KEY) ?? "{}") as {
      notes?: { melrose?: { note?: string } };
    };
    expect(persisted.notes?.melrose?.note).toBe("seed me");
    expect(notes.melrose?.noteAt).toBe("2026-09-10T12:00:00.000Z");
  });

  it("does not resurrect a cleared global note from an old dated board", () => {
    memory.set(
      NOTES_KEY,
      JSON.stringify({
        version: 1,
        notes: { melrose: { note: null, noteAt: "2026-09-11T18:00:00.000Z" } },
      }),
    );
    memory.set(
      DAYS_KEY,
      JSON.stringify({
        version: 1,
        days: {
          "2026-09-10": {
            melrose: { note: "old", noteAt: "2026-09-10T12:00:00.000Z" },
          },
        },
      }),
    );
    const notes = loadStationNotes();
    expect(noteForStation(notes, "melrose")).toBeNull();
  });
});
