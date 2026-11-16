import { describe, expect, it } from "vitest";
import {
  formatPaise,
  formatScaledDecimal,
  fromTallyDate,
  parseScaledDecimal,
  parseTallyAmount,
  toTallyDate,
  TallyInputError,
} from "../src";

describe("dates", () => {
  it("converts ISO to Tally XML dates", () => {
    expect(toTallyDate("2026-04-01")).toBe("20260401");
  });
  it("rejects malformed and impossible dates", () => {
    expect(() => toTallyDate("01-04-2026")).toThrow(TallyInputError);
    expect(() => toTallyDate("2026-02-30")).toThrow(TallyInputError);
    expect(() => toTallyDate("2026-13-01")).toThrow(TallyInputError);
  });
  it("accepts 29 Feb only in leap years", () => {
    expect(toTallyDate("2028-02-29")).toBe("20280229");
    expect(() => toTallyDate("2027-02-29")).toThrow(TallyInputError);
  });
  it("parses Tally XML and display dates", () => {
    expect(fromTallyDate("20270331")).toBe("2027-03-31");
    expect(fromTallyDate("1-Apr-2026")).toBe("2026-04-01");
    expect(fromTallyDate("01-apr-26")).toBe("2026-04-01");
    expect(() => fromTallyDate("31-Feb-2026")).toThrow(TallyInputError);
    expect(() => fromTallyDate("garbage")).toThrow(TallyInputError);
  });
});

describe("scaled decimals (no floating point)", () => {
  it("parses amounts to paise exactly", () => {
    expect(parseScaledDecimal("1234.5", 2)).toBe(123450);
    expect(parseScaledDecimal("1,23,456.78", 2)).toBe(12345678); // Indian grouping
    expect(parseScaledDecimal("₹ 10", 2)).toBe(1000);
    expect(parseScaledDecimal("-0.01", 2)).toBe(-1);
    expect(parseScaledDecimal(".5", 2)).toBe(50);
    expect(parseScaledDecimal("0.10", 2)).toBe(10);
    expect(parseScaledDecimal("-0", 2)).toBe(0);
  });
  it("classic float traps are exact", () => {
    expect(parseScaledDecimal("0.1", 2) + parseScaledDecimal("0.2", 2)).toBe(parseScaledDecimal("0.3", 2));
  });
  it("allows trailing zeros beyond scale but rejects real extra precision", () => {
    expect(parseScaledDecimal("1.2300", 2)).toBe(123);
    expect(() => parseScaledDecimal("1.234", 2)).toThrow(TallyInputError);
  });
  it("rejects non-numbers", () => {
    for (const bad of ["", "abc", "1.2.3", "--1", "."])
      expect(() => parseScaledDecimal(bad, 2)).toThrow(TallyInputError);
  });
  it("formats back", () => {
    expect(formatScaledDecimal(123450, 2)).toBe("1234.50");
    expect(formatScaledDecimal(-5, 2)).toBe("-0.05");
    expect(formatScaledDecimal(7, 0)).toBe("7");
    expect(formatPaise(100)).toBe("1.00");
  });
});

describe("parseTallyAmount (Dr negative / Cr positive — VERIFY-ON-TALLY)", () => {
  it("keeps the sign of plain numbers", () => {
    expect(parseTallyAmount("-1180.00")).toBe(-118000);
    expect(parseTallyAmount("1180.00")).toBe(118000);
    expect(parseTallyAmount("")).toBe(0);
  });
  it("maps Dr/Cr suffixes onto the XML sign convention", () => {
    expect(parseTallyAmount("1,180.00 Dr")).toBe(-118000);
    expect(parseTallyAmount("1,180.00 Cr")).toBe(118000);
    expect(parseTallyAmount("-1,180.00 Cr")).toBe(118000);
  });
});
