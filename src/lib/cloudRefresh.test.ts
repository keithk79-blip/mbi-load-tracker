import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { attachCloudRefresh } from "./cloudRefresh";

type Handler = () => void;

function stubDom(visibility: "visible" | "hidden") {
  const listeners = new Map<string, Set<Handler>>();
  const add = (type: string, fn: Handler) => {
    const set = listeners.get(type) ?? new Set();
    set.add(fn);
    listeners.set(type, set);
  };
  const remove = (type: string, fn: Handler) => {
    listeners.get(type)?.delete(fn);
  };
  const emit = (type: string) => {
    listeners.get(type)?.forEach((fn) => fn());
  };
  const documentStub = {
    visibilityState: visibility,
    addEventListener: add,
    removeEventListener: remove,
  };
  const windowStub = {
    addEventListener: add,
    removeEventListener: remove,
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", windowStub);
  return {
    documentStub,
    emit,
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

describe("attachCloudRefresh", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("pulls on focus, online, tab visible, and the poll interval", () => {
    vi.useFakeTimers();
    const { emit } = stubDom("visible");
    const refresh = vi.fn();
    const stop = attachCloudRefresh(refresh, 1_000);

    emit("focus");
    emit("online");
    emit("visibilitychange");
    vi.advanceTimersByTime(1_000);

    expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(4);
    stop();
    const after = refresh.mock.calls.length;
    emit("focus");
    vi.advanceTimersByTime(1_000);
    expect(refresh.mock.calls.length).toBe(after);
  });

  it("does not poll while the tab is hidden", () => {
    vi.useFakeTimers();
    stubDom("hidden");
    const refresh = vi.fn();
    const stop = attachCloudRefresh(refresh, 1_000);
    vi.advanceTimersByTime(3_000);
    expect(refresh).not.toHaveBeenCalled();
    stop();
  });
});

describe("crew cloud refresh wiring", () => {
  it("adds call_off_log to supabase_realtime (postgres_changes was a no-op without it)", () => {
    const sql = readFileSync(new URL("../../Load-Tracker-call-off-log.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.call_off_log/);
  });

  it("roster, vacation, and call-off log poll/focus-refresh like loads", () => {
    const files = [
      "../store/DriverRosterContext.tsx",
      "../store/VacationContext.tsx",
      "../store/CallOffLogContext.tsx",
      "../store/DriverGoneContext.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src, file).toContain("attachCloudRefresh");
    }
  });
});
