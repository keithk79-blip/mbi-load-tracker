import { describe, expect, it } from "vitest";
import { payTierFromHireDate, payTierLabel } from "./driverPay";

describe("payTierFromHireDate", () => {
  it("is Tier 1 before the first anniversary", () => {
    expect(payTierFromHireDate("2026-03-01", "2026-09-16")).toBe(1);
    expect(payTierFromHireDate("2025-09-17", "2026-09-16")).toBe(1);
  });

  it("moves up on the anniversary date itself", () => {
    expect(payTierFromHireDate("2025-09-16", "2026-09-16")).toBe(2);
    expect(payTierFromHireDate("2024-09-16", "2026-09-16")).toBe(3);
    expect(payTierFromHireDate("2023-09-16", "2026-09-16")).toBe(4);
    expect(payTierFromHireDate("2022-09-16", "2026-09-16")).toBe(5);
  });

  it("caps at Tier 5 from the 4th anniversary (5th year)", () => {
    expect(payTierFromHireDate("2000-03-20", "2026-09-16")).toBe(5);
    expect(payTierLabel(5)).toBe("Tier 5");
  });

  it("is null without a hire date", () => {
    expect(payTierFromHireDate(null, "2026-09-16")).toBeNull();
    expect(payTierFromHireDate("", "2026-09-16")).toBeNull();
  });
});
