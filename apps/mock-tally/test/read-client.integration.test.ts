/**
 * TallyReadClient against mock-tally over real HTTP.
 * Lives here (not in packages/tally-client) because mock-tally depends on tally-client.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { DEFAULT_FIXTURES_DIR, startMockTally, type MockTally } from "../src";
import {
  DEFAULT_CONNECTION,
  TallyReadClient,
  TallyResponseError,
  TallyTimeoutError,
  TallyUnreachableError,
  TallyWriteForbiddenError,
  requestCatalog,
  type TallyConnectionConfig,
} from "@tally-bridge/tally-client";

let mock: MockTally | undefined;
afterEach(async () => {
  await mock?.close();
  mock = undefined;
});

const configFor = (
  m: { port: number },
  over: Partial<TallyConnectionConfig> = {},
): TallyConnectionConfig => ({
  ...DEFAULT_CONNECTION,
  host: "127.0.0.1",
  port: m.port,
  readRetries: 0,
  ...over,
});

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

describe("TallyReadClient.health()", () => {
  it("reports reachability, product, companies, active company and version", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR] });
    const health = await new TallyReadClient(configFor(mock)).health();
    expect(health).toMatchObject({
      reachable: true,
      product: "TallyPrime",
      serverBanner: "TallyPrime Server is Running",
      activeCompany: "Charliee TEST (Synthetic)",
      version: "TallyPrime Synthetic",
      error: null,
      warnings: [],
    });
    expect(health.companies).toEqual([
      {
        name: "Charliee TEST (Synthetic)",
        guid: "a1b2c3d4-0000-4000-8000-000000000001",
        startingFrom: "2026-04-01",
        booksFrom: "2026-04-01",
        endingAt: "2027-03-31",
      },
      {
        name: "Ram & Shyam's Foods (Synthetic)",
        guid: "a1b2c3d4-0000-4000-8000-000000000002",
        startingFrom: "2025-04-01",
        booksFrom: "2025-04-01",
        endingAt: null,
      },
    ]);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("decodes UTF-16 responses identically", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR], forceEncoding: "utf-16le" });
    const health = await new TallyReadClient(configFor(mock)).health();
    expect(health.companies.map((c) => c.name)).toContain("Ram & Shyam's Foods (Synthetic)");
  });

  it("sends UTF-16 requests when configured and the mock still matches them", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR] });
    const health = await new TallyReadClient(configFor(mock, { requestEncoding: "utf-16le" })).health();
    expect(health.companies).toHaveLength(2);
  });

  it("says plainly when Tally is unreachable, without throwing", async () => {
    const port = await freePort();
    const health = await new TallyReadClient(configFor({ port })).health();
    expect(health.reachable).toBe(false);
    expect(health.error).toMatch(/Tally is not reachable at http:\/\/127\.0\.0\.1:\d+/);
  });
});

describe("TallyReadClient requests", () => {
  it("throws TallyUnreachableError after retries are exhausted", async () => {
    const port = await freePort();
    const client = new TallyReadClient(configFor({ port }, { readRetries: 1 }));
    await expect(client.listLoadedCompanies()).rejects.toBeInstanceOf(TallyUnreachableError);
  });

  it("times out slow responses", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR], latencyMs: 1500 });
    const client = new TallyReadClient(configFor(mock, { timeoutMs: 500 }));
    await expect(client.listLoadedCompanies()).rejects.toBeInstanceOf(TallyTimeoutError);
  });

  it("surfaces Tally error responses instead of swallowing them", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR] });
    const client = new TallyReadClient(configFor(mock));
    await expect(client.export(requestCatalog.ledgers("Charliee TEST (Synthetic)"))).rejects.toBeInstanceOf(
      TallyResponseError,
    );
  });

  it("serialises concurrent calls: Tally never sees more than one request at a time", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR], latencyMs: 30 });
    const client = new TallyReadClient(configFor(mock));
    await Promise.all(Array.from({ length: 6 }, () => client.listLoadedCompanies()));
    expect(mock.requests).toHaveLength(6);
    expect(mock.maxConcurrent).toBe(1);
  });

  it("refuses to send an import envelope and nothing reaches Tally", async () => {
    mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR] });
    const client = new TallyReadClient(configFor(mock));
    await expect(
      client.exportRaw(
        "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER></ENVELOPE>",
      ),
    ).rejects.toBeInstanceOf(TallyWriteForbiddenError);
    expect(mock.requests).toHaveLength(0);
  });
});
