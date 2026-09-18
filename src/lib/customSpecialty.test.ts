import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  CUSTOM_SPECIALTY_DEFAULT_NAMES,
  CUSTOM_SPECIALTY_IDS,
  customSpecialtyDisplayName,
  formatCustomSpecialtyChip,
  parseCustomSpecialtyChip,
  readCustomSpecialtyNameField,
  writeCustomSpecialtyName,
} from "./customSpecialty";
import {
  isSpecialtyStationId,
  resolveSpecialtyBoardMatch,
  resolveSpecialtyStationId,
  specialtyDestinationsFor,
  specialtyDestHint,
} from "./specialtyBoard";

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

afterEach(() => {
  memory.clear();
});

describe("custom odd-ball specialty cards", () => {
  it("adds four typed-name cards at the end of the board", () => {
    expect(CUSTOM_SPECIALTY_IDS).toEqual([
      "custom-1",
      "custom-2",
      "custom-3",
      "custom-4",
    ]);
    for (const id of CUSTOM_SPECIALTY_IDS) {
      expect(isSpecialtyStationId(id)).toBe(true);
      expect(specialtyDestinationsFor(id)).toEqual([]);
      expect(specialtyDestHint(id)).toMatch(/Leachate/);
    }
  });

  it("stores load type and a typed destination on one chip", () => {
    expect(formatCustomSpecialtyChip("Leachate", "Kankakee")).toBe("Leachate · Kankakee");
    expect(parseCustomSpecialtyChip("Walking-floor · Acme LF")).toEqual({
      loadType: "Walking-floor",
      destination: "Acme LF",
    });
  });

  it("matches a custom pickup name when logging the dest", () => {
    expect(resolveSpecialtyStationId("custom-1", "Odd-ball 1")).toBe("custom-1");
    expect(
      resolveSpecialtyBoardMatch(
        "custom",
        "Odd-ball 1",
        "Kankakee",
        "Leachate (tanker)",
      ),
    ).toMatchObject({
      specialtyId: "custom-1",
    });
  });

  it("lets the dispatcher clear the Odd-ball example without it snapping back", () => {
    writeCustomSpecialtyName("custom-1", "");
    expect(readCustomSpecialtyNameField("custom-1")).toBe("");
    expect(customSpecialtyDisplayName("custom-1")).toBe(
      CUSTOM_SPECIALTY_DEFAULT_NAMES["custom-1"],
    );

    writeCustomSpecialtyName("custom-1", "Zion transfer");
    expect(readCustomSpecialtyNameField("custom-1")).toBe("Zion transfer");
    expect(customSpecialtyDisplayName("custom-1")).toBe("Zion transfer");
  });

  it("keeps odd-ball name fields and Add open usable in the narrow specialty grid", () => {
    const src = readFileSync(
      new URL("../components/SpecialtyBoardCard.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toContain("specialty-name-input");
    expect(src).toContain("specialty-extra-list");
    expect(src).toContain("is-custom");
    expect(src).toContain("is-picking");
    expect(src).toContain("specialty-add-open");
    expect(src).toContain('type="submit"');
    expect(src).not.toContain("disabled={!dest.trim()}");
    const css = readFileSync(new URL("../components/specialty-board.css", import.meta.url), "utf8");
    expect(css).toContain(".specialty-name-input");
    expect(css).toContain("minmax(280px, 1fr)");
    expect(css).toContain(".specialty-type-chip");
    const indexCss = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    expect(indexCss).toContain(".specialty-extra-list");
    expect(indexCss).toContain("minmax(280px, 1fr)");
  });
});
