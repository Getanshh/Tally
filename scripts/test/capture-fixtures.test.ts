import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FIXTURES_DIR, loadFixtures, startMockTally, type MockTally } from "@tally-bridge/mock-tally";
import { DEFAULT_CONNECTION, TallyReadClient } from "@tally-bridge/tally-client";

const scriptsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Async on purpose: the mock runs in this process, so a sync spawn would deadlock it. */
function runCapture(args: string[]): Promise<{ status: number | null; out: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(
      process.execPath,
      [resolve(scriptsDir, "../node_modules/tsx/dist/cli.mjs"), "capture-fixtures.ts", ...args],
      { cwd: scriptsDir, env: { ...process.env, INIT_CWD: scriptsDir } },
    );
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", (status) => resolvePromise({ status, out }));
  });
}

let mocks: MockTally[] = [];
afterEach(async () => {
  await Promise.all(mocks.map((m) => m.close()));
  mocks = [];
});

describe("capture-fixtures script", () => {
  it("refuses a company name without TEST", async () => {
    const mock = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR] });
    mocks.push(mock);
    const r = await runCapture(["--company", "Ram & Shyam's Foods (Synthetic)", "--port", String(mock.port)]);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/does not look like a test company/);
    expect(mock.requests).toHaveLength(0);
  });

  it("captures in mock-tally format, and the capture replays through a fresh mock", async () => {
    const source = await startMockTally({ fixturesDirs: [DEFAULT_FIXTURES_DIR] });
    mocks.push(source);
    const out = mkdtempSync(join(tmpdir(), "capture-"));
    const r = await runCapture([
      "--company",
      "Charliee TEST (Synthetic)",
      "--port",
      String(source.port),
      "--out",
      out,
      "--only",
      "ledgers",
    ]);
    expect(r.status, r.out).toBe(0);
    expect(source.requests.every((q) => q.method === "GET" || q.key.tallyRequest === "Export")).toBe(true);

    const fixtures = loadFixtures([out]);
    expect(fixtures.map((f) => f.meta.name).sort()).toEqual(["banner", "companies", "ledgers"]);
    expect(fixtures.every((f) => f.meta.synthetic === false)).toBe(true);
    expect(readFileSync(join(out, "SUMMARY.md"), "utf8")).toContain("Charliee TEST (Synthetic)");

    const replay = await startMockTally({ fixturesDirs: [out] });
    mocks.push(replay);
    const health = await new TallyReadClient({
      ...DEFAULT_CONNECTION,
      port: replay.port,
      readRetries: 0,
    }).health();
    expect(health.activeCompany).toBe("Charliee TEST (Synthetic)");
    expect(health.companies).toHaveLength(2);
  }, 60_000);
});
