import { afterEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("./supabase", () => ({
  getSupabase: () => ({ from: fromMock }),
}));

import {
  deleteRemoteManualOff,
  describeManualOffsCloudError,
  fetchRemoteManualOffs,
  manualOffsResultFromError,
  pushMissingManualOffs,
  upsertRemoteManualOff,
} from "./driverCloud";

const PGRST205 = {
  code: "PGRST205",
  message:
    "Could not find the table 'public.manual_call_offs' in the schema cache",
};

function thenable(result: { data?: unknown; error: unknown }) {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise<unknown>;
  } = {
    select: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  builder.select.mockReturnValue(builder);
  builder.upsert.mockReturnValue(builder);
  builder.delete.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

afterEach(() => {
  fromMock.mockReset();
  vi.restoreAllMocks();
});

describe("describeManualOffsCloudError", () => {
  it("points at the paste-ready SQL when PostgREST has no table", () => {
    expect(describeManualOffsCloudError(PGRST205)).toBe(
      "Call-offs did not reach the cloud — run Load-Tracker-manual-call-offs.sql in Supabase once.",
    );
  });

  it("passes through other PostgREST messages", () => {
    expect(
      describeManualOffsCloudError({
        code: "23514",
        message: "new row violates check constraint",
      }),
    ).toBe(
      "Call-offs did not reach the cloud — new row violates check constraint",
    );
  });

  it("has a short fallback when the error is empty", () => {
    expect(describeManualOffsCloudError(null)).toBe(
      "Call-offs did not reach the cloud.",
    );
  });
});

describe("manualOffsResultFromError", () => {
  it("treats a missing error as success and logs failures", () => {
    expect(manualOffsResultFromError("upsert", null)).toEqual({
      ok: true,
      error: null,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = manualOffsResultFromError("upsert", PGRST205);
    expect(failed.ok).toBe(false);
    expect(failed.error).toMatch(/Load-Tracker-manual-call-offs\.sql/);
    expect(warn).toHaveBeenCalledWith(
      "manual_call_offs upsert failed",
      PGRST205.message,
    );
  });
});

describe("manual_call_offs cloud writes", () => {
  it("surfaces fetch / upsert / delete / push-missing errors instead of swallowing them", async () => {
    fromMock.mockReturnValue(thenable({ data: null, error: PGRST205 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fetched = await fetchRemoteManualOffs();
    expect(fetched.store).toBeNull();
    expect(fetched.error).toMatch(/Load-Tracker-manual-call-offs\.sql/);

    const upserted = await upsertRemoteManualOff("2026-09-11", {
      name: "Glen Barker",
      kind: "late-early",
    });
    expect(upserted.ok).toBe(false);

    const deleted = await deleteRemoteManualOff("2026-09-11", "Glen Barker");
    expect(deleted.ok).toBe(false);

    const pushed = await pushMissingManualOffs(
      { "2026-09-11": [{ name: "Glen Barker", kind: "late-early" }] },
      {},
    );
    expect(pushed.ok).toBe(false);
    expect(warn.mock.calls.map((call) => call[0])).toEqual([
      "manual_call_offs fetch failed",
      "manual_call_offs upsert failed",
      "manual_call_offs delete failed",
      "manual_call_offs push-missing failed",
    ]);
  });

  it("returns an empty store when the table exists and has no rows", async () => {
    fromMock.mockReturnValue(thenable({ data: [], error: null }));
    await expect(fetchRemoteManualOffs()).resolves.toEqual({
      store: {},
      error: null,
    });
  });
});
