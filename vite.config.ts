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

const ROSTER_FULL_TABS = [
  { slug: "burnham", tab: "Burnham" },
  { slug: "rockford", tab: "Rockford" },
  { slug: "pontiac", tab: "Pontiac" },
  { slug: "arc", tab: "ARC Drivers" },
  { slug: "zion", tab: "Zion" },
] as const;

const ROSTER_SAT_GRIDS = [
  { slug: "burnham", tab: "Sat-Burnham" },
  { slug: "rockford", tab: "Sat-Rockford" },
  { slug: "pontiac", tab: "Sat-Pontiac" },
  { slug: "arc", tab: "Sat-Arc" },
  { slug: "zion", tab: "Sat-Zion" },
] as const;

function gviz(sheetId: string, query: string): string {
  return `/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&${query}`;
}

/** One-time Driver import only. No L13, Sat-sum, OOT-grid, or call-off proxies. */
const sheetProxy: Record<string, { target: string; changeOrigin: boolean; rewrite: () => string }> = {};

for (const yard of ROSTER_FULL_TABS) {
  sheetProxy[`/sheets/roster-full/${yard.slug}`] = {
    target: "https://docs.google.com",
    changeOrigin: true,
    rewrite: () =>
      gviz(ROSTER_ID, `sheet=${encodeURIComponent(yard.tab)}&range=A%3AZ`),
  };
}

for (const yard of ROSTER_SAT_GRIDS) {
  sheetProxy[`/sheets/roster-sat/${yard.slug}`] = {
    target: "https://docs.google.com",
    changeOrigin: true,
    rewrite: () =>
      gviz(ROSTER_ID, `sheet=${encodeURIComponent(yard.tab)}&range=A%3AZ`),
  };
}

const GONE_SHEET_ID = "1azaww09ttC1p571RzB_NDkeBqAFkRBhpTboODpk4z40";
sheetProxy["/sheets/roster-gone"] = {
  target: "https://docs.google.com",
  changeOrigin: true,
  rewrite: () => gviz(GONE_SHEET_ID, "gid=544546254"),
};

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
