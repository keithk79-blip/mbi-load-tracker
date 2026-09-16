/** Fetch the Dispatch Board Loads footer. Shared by Pages Function, Vite, tests.
 * No Tauri / React imports — Cloudflare Pages must not pull those into the worker.
 */

import {
  dispatchBoardLoadsCsvUrl,
  parseDispatchBoardLoadsCsv,
  type DispatchBoardTotals,
} from "./dispatchBoard.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LoadTracker/1.0";

export function jsonDispatchBoardResponse(data: DispatchBoardTotals): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function jsonDispatchBoardError(message: string, status = 502): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function fetchDispatchBoardCsvViaHttp(id: string): Promise<string> {
  const res = await fetch(dispatchBoardLoadsCsvUrl(id), {
    method: "GET",
    headers: { Accept: "text/csv,text/plain;q=0.9", "User-Agent": UA },
    redirect: "follow",
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Dispatch Board HTTP ${res.status}`);
  }
  if (!body.trim() || body.trimStart().startsWith("<")) {
    throw new Error("Dispatch Board is not readable as CSV. Share it Viewer-with-link.");
  }
  return body;
}

export async function fetchDispatchBoardTotalsViaHttp(
  id: string,
): Promise<DispatchBoardTotals> {
  return parseDispatchBoardLoadsCsv(await fetchDispatchBoardCsvViaHttp(id));
}
