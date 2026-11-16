import { ENVELOPE, STATIC_VARS } from "./names";
import { escapeXml } from "./xml/escape";
import { parseTallyXml, isNode, textOf } from "./xml/parse";
import { TallyWriteForbiddenError } from "./errors";

export type ExportType =
  typeof ENVELOPE.TYPE_COLLECTION | typeof ENVELOPE.TYPE_DATA | typeof ENVELOPE.TYPE_OBJECT;

export interface ExportRequest {
  type: ExportType;
  /** Collection name, report name or object identifier. */
  id: string;
  /**
   * Target company. Required for every company-scoped request so writes/reads can't be
   * redirected by someone switching the active company in Tally. Omit ONLY for
   * cross-company requests such as the list of loaded companies.
   */
  company?: string;
  /** Extra static variables, e.g. { SVFROMDATE: "20260401" }. Values are escaped. */
  staticVariables?: Record<string, string>;
  /** Inline TDL (already-built XML fragment from tdl.ts). Never put user input here unescaped. */
  tdl?: string;
}

const STATIC_VAR_NAME = /^[A-Z][A-Z0-9]*$/;

export function buildExportEnvelope(req: ExportRequest): string {
  const vars: [string, string][] = [[STATIC_VARS.EXPORT_FORMAT, STATIC_VARS.EXPORT_FORMAT_XML]];
  if (req.company !== undefined) vars.push([STATIC_VARS.CURRENT_COMPANY, req.company]);
  for (const [name, value] of Object.entries(req.staticVariables ?? {})) {
    if (!STATIC_VAR_NAME.test(name)) throw new Error(`Invalid static variable name: ${name}`);
    if (name === STATIC_VARS.CURRENT_COMPANY) {
      throw new Error("Set the company via ExportRequest.company, not staticVariables");
    }
    vars.push([name, value]);
  }
  const staticXml = vars.map(([n, v]) => `<${n}>${escapeXml(v)}</${n}>`).join("");
  return (
    `<ENVELOPE>` +
    `<HEADER>` +
    `<VERSION>${ENVELOPE.VERSION}</VERSION>` +
    `<TALLYREQUEST>${ENVELOPE.REQUEST_EXPORT}</TALLYREQUEST>` +
    `<TYPE>${req.type}</TYPE>` +
    `<ID>${escapeXml(req.id)}</ID>` +
    `</HEADER>` +
    `<BODY><DESC>` +
    `<STATICVARIABLES>${staticXml}</STATICVARIABLES>` +
    (req.tdl ? `<TDL><TDLMESSAGE>${req.tdl}</TDLMESSAGE></TDL>` : "") +
    `</DESC></BODY>` +
    `</ENVELOPE>`
  );
}

/**
 * Defence in depth for SAFETY RULE 1: refuse to send anything that is not a plain
 * Export request. Every request leaving TallyReadClient passes through this.
 */
export function assertReadOnlyEnvelope(xml: string): void {
  const forbidden = [
    /<\s*TALLYREQUEST\s*>(?!\s*Export\s*<)/i,
    /<\s*IMPORTDATA\b/i,
    /<\s*IMPORT\b/i,
    /\bACTION\s*=\s*["']?\s*(Create|Alter|Delete|Cancel|Remove)/i,
    /<\s*ACTION\b/i,
  ];
  for (const re of forbidden) {
    if (re.test(xml)) {
      throw new TallyWriteForbiddenError(
        `Refusing to send a non-read request to Tally (matched ${re}). The read client can only export.`,
      );
    }
  }
  const root = parseTallyXml(xml);
  const envelope = root["ENVELOPE"];
  const header = isNode(envelope) ? envelope["HEADER"] : undefined;
  const request = isNode(header) ? textOf(header["TALLYREQUEST"]) : undefined;
  if (request?.trim().toLowerCase() !== ENVELOPE.REQUEST_EXPORT.toLowerCase()) {
    throw new TallyWriteForbiddenError(
      `Refusing to send request with TALLYREQUEST="${request ?? "(missing)"}". The read client can only export.`,
    );
  }
}
