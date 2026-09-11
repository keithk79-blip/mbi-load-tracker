import { describe, expect, it } from "vitest";
import {
  addManualOff,
  cleanManualList,
  cleanManualOffs,
  deletedManualKey,
  gcDeletedManualKeys,
  mergeManualOffStores,
  removeManualOff,
  type ManualOffsStore,
} from "./manualCallOffs";

describe("addManualOff / removeManualOff", () => {
  it("adds a name for a Chicago day and rejects the same name twice", () => {
    const first = addManualOff({}, "2026-09-08", "Markeith nunnally", "call-off", new Set());
    expect(first.added).toEqual({ name: "Markeith nunnally", kind: "call-off" });
    const second = addManualOff(
      first.store,
      "2026-09-08",
      "markeith nunnally",
      "ncns",
      new Set(),
    );
    expect(second.added).toBeNull();
    expect(second.store).toEqual(first.store);
  });

  it("adds Late/Early the same way as other manual kinds", () => {
    const result = addManualOff(
      {},
      "2026-09-09",
      "Glen Barker",
      "late-early",
      new Set(),
    );
    expect(result.added).toEqual({ name: "Glen Barker", kind: "late-early" });
    expect(result.store["2026-09-09"]).toEqual([
      { name: "Glen Barker", kind: "late-early" },
    ]);
  });

  it("cleaners keep late-early and drop unknown kinds", () => {
    expect(
      cleanManualList([
        { name: "Glen Barker", kind: "late-early" },
        { name: "Skip", kind: "not-a-kind" },
        { name: "Ada", kind: "call-off" },
      ]),
    ).toEqual([
      { name: "Ada", kind: "call-off" },
      { name: "Glen Barker", kind: "late-early" },
    ]);
    expect(
      cleanManualOffs({
        "2026-09-11": [{ name: "Glen Barker", kind: "late-early" }],
        "nope": [{ name: "Ada", kind: "call-off" }],
      }),
    ).toEqual({
      "2026-09-11": [{ name: "Glen Barker", kind: "late-early" }],
    });
  });

  it("rejects a name already occupied by the sheet list", () => {
    const result = addManualOff(
      {},
      "2026-09-08",
      "Pablo Cruz",
      "p-day",
      new Set(["pablo cruz"]),
    );
    expect(result.added).toBeNull();
    expect(result.store).toEqual({});
  });

  it("removes only the matching manual name", () => {
    const store: ManualOffsStore = {
      "2026-09-08": [
        { name: "Mike Davy", kind: "okd-off" },
        { name: "Pablo Cruz", kind: "ncns" },
      ],
    };
    const next = removeManualOff(store, "2026-09-08", "mike davy");
    expect(next.removed).toEqual({ name: "Mike Davy", kind: "okd-off" });
    expect(next.store["2026-09-08"]).toEqual([{ name: "Pablo Cruz", kind: "ncns" }]);
  });
});

describe("mergeManualOffStores", () => {
  it("unions dates, lets local kind win, and honors delete tombstones", () => {
    const local: ManualOffsStore = {
      "2026-09-08": [{ name: "Ada", kind: "p-day" }],
    };
    const remote: ManualOffsStore = {
      "2026-09-08": [
        { name: "Ada", kind: "call-off" },
        { name: "Bea", kind: "ncns" },
      ],
      "2026-09-09": [{ name: "Cara", kind: "okd-off" }],
    };
    const merged = mergeManualOffStores(local, remote, [
      deletedManualKey("2026-09-08", "Bea"),
    ]);
    expect(merged).toEqual({
      "2026-09-08": [{ name: "Ada", kind: "p-day" }],
      "2026-09-09": [{ name: "Cara", kind: "okd-off" }],
    });
  });

  it("drops tombstones once the remote snapshot no longer has that name", () => {
    const remote: ManualOffsStore = {
      "2026-09-08": [{ name: "Still There", kind: "call-off" }],
    };
    expect(
      gcDeletedManualKeys(
        [
          deletedManualKey("2026-09-08", "Still There"),
          deletedManualKey("2026-09-08", "Gone"),
        ],
        remote,
      ),
    ).toEqual([deletedManualKey("2026-09-08", "Still There")]);
  });
});
