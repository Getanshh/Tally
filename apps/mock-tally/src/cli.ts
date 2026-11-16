/**
 * Run a mock Tally for local development:
 *   pnpm mock-tally                              # synthetic fixtures on 127.0.0.1:9000
 *   pnpm mock-tally --port 9100 --fixtures ./captured-fixtures/2026-11-20 --fixtures apps/mock-tally/fixtures/synthetic
 *   pnpm mock-tally --utf16                   # serve every response as UTF-16LE
 */
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { DEFAULT_FIXTURES_DIR } from "./fixtures";
import { startMockTally } from "./server";

// pnpm may forward a literal "--" separator; drop it.
const argv = process.argv.slice(2).filter((a, i) => !(i === 0 && a === "--"));
const { values } = parseArgs({
  args: argv,
  options: {
    port: { type: "string", default: "9000" },
    host: { type: "string", default: "127.0.0.1" },
    fixtures: { type: "string", multiple: true },
    utf16: { type: "boolean", default: false },
    latency: { type: "string", default: "0" },
  },
});

const dirs = values.fixtures?.length
  ? values.fixtures.map((d) => resolve(process.env.INIT_CWD ?? process.cwd(), d))
  : [DEFAULT_FIXTURES_DIR];
const mock = await startMockTally({
  fixturesDirs: dirs,
  host: values.host,
  port: Number(values.port),
  latencyMs: Number(values.latency),
  ...(values.utf16 ? { forceEncoding: "utf-16le" as const } : {}),
});
console.log(`Mock Tally listening on ${mock.url}`);
console.log(`Fixtures: ${dirs.join(", ")}`);
const shutdown = (): void => {
  void mock.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
