import { describe, expect, it } from "vitest";
import {
  isBrokerTruck,
  isNumericTruck,
  KNOWN_BROKER_CODES,
  sanitizeTruck,
} from "./truck";

describe("sanitizeTruck", () => {
  it("keeps numeric unit numbers", () => {
    expect(sanitizeTruck("418")).toBe("418");
    expect(sanitizeTruck(" 55 ")).toBe("55");
    expect(sanitizeTruck("207")).toBe("207");
  });

  it("accepts broker letter codes and uppercases them", () => {
    expect(sanitizeTruck("vz")).toBe("VZ");
    expect(sanitizeTruck("cgh")).toBe("CGH");
    expect(sanitizeTruck("G2")).toBe("G2");
    expect(sanitizeTruck("tj")).toBe("TJ");
  });

  it("strips punctuation but keeps letters and digits", () => {
    expect(sanitizeTruck("V-Z")).toBe("VZ");
    expect(sanitizeTruck("g 2")).toBe("G2");
  });

  it("caps length without dropping a numeric truck", () => {
    expect(sanitizeTruck("123456789")).toBe("123456");
    expect(sanitizeTruck("abcdefg")).toBe("ABCDEF");
  });
});

describe("isBrokerTruck / isNumericTruck", () => {
  it("treats pure numbers as trucks, not subs", () => {
    expect(isNumericTruck("418")).toBe(true);
    expect(isBrokerTruck("418")).toBe(false);
    expect(isBrokerTruck("55")).toBe(false);
  });

  it("counts known broker abbreviations as subs", () => {
    for (const code of KNOWN_BROKER_CODES) {
      expect(isBrokerTruck(code)).toBe(true);
      expect(isBrokerTruck(code.toLowerCase())).toBe(true);
    }
  });

  it("counts similar short letter codes that are not on the known list", () => {
    expect(isBrokerTruck("ABC")).toBe(true);
    expect(isBrokerTruck("x9")).toBe(true);
  });

  it("does not count empty or punctuation-only values", () => {
    expect(isBrokerTruck("")).toBe(false);
    expect(isBrokerTruck("   ")).toBe(false);
    expect(isBrokerTruck("--")).toBe(false);
  });
});
