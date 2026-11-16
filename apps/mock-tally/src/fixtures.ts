import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * A fixture is three files sharing a base name:
 *   <name>.meta.json      — how to match the request + how to serve the response
 *   <name>.response.xml   — response body, stored as UTF-8 text for easy review/diffing
 *   <name>.request.xml    — (optional) the request that produced it, for reference
 *
 * The capture script (scripts/capture-fixtures.ts) writes exactly this format, so real
 * captures can be dropped into a fixtures directory and replayed unchanged.
 */
export const FixtureMetaSchema = z.object({
  name: z.string().min(1),
  method: z.enum(["GET", "POST"]).default("POST"),
  match: z
    .object({
      tallyRequest: z.string().optional(),
      type: z.string().optional(),
      id: z.string().optional(),
      company: z.string().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    })
    .default({}),
  /** Encoding Tally used on the wire when this was recorded; the mock replays it. */
  encoding: z.enum(["utf-8", "utf-16le"]).default("utf-8"),
  /** Prepend a BOM when replaying (UTF-16 only). */
  bom: z.boolean().default(true),
  httpStatus: z.number().int().default(200),
  /** true = hand-written from documentation, NOT captured from real Tally. */
  synthetic: z.boolean(),
  capturedAt: z.string().nullable().default(null),
  tallyBanner: z.string().nullable().default(null),
  notes: z.string().optional(),
});
export type FixtureMeta = z.infer<typeof FixtureMetaSchema>;

export interface Fixture {
  meta: FixtureMeta;
  response: string;
  dir: string;
}

export const DEFAULT_FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/synthetic");

export function loadFixtures(dirs: readonly string[]): Fixture[] {
  const out: Fixture[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new Error(`Fixtures directory not found: ${dir}`);
    }
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".meta.json")) continue;
      const base = file.slice(0, -".meta.json".length);
      const metaPath = join(dir, file);
      let meta: FixtureMeta;
      try {
        meta = FixtureMetaSchema.parse(JSON.parse(readFileSync(metaPath, "utf8")));
      } catch (err) {
        throw new Error(`Invalid fixture metadata in ${metaPath}: ${String(err)}`, { cause: err });
      }
      const responsePath = join(dir, `${base}.response.xml`);
      if (!existsSync(responsePath)) throw new Error(`Missing ${responsePath}`);
      out.push({ meta, response: readFileSync(responsePath, "utf8"), dir });
    }
  }
  return out;
}
