import { z } from "zod";
import { IMPORT_RESULT_TAGS } from "./names";
import { TallyBadResponseError, TallyResponseError } from "./errors";
import { findAll, findFirst, isNode, parseTallyXml, textOf, type XmlNode } from "./xml/parse";

/**
 * Parse an EXPORT response and throw a readable error if Tally answered with an error
 * instead of data. Known error shapes (VERIFY-ON-TALLY, add more as fixtures reveal them):
 *   <RESPONSE>Unknown Request, cannot be processed</RESPONSE>
 *   <ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>0</STATUS></HEADER><BODY><DATA>msg</DATA></BODY></ENVELOPE>
 *   ...<LINEERROR>msg</LINEERROR>...
 */
export function parseExportResponse(xml: string): XmlNode {
  if (xml.trim() === "") throw new TallyBadResponseError("empty response", xml);
  const root = parseTallyXml(xml);

  const lineErrors = findAll(root, IMPORT_RESULT_TAGS.LINE_ERROR)
    .map((e) => textOf(e))
    .filter((t): t is string => !!t);
  if (lineErrors.length) throw new TallyResponseError(lineErrors.join("; "), xml);

  const response = root["RESPONSE"];
  if (response !== undefined) {
    const text = textOf(response);
    if (text !== undefined) throw new TallyResponseError(text || "empty RESPONSE element", xml);
  }

  const envelope = root["ENVELOPE"];
  if (isNode(envelope)) {
    const header = envelope["HEADER"];
    const status = isNode(header) ? textOf(header["STATUS"]) : undefined;
    if (status !== undefined && status.trim() !== "1") {
      const body = envelope["BODY"];
      const data = isNode(body) ? body["DATA"] : undefined;
      const msg = textOf(data) ?? textOf(body) ?? `STATUS=${status}`;
      throw new TallyResponseError(msg || `STATUS=${status}`, xml);
    }
  }
  return root;
}

/* ------------------------------------------------------------ import result */

export const ImportResultSchema = z.object({
  created: z.number().int().nonnegative(),
  altered: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  combined: z.number().int().nonnegative(),
  ignored: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  exceptions: z.number().int().nonnegative(),
  lastVoucherId: z.string().nullable(),
  lastMasterId: z.string().nullable(),
  lineErrors: z.array(z.string()),
  /** True only if Tally reported no errors, no exceptions and no line errors. */
  ok: z.boolean(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

/**
 * Parse Tally's response to an IMPORT request into a typed result. Parsing only: this
 * package never sends imports (see CLAUDE.md, rule 1). Handles both the TallyPrime
 * <ENVELOPE>…<IMPORTRESULT> shape and the legacy <RESPONSE><CREATED>… shape.
 * VERIFY-ON-TALLY: shape returned by our TallyPrime release.
 */
export function parseImportResult(xml: string): ImportResult {
  const root = parseTallyXml(xml);
  const container = findFirst(root, "IMPORTRESULT") ?? root["RESPONSE"] ?? root["ENVELOPE"];
  if (typeof container === "string") {
    // e.g. <RESPONSE>Unknown Request, cannot be processed</RESPONSE>
    throw new TallyResponseError(container || "empty RESPONSE element", xml);
  }
  if (!isNode(container)) {
    throw new TallyBadResponseError("no IMPORTRESULT or RESPONSE element in import response", xml);
  }
  const num = (tag: string): number => {
    const t = textOf(findFirst(container, tag));
    if (t === undefined || t.trim() === "") return 0;
    const n = Number(t.trim());
    if (!Number.isInteger(n) || n < 0) {
      throw new TallyBadResponseError(`<${tag}> is not a non-negative integer: "${t}"`, xml);
    }
    return n;
  };
  const str = (tag: string): string | null => {
    const t = textOf(findFirst(container, tag))?.trim();
    return t ? t : null;
  };
  const lineErrors = findAll(root, IMPORT_RESULT_TAGS.LINE_ERROR)
    .map((e) => textOf(e)?.trim())
    .filter((t): t is string => !!t);

  const hasAnyCounter = Object.values(IMPORT_RESULT_TAGS).some(
    (tag) => tag !== IMPORT_RESULT_TAGS.LINE_ERROR && findFirst(container, tag) !== undefined,
  );
  if (!hasAnyCounter && lineErrors.length === 0) {
    const text = textOf(container) ?? textOf(root["RESPONSE"]);
    throw new TallyResponseError(text || "import response contained no result counters", xml);
  }

  const result = {
    created: num(IMPORT_RESULT_TAGS.CREATED),
    altered: num(IMPORT_RESULT_TAGS.ALTERED),
    deleted: num(IMPORT_RESULT_TAGS.DELETED),
    combined: num(IMPORT_RESULT_TAGS.COMBINED),
    ignored: num(IMPORT_RESULT_TAGS.IGNORED),
    errors: num(IMPORT_RESULT_TAGS.ERRORS),
    cancelled: num(IMPORT_RESULT_TAGS.CANCELLED),
    exceptions: num(IMPORT_RESULT_TAGS.EXCEPTIONS),
    lastVoucherId: str(IMPORT_RESULT_TAGS.LAST_VOUCHER_ID),
    lastMasterId: str(IMPORT_RESULT_TAGS.LAST_MASTER_ID),
    lineErrors,
    ok: false,
  };
  result.ok = result.errors === 0 && result.exceptions === 0 && lineErrors.length === 0;
  return ImportResultSchema.parse(result);
}
