import { describe, expect, it } from "vitest";
import * as api from "../src";

describe("public API surface (safety rule 1)", () => {
  it("does not expose the raw write-capable transport from the main entry point", () => {
    expect(Object.keys(api)).not.toContain("TallyTransport");
  });
  it("TallyReadClient has no import/post/write methods", () => {
    const methods = Object.getOwnPropertyNames(api.TallyReadClient.prototype);
    for (const m of methods) expect(m.toLowerCase()).not.toMatch(/import|post|write|create|alter|delete/);
  });
});
