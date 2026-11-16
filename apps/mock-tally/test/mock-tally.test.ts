import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_FIXTURES_DIR,
  extractRequestKey,
  loadFixtures,
  matchFixture,
  startMockTally,
  type MockTally,
} from "../src";
import { buildExportEnvelope, decodeTallyResponse, requestCatalog } from "@tally-bridge/tally-client";

let mock: MockTally | undefined;
afterEach(async () => {
  await mock?.close();
  mock = undefined;
});

describe("fixture loading & matching", () => {
  it("loads the synthetic fixtures and flags them as synthetic", () => {
    const fixtures = loadFixtures([DEFAULT_FIXTURES_DIR]);
    expect(fixtures.map((f) => f.meta.name).sort()).toEqual(["banner", "companies"]);
    expect(fixtures.every((f) => f.meta.synthetic)).toBe(true);
  });

  it("extracts the request key from an envelope", () => {
    const xml = buildExportEnvelope(
      requestCatalog.report("Ram & Co", "Day Book", "2026-04-01", "2026-04-30"),
    );
    expect(extractRequestKey(xml)).toEqual({
      tallyRequest: "Export",
      type: "Data",
      id: "Day Book",
      company: "Ram & Co",
      fromDate: "20260401",
      toDate: "20260430",
    });
  });

  it("prefers the most specific matching fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "fx-"));
    const write = (name: string, match: object): void => {
      writeFileSync(join(dir, `${name}.meta.json`), JSON.stringify({ name, match, synthetic: true }));
      writeFileSync(join(dir, `${name}.response.xml`), `<R>${name}</R>`);
    };
    write("generic", { id: "Day Book" });
    write("specific", { id: "Day Book", company: "A", fromDate: "20260401" });
    const fixtures = loadFixtures([dir]);
    expect(matchFixture(fixtures, { id: "Day Book", company: "A", fromDate: "20260401" })?.meta.name).toBe(
      "specific",
    );
    expect(matchFixture(fixtures, { id: "Day Book", company: "B" })?.meta.name).toBe("generic");
    expect(matchFixture(fixtures, { id: "Trial Balance" })).toBeUndefined();
  });

  it("rejects invalid fixture metadata loudly", () => {
    const dir = mkdtempSync(join(tmpdir(), "fx-"));
    writeFileSync(join(dir, "bad.meta.json"), JSON.stringify({ name: "bad" }));
    writeFileSync(join(dir, "bad.response.xml"), "<R/>");
    expect(() => loadFixtures([dir])).toThrow(/Invalid fixture metadata/);
  });
});

describe("mock HTTP server", () => {
  it("serves the banner on GET", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR] });
    const res = await fetch(mock.url);
    expect(await res.text()).toContain("TallyPrime Server is Running");
  });

  it("replays in UTF-16LE when forced", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR], forceEncoding: "utf-16le" });
    const res = await fetch(mock.url, {
      method: "POST",
      body: buildExportEnvelope(requestCatalog.loadedCompanies()),
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xfe]);
    expect(decodeTallyResponse(bytes).text).toContain("Charliee TEST (Synthetic)");
  });

  it("answers unmatched requests with a Tally-style STATUS 0 error", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR] });
    const res = await fetch(mock.url, {
      method: "POST",
      body: buildExportEnvelope(requestCatalog.ledgers("X")),
    });
    expect(res.headers.get("x-mock-tally-fixture")).toBe("unmatched");
    expect(await res.text()).toContain("<STATUS>0</STATUS>");
  });

  it("never simulates imports", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR] });
    const res = await fetch(mock.url, {
      method: "POST",
      body: "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST></HEADER></ENVELOPE>",
    });
    expect(await res.text()).toContain("not supported");
  });
});
