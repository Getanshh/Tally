import { TallyInputError } from "../errors";

/**
 * Characters that are illegal in XML 1.0 text, except TAB, LF, CR.
 * A value containing one of these is almost certainly corrupt input, so we refuse it
 * rather than silently altering e.g. a party name.
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;

/**
 * Escape a value for use as XML text or a double/single-quoted attribute.
 * Handles names like `Shree Ram's Traders & Co. <Surat>`.
 */
export function escapeXml(value: string): string {
  if (ILLEGAL_XML_CHARS.test(value)) {
    throw new TallyInputError(
      `Value contains a control character that cannot be sent to Tally: ${JSON.stringify(value)}`,
    );
  }
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
