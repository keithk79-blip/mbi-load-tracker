import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SKIP_DIRS = new Set(["node_modules", "target", "gen", "dist"]);
const SCAN_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".rs",
  ".json",
  ".md",
  ".sql",
  ".html",
  ".css",
]);

function walk(dir: string, files: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      walk(path, files);
      continue;
    }
    if (name.includes(".test.")) continue;
    if (SCAN_EXT.has(extname(name))) files.push(path);
  }
}

describe("no Google Sheets in the app", () => {
  it("does not contain docs.google.com or spreadsheets.google.com", () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const files: string[] = [];
    walk(join(root, "src"), files);
    walk(join(root, "functions"), files);
    walk(join(root, "src-tauri"), files);
    walk(join(root, "supabase"), files);
    files.push(join(root, "vite.config.ts"));
    files.push(join(root, "README.md"));
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (/docs\.google\.com|spreadsheets\.google\.com|1mdNWIsz7LZauHCccQBB7QzjR-Wo9pukGn8HrmODnPpw|1azaww09ttC1p571RzB_NDkeBqAFkRBhpTboODpk4z40/i.test(text)) {
        hits.push(file.replace(root, ""));
      }
    }
    expect(hits).toEqual([]);
  });

  it("Today totals form has no Dispatch Board pull", () => {
    const src = readFileSync(
      new URL("../components/SheetTotalsForm.tsx", import.meta.url),
      "utf8",
    );
    expect(src).not.toContain("Pull Dispatch Board");
    expect(src).not.toContain("docs.google.com");
    expect(src).not.toContain("fetchDispatchBoardTotals");
    expect(src).toContain("Enter day totals");
    expect(src).toContain('source: "manual"');
  });
});
