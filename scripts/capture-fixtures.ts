/**
 * Record real Tally XML responses from the TEST company so the mock server and tests can
 * replay them. READ-ONLY: every request goes through TallyReadClient, which refuses to send
 * anything other than an Export envelope.
 *
 * Run ON THE TALLY SERVER (or a LAN PC that can reach port 9000), with the TEST company open:
 *
 *   pnpm capture-fixtures --company "Charliee TEST" --from 2026-10-01 --to 2026-10-31
 *
 * Options:
 *   --company   exact Tally company name (required). Must contain "TEST" unless
 *               --i-confirm-this-is-a-test-copy is also passed.
 *   --from/--to date range for vouchers & reports (default: the last 31 days)
 *   --host/--port  Tally address (default: TALLY_HOST/TALLY_PORT env or 127.0.0.1:9000)
 *   --timeout   per-request timeout in ms (default 120000 — some reports are slow)
 *   --out       output directory (default ./captured-fixtures/<timestamp>)
 *   --only      comma-separated subset of capture names (see list printed at start)
 *
 * Output is in mock-tally fixture format. It is .gitignored on purpose: review it for
 * anything you don't want in the repo before copying it into apps/mock-tally/fixtures/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  REPORTS,
  TallyReadClient,
  TallyResponseError,
  buildExportEnvelope,
  connectionConfigFromEnv,
  type ExportRequest,
  requestCatalog,
  toTallyDate,
} from "@tally-bridge/tally-client";

// pnpm may forward a literal "--" separator; drop it.
const argv = process.argv.slice(2).filter((a, i) => !(i === 0 && a === "--"));
const { values } = parseArgs({
  args: argv,
  options: {
    company: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    host: { type: "string" },
    port: { type: "string" },
    timeout: { type: "string", default: "120000" },
    out: { type: "string" },
    only: { type: "string" },
    "i-confirm-this-is-a-test-copy": { type: "boolean", default: false },
  },
});

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const company = values.company?.trim();
if (!company) fail('--company "<exact TEST company name>" is required.');
if (!/test/i.test(company) && !values["i-confirm-this-is-a-test-copy"]) {
  fail(
    `"${company}" does not look like a test company (no "TEST" in the name).\n` +
      "  Fixtures must be captured from a TEST COPY of the company, never the live one.\n" +
      "  If this really is a test copy, re-run with --i-confirm-this-is-a-test-copy.",
  );
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const to = values.to ?? isoDay(new Date());
const from = values.from ?? isoDay(new Date(Date.now() - 31 * 86_400_000));
toTallyDate(from);
toTallyDate(to);

const baseCwd = process.env.INIT_CWD ?? process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(baseCwd, values.out ?? join("captured-fixtures", stamp));

const env = connectionConfigFromEnv();
const config = {
  ...env,
  host: values.host ?? env.host,
  port: values.port ? Number(values.port) : env.port,
  timeoutMs: Number(values.timeout),
  readRetries: 0,
};
const client = new TallyReadClient(config);

interface Capture {
  name: string;
  request: ExportRequest;
  notes: string;
}

const reportCaptures: Capture[] = Object.entries(REPORTS).map(([key, report]) => {
  const pointInTime = key === "BALANCE_SHEET" || key === "STOCK_SUMMARY" || key.startsWith("BILLS_");
  return {
    name: `report-${key.toLowerCase().replace(/_/g, "-")}`,
    request: pointInTime
      ? requestCatalog.report(company, report, undefined, to)
      : requestCatalog.report(company, report, from, to),
    notes: `Built-in report "${report}" (TYPE=Data). VERIFY-ON-TALLY: report ID and output shape.`,
  };
});

const captures: Capture[] = [
  {
    name: "company-details",
    request: requestCatalog.companyDetails(company),
    notes: "State, GSTIN, feature flags (batches, godowns, price levels), lock date.",
  },
  {
    name: "ledgers",
    request: requestCatalog.ledgers(company),
    notes: "All ledgers with group, GSTIN, state, price level.",
  },
  {
    name: "groups",
    request: requestCatalog.groups(company),
    notes: "Account groups (to resolve Sundry Debtors/Creditors sub-groups).",
  },
  {
    name: "stock-items",
    request: requestCatalog.stockItems(company),
    notes: "Items with units, HSN/GST details, standard rates, price lists, batch flags.",
  },
  {
    name: "stock-groups",
    request: requestCatalog.stockGroups(company),
    notes: "Stock groups (GST/HSN may be set at group level).",
  },
  { name: "units", request: requestCatalog.units(company), notes: "Simple and compound units." },
  { name: "godowns", request: requestCatalog.godowns(company), notes: "Godowns/locations." },
  {
    name: "voucher-types",
    request: requestCatalog.voucherTypes(company),
    notes: "Our exact voucher type names and their parents.",
  },
  {
    name: "vouchers",
    request: requestCatalog.vouchers(company, from, to),
    notes: `All vouchers ${from}..${to}: sign conventions, optional flag, GST lines, batch allocations.`,
  },
  ...reportCaptures,
];

const only = values.only
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const selected = only ? captures.filter((c) => only.includes(c.name)) : captures;
if (only && selected.length !== only.length) {
  fail(`Unknown --only names. Available: ${captures.map((c) => c.name).join(", ")}`);
}

function writeFixture(name: string, meta: Record<string, unknown>, response: string, request?: string): void {
  writeFileSync(join(outDir, `${name}.meta.json`), JSON.stringify(meta, null, 2) + "\n", "utf8");
  writeFileSync(join(outDir, `${name}.response.xml`), response, "utf8");
  if (request !== undefined) writeFileSync(join(outDir, `${name}.request.xml`), request, "utf8");
}

console.log(`Tally:   ${client.url}`);
console.log(`Company: ${company}`);
console.log(`Range:   ${from} .. ${to}`);
console.log(`Output:  ${outDir}\n`);

// 1. Health: banner + loaded companies. Refuse to continue if the company isn't loaded.
const health = await client.health();
if (!health.reachable) fail(health.error ?? "Tally is not reachable.");
const loaded = health.companies.map((c) => c.name);
if (!loaded.includes(company)) {
  fail(
    `Company "${company}" is not loaded in Tally. Loaded companies: ${loaded.join(", ") || "(none)"}.\n  Names must match exactly.`,
  );
}
mkdirSync(outDir, { recursive: true });

const capturedAt = new Date().toISOString();
const banner = await client.serverBanner();
writeFixture(
  "banner",
  {
    name: "banner",
    method: "GET",
    encoding: banner.encoding === "utf-16le" ? "utf-16le" : "utf-8",
    synthetic: false,
    capturedAt,
    tallyBanner: health.serverBanner,
  },
  banner.text,
);

const summary: string[] = [
  `# Capture summary`,
  ``,
  `- Captured at: ${capturedAt}`,
  `- Tally: ${health.serverBanner ?? "?"} (version: ${health.version ?? "not exposed"})`,
  `- Company: ${company}`,
  `- Range: ${from} .. ${to}`,
  ``,
  `| Fixture | Result | Encoding | Bytes | ms |`,
  `|---|---|---|---|---|`,
];

// The companies collection uses health()'s own request so it replays exactly.
const allCaptures: Capture[] = [
  { name: "companies", request: requestCatalog.loadedCompanies(), notes: "Loaded companies (health check)." },
  ...selected,
];

for (const cap of allCaptures) {
  process.stdout.write(`• ${cap.name.padEnd(28)} `);
  let xml: string;
  try {
    xml = buildExportEnvelope(cap.request);
  } catch (err) {
    console.log(`SKIPPED (${String(err)})`);
    continue;
  }
  const vars = cap.request.staticVariables ?? {};
  const match = {
    tallyRequest: "Export",
    type: cap.request.type,
    id: cap.request.id,
    ...(cap.request.company ? { company: cap.request.company } : {}),
    ...(vars.SVFROMDATE ? { fromDate: vars.SVFROMDATE } : {}),
    ...(vars.SVTODATE ? { toDate: vars.SVTODATE } : {}),
  };
  const started = Date.now();
  try {
    const res = await client.exportRaw(xml);
    const ms = Date.now() - started;
    writeFixture(
      cap.name,
      {
        name: cap.name,
        match,
        encoding: res.encoding === "utf-16le" ? "utf-16le" : "utf-8",
        synthetic: false,
        capturedAt,
        tallyBanner: health.serverBanner,
        notes: cap.notes,
      },
      res.raw,
      xml,
    );
    console.log(`ok   ${res.raw.length} chars, ${ms} ms`);
    summary.push(`| ${cap.name} | ok | ${res.encoding} | ${res.raw.length} | ${ms} |`);
  } catch (err) {
    const ms = Date.now() - started;
    if (err instanceof TallyResponseError) {
      // Tally answered with an error: keep it — error fixtures are valuable too.
      writeFixture(
        cap.name,
        {
          name: cap.name,
          match,
          synthetic: false,
          capturedAt,
          tallyBanner: health.serverBanner,
          notes: `TALLY ERROR: ${err.message}. ${cap.notes}`,
        },
        err.rawResponse,
        xml,
      );
      console.log(`TALLY ERROR (saved): ${err.message}`);
      summary.push(`| ${cap.name} | Tally error: ${err.message.replace(/\|/g, "/")} | | | ${ms} |`);
    } else {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
      summary.push(
        `| ${cap.name} | FAILED: ${(err instanceof Error ? err.message : String(err)).replace(/\|/g, "/")} | | | ${ms} |`,
      );
    }
  }
}

summary.push(
  ``,
  `## Before sharing`,
  `These files contain data from the test company (party names, GSTINs, amounts).`,
  `Review them before committing or sending. Nothing in this folder was written to Tally.`,
);
writeFileSync(join(outDir, "SUMMARY.md"), summary.join("\n") + "\n", "utf8");
console.log(`\nDone. See ${join(outDir, "SUMMARY.md")}`);
