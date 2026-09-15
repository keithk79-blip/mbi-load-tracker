import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  fetchSigalertFeedViaHttp,
  SIGALERT_PAGES_PATH,
} from "./src/lib/sigalertHttp.ts";

const host = process.env.TAURI_DEV_HOST;

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
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4521,
    strictPort: true,
  },
});
