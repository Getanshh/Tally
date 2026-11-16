import { isNode, parseTallyXml, textOf, type XmlNode } from "@tally-bridge/tally-client";
import type { Fixture } from "./fixtures";

export interface RequestKey {
  tallyRequest?: string;
  type?: string;
  id?: string;
  company?: string;
  fromDate?: string;
  toDate?: string;
}

/** Pull the matching fields out of a Tally request envelope. */
export function extractRequestKey(xml: string): RequestKey {
  let root: XmlNode;
  try {
    root = parseTallyXml(xml);
  } catch {
    return {};
  }
  const env = root["ENVELOPE"];
  const header = isNode(env) ? env["HEADER"] : undefined;
  const body = isNode(env) ? env["BODY"] : undefined;
  const desc = isNode(body) ? body["DESC"] : undefined;
  const vars = isNode(desc) ? desc["STATICVARIABLES"] : undefined;
  const h = (tag: string): string | undefined => (isNode(header) ? textOf(header[tag])?.trim() : undefined);
  const v = (tag: string): string | undefined => (isNode(vars) ? textOf(vars[tag])?.trim() : undefined);
  return {
    tallyRequest: h("TALLYREQUEST"),
    type: h("TYPE"),
    id: h("ID"),
    company: v("SVCURRENTCOMPANY"),
    fromDate: v("SVFROMDATE"),
    toDate: v("SVTODATE"),
  };
}

const CASE_INSENSITIVE: ReadonlySet<keyof RequestKey> = new Set(["tallyRequest", "type"]);

/**
 * Find the most specific POST fixture whose every `match` field equals the request.
 * Ties are broken by load order (first wins).
 */
export function matchFixture(fixtures: readonly Fixture[], key: RequestKey): Fixture | undefined {
  let best: Fixture | undefined;
  let bestScore = -1;
  for (const f of fixtures) {
    if (f.meta.method !== "POST") continue;
    let score = 0;
    let ok = true;
    for (const [field, expected] of Object.entries(f.meta.match) as [
      keyof RequestKey,
      string | undefined,
    ][]) {
      if (expected === undefined) continue;
      const actual = key[field];
      const eq = CASE_INSENSITIVE.has(field)
        ? actual?.toLowerCase() === expected.toLowerCase()
        : actual === expected;
      if (!eq) {
        ok = false;
        break;
      }
      score++;
    }
    if (ok && score > bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best;
}
