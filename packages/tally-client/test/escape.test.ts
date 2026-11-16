import { describe, expect, it } from "vitest";
import { escapeXml, TallyInputError } from "../src";

describe("escapeXml", () => {
  it("escapes all five XML special characters", () => {
    expect(escapeXml(`Shree Ram's Traders & Co. <Surat> "A"`)).toBe(
      "Shree Ram&apos;s Traders &amp; Co. &lt;Surat&gt; &quot;A&quot;",
    );
  });
  it("does not double-escape when called once on already-literal entities", () => {
    expect(escapeXml("&amp;")).toBe("&amp;amp;");
  });
  it("keeps tabs, newlines and non-ASCII (Gujarati, ₹) intact", () => {
    expect(escapeXml("ચાર્લી\t₹ 10\nline")).toBe("ચાર્લી\t₹ 10\nline");
  });
  it("rejects control characters instead of silently altering the value", () => {
    expect(() => escapeXml("Bad\u0004Name")).toThrow(TallyInputError);
  });
});
