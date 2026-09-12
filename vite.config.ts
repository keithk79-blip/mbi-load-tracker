import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  fetchSigalertFeedViaHttp,
  SIGALERT_PAGES_PATH,
} from "./src/lib/sigalertHttp.ts";

const host = process.env.TAURI_DEV_HOST;

const ROSTER_ID =
  process.env.VITE_ROSTER_SHEET_ID || "1mdNWIsz7LZauHCccQBB7QzjR-Wo9pukGn8HrmODnPpw";
const CALLOFF_ID =
  process.env.VITE_CALLOFF_SHEET_ID || "1FnKGIuWfKCPvcaSwchnIpQjdezHKWC5O23jECPcJzyM";

const SAT_CELLS = [
  { slug: "burnham", tab: "Sat-Burnham", range: "I4" },
  { slug: "rockford", tab: "Sat-Rockford", range: "I4" },
  { slug: "pontiac", tab: "Sat-Pontiac", range: "H3" },
  { slug: "arc", tab: "Sat-Arc", range: "H3" },
  { slug: "zion", tab: "Sat-Zion", range: "H3" },
] as const;

/** Footer holiday notes — gviz drops them if the range starts in the driver list. */
const SAT_BODY_SCANS = [
  { key: "upper", range: "A14:Z35" },
  { key: "lower", range: "A28:Z80" },
] as const;

const OOT_YARDS = [
  { slug: "burnham", tab: "Burnham", range: "A:I" },
  { slug: "rockford", tab: "Rockford", range: "A:F" },
  { slug: "pontiac", tab: "Pontiac", range: "A:C" },
  { slug: "arc", tab: "ARC Drivers", range: "A:C" },
  { slug: "zion", tab: "Zion", range: "A:C" },
] as const;

function gviz(sheetId: string, query: string): string {
  return `/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&${query}`;
}

// Longer /sheets/roster-grid path must be registered before /sheets/roster.
// Vite's proxy matches by prefix, so roster would otherwise steal roster-grid.
const sheetProxy: Record<string, { target: string; changeOrigin: boolean; rewrite: () => string }> = {
  "/sheets/roster-grid": {
    target: "https://docs.google.com",
    changeOrigin: true,
    rewrite: () => gviz(ROSTER_ID, "sheet=Burnham&range=A:I"),
  },
  "/sheets/roster": {
    target: "https://docs.google.com",
    changeOrigin: true,
    rewrite: () => gviz(ROSTER_ID, "sheet=Burnham&range=L13"),
  },
  "/sheets/offs": {
    target: "https://docs.google.com",
    changeOrigin: true,
    rewrite: () => gviz(CALLOFF_ID, "gid=0"),
  },
};

for (const scan of SAT_BODY_SCANS) {
  for (const cell of SAT_CELLS) {
    sheetProxy[`/sheets/sat-body/${scan.key}/${cell.slug}`] = {
      target: "https://docs.google.com",
      changeOrigin: true,
      rewrite: () =>
        gviz(
          ROSTER_ID,
          `sheet=${encodeURIComponent(cell.tab)}&range=${encodeURIComponent(scan.range)}`,
        ),
    };
  }
}

for (const cell of SAT_CELLS) {
  sheetProxy[`/sheets/sat/${cell.slug}`] = {
    target: "https://docs.google.com",
    changeOrigin: true,
    rewrite: () =>
      gviz(ROSTER_ID, `sheet=${encodeURIComponent(cell.tab)}&range=${cell.range}`),
  };
}

for (const yard of OOT_YARDS) {
  sheetProxy[`/sheets/oot/${yard.slug}`] = {
    target: "https://docs.google.com",
    changeOrigin: true,
    rewrite: () =>
      gviz(
        ROSTER_ID,
        `sheet=${encodeURIComponent(yard.tab)}&range=${encodeURIComponent(yard.range)}`,
      ),
  };
}

/** Local /api/sigalert — same Map.asp → ChicagoData.json path as the Pages Function. */
function sigalertDevApi(): Plugin {
  const handle = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== SIGALERT_PAGES_PATH && path !== `${SIGALERT_PAGES_PATH}/`) {
      next();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end("Method Not Allowed");
      return;
    }
    try {
      const feed = await fetchSigalertFeedViaHttp();
      const body = JSON.stringify(feed);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: message }));
    }
  };
  return {
    name: "sigalert-dev-api",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), sigalertDevApi()],
  clearScreen: false,
  server: {
    host: host || "0.0.0.0",
    port: 4521,
    strictPort: true,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 4522,
        }
      : undefined,
    proxy: sheetProxy,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4521,
    strictPort: true,
    proxy: sheetProxy,
  },
});
