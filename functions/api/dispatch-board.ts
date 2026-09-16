/**
 * Cloudflare Pages Function — same-origin Dispatch Board Loads footer.
 * Browser cannot call docs.google.com (CORS). Desktop uses the Tauri command.
 */
import { extractSpreadsheetId, type DispatchBoardTotals } from "../../src/lib/dispatchBoard";
import {
  fetchDispatchBoardTotalsViaHttp,
  jsonDispatchBoardError,
  jsonDispatchBoardResponse,
} from "../../src/lib/dispatchBoardHttp";

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url);
  const id = extractSpreadsheetId(url.searchParams.get("id") ?? "");
  if (!id) return jsonDispatchBoardError("Missing Dispatch Board spreadsheet id.", 400);
  try {
    const totals: DispatchBoardTotals = await fetchDispatchBoardTotalsViaHttp(id);
    return jsonDispatchBoardResponse(totals);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonDispatchBoardError(message);
  }
}
