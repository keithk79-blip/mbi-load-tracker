import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CALL_OFF_LOG_SEED_CSV } from "../data/callOffLogSeed";
import {
  addCallOffLogEntry,
  kindForLogEntry,
  logEntriesToRows,
  logEntrySubtracts,
  mergeCallOffLog,
  rowsFromSeedCsv,
  seedIdForRow,
} from "./callOffLog";
import { fullDayOffCount, fullDayOffEntries } from "./driverAvailability";

describe("call-off log", () => {
  it("parses the seeded sheet and subtracts full-day offs only", () => {
    const rows = logEntriesToRows(rowsFromSeedCsv(CALL_OFF_LOG_SEED_CSV));
    expect(rows.length).toBeGreaterThan(80);
    expect(fullDayOffCount(rows, "2026-08-15")).toBe(5);
    expect(
      fullDayOffEntries(rows, [], "2026-08-15")
        .map((row) => row.kind)
        .sort(),
    ).toEqual(["call-off", "okd-off", "okd-off", "okd-off", "okd-off"]);
    expect(fullDayOffCount(rows, "2026-08-14")).toBe(1);
    expect(fullDayOffCount(rows, "2026-09-15")).toBe(3);
  });

  it("keeps through-date ranges on the Available subtract", () => {
    const rows = logEntriesToRows(rowsFromSeedCsv(CALL_OFF_LOG_SEED_CSV));
    const jovan = rows.find((row) => row.name === "Jovan Morris");
    expect(jovan?.end).toBe("2026-08-29");
    expect(fullDayOffCount(rows, "2026-08-26")).toBeGreaterThanOrEqual(1);
    expect(fullDayOffCount(rows, "2026-08-29")).toBeGreaterThanOrEqual(1);
  });

  it("does not subtract park / late working notes", () => {
    expect(logEntrySubtracts({ reason: "ok'd to park by 3 pm" })).toBe(false);
    expect(logEntrySubtracts({ reason: "ok'd to do 1 load" })).toBe(false);
    expect(logEntrySubtracts({ reason: "Ok'd to come in late, 11am" })).toBe(false);
    expect(kindForLogEntry({ reason: "P-Day" })).toBe("p-day");
    expect(kindForLogEntry({ reason: "ok'd off" })).toBe("okd-off");
    expect(kindForLogEntry({ reason: "Call Off" })).toBe("call-off");
  });

  it("adds and merges without duplicating seed ids", () => {
    const seeded = rowsFromSeedCsv(CALL_OFF_LOG_SEED_CSV);
    const id = seedIdForRow({
      name: "Mike Smith",
      start: "2026-08-14",
      end: null,
      reason: "P-Day",
    });
    expect(seeded.some((row) => row.id === id)).toBe(true);
    const { entry } = addCallOffLogEntry(seeded, {
      name: "Test Driver",
      start: "2026-09-16",
      reason: "P-Day",
    });
    expect(entry?.name).toBe("Test Driver");
    const merged = mergeCallOffLog(seeded, seeded, []);
    expect(merged).toHaveLength(seeded.length);
  });
});

describe("Call-Off's screen filters", () => {
  it("includes Yesterday next to All / Upcoming / Today", () => {
    const src = readFileSync(new URL("../screens/CallOffsScreen.tsx", import.meta.url), "utf8");
    expect(src).toContain('"yesterday"');
    expect(src).toContain("Yesterday (");
    expect(src).toContain("addDays(today, -1)");
  });
});
