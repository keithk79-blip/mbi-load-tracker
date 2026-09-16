/** Browser / desktop client for the Dispatch Board Loads footer. */

import { isTauriRuntime } from "./layout";
import {
  DISPATCH_BOARD_PAGES_PATH,
  dispatchBoardLoadsCsvUrl,
  extractSpreadsheetId,
  parseDispatchBoardLoadsCsv,
  type DispatchBoardTotals,
} from "./dispatchBoard";

export async function fetchDispatchBoardTotals(
  rawUrl: string,
): Promise<DispatchBoardTotals> {
  const id = extractSpreadsheetId(rawUrl);
  if (!id) throw new Error("Paste the Dispatch Board Google Sheets link.");

  if (isTauriRuntime()) {
    const errors: string[] = [];
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const csv = await invoke<string>("fetch_dispatch_board_csv", { id });
      return parseDispatchBoardLoadsCsv(csv);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    try {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      const res = await tauriFetch(dispatchBoardLoadsCsvUrl(id), {
        method: "GET",
        headers: { Accept: "text/csv,text/plain;q=0.9" },
      });
      const csv = await res.text();
      if (!res.ok) throw new Error(`Dispatch Board HTTP ${res.status}`);
      return parseDispatchBoardLoadsCsv(csv);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      throw new Error(`Desktop could not read the board — ${errors.join(" | ")}`);
    }
  }

  const res = await fetch(`${DISPATCH_BOARD_PAGES_PATH}?id=${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const body = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const rec = parsed && typeof parsed === "object" ? (parsed as { error?: unknown }) : null;
    const error = typeof rec?.error === "string" ? rec.error : `HTTP ${res.status}`;
    throw new Error(error);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Dispatch Board proxy did not return totals.");
  }
  const rec = parsed as Partial<DispatchBoardTotals>;
  if (
    typeof rec.trash !== "number" ||
    typeof rec.leachate !== "number" ||
    typeof rec.walkingFloor !== "number" ||
    typeof rec.loads !== "number"
  ) {
    throw new Error("Dispatch Board proxy missed MSW / tank / walking-floor.");
  }
  return {
    date: typeof rec.date === "string" ? rec.date : null,
    trash: rec.trash,
    leachate: rec.leachate,
    walkingFloor: rec.walkingFloor,
    loads: rec.loads,
    subs: typeof rec.subs === "number" ? rec.subs : 0,
  };
}
