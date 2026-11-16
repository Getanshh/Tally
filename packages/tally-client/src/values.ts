import { TallyInputError } from "./errors";

/* ------------------------------------------------------------------ dates */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TALLY_XML_DATE = /^(\d{4})(\d{2})(\d{2})$/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** e.g. "1-Apr-2025" or "01-Apr-25", which some Tally reports use. VERIFY-ON-TALLY */
const TALLY_DISPLAY_DATE = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/;

function assertRealDate(y: number, m: number, d: number, original: string): void {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new TallyInputError(`Not a real calendar date: ${original}`);
  }
}

/** "2026-04-01" → "20260401" (the format Tally expects in XML). */
export function toTallyDate(isoDate: string): string {
  const m = ISO_DATE.exec(isoDate);
  if (!m) throw new TallyInputError(`Date must be in YYYY-MM-DD format, got "${isoDate}"`);
  const [, y, mo, d] = m as unknown as [string, string, string, string];
  assertRealDate(Number(y), Number(mo), Number(d), isoDate);
  return `${y}${mo}${d}`;
}

/** "20260401" or "1-Apr-2026" → "2026-04-01". */
export function fromTallyDate(value: string): string {
  const v = value.trim();
  const xml = TALLY_XML_DATE.exec(v);
  if (xml) {
    const [, y, mo, d] = xml as unknown as [string, string, string, string];
    assertRealDate(Number(y), Number(mo), Number(d), value);
    return `${y}-${mo}-${d}`;
  }
  const disp = TALLY_DISPLAY_DATE.exec(v);
  if (disp) {
    const [, dStr, monStr, yStr] = disp as unknown as [string, string, string, string];
    const month = MONTHS.indexOf(monStr.toLowerCase()) + 1;
    if (month === 0) throw new TallyInputError(`Unknown month in Tally date "${value}"`);
    const year = yStr.length === 2 ? 2000 + Number(yStr) : Number(yStr);
    const day = Number(dStr);
    assertRealDate(year, month, day, value);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  throw new TallyInputError(`Unrecognised Tally date "${value}"`);
}

/* ---------------------------------------------------------------- amounts */

/**
 * Parse a decimal string into an integer number of units at the given scale, with no
 * floating-point arithmetic (e.g. scale 2: "1,234.5" → 123450). Throws if the value has
 * more significant decimals than the scale allows.
 */
export function parseScaledDecimal(raw: string, scale: number): number {
  const cleaned = raw.replace(/[,\s₹]/g, "");
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new TallyInputError(`Not a number: "${raw}"`);
  }
  const sign = m[1] === "-" ? -1 : 1;
  const intPart = m[2] === "" ? "0" : m[2]!;
  let frac = m[3] ?? "";
  if (frac.length > scale) {
    if (/[^0]/.test(frac.slice(scale))) {
      throw new TallyInputError(`"${raw}" has more than ${scale} decimal places`);
    }
    frac = frac.slice(0, scale);
  }
  frac = frac.padEnd(scale, "0");
  const value = Number(intPart + frac);
  if (!Number.isSafeInteger(value)) throw new TallyInputError(`Number too large: "${raw}"`);
  return value === 0 ? 0 : sign * value;
}

/** Format an integer at the given scale back to a decimal string: (123450, 2) → "1234.50". */
export function formatScaledDecimal(value: number, scale: number): string {
  if (!Number.isSafeInteger(value)) throw new TallyInputError(`Not a safe integer: ${value}`);
  const neg = value < 0;
  const digits = String(Math.abs(value)).padStart(scale + 1, "0");
  const int = digits.slice(0, digits.length - scale);
  const frac = digits.slice(digits.length - scale);
  return `${neg ? "-" : ""}${int}${scale > 0 ? "." + frac : ""}`;
}

/**
 * Parse a Tally amount into signed paise.
 *
 * Tally XML sign convention (VERIFY-ON-TALLY with captured vouchers):
 *   negative = Debit, positive = Credit.
 * A trailing "Dr"/"Cr" (seen in some report exports) is converted to that convention.
 */
export function parseTallyAmount(raw: string): number {
  const v = raw.trim();
  if (v === "") return 0;
  const drcr = /\s*(Dr|Cr)\.?$/i.exec(v);
  if (drcr) {
    const magnitude = Math.abs(parseScaledDecimal(v.slice(0, drcr.index), 2));
    return drcr[1]!.toLowerCase() === "dr" ? -magnitude : magnitude;
  }
  return parseScaledDecimal(v, 2);
}

/** Paise → "1234.50" (no thousands separators; suitable for XML). */
export function formatPaise(paise: number): string {
  return formatScaledDecimal(paise, 2);
}
