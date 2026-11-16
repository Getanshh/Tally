/**
 * Tally may answer in UTF-8 or UTF-16 (LE, with or without BOM) depending on version
 * and settings. We detect the encoding from the bytes rather than trusting headers.
 * VERIFY-ON-TALLY: which encoding our TallyPrime build actually returns.
 */
export type TallyEncoding = "utf-8" | "utf-16le" | "utf-16be";

export interface DecodedResponse {
  text: string;
  encoding: TallyEncoding;
  hadBom: boolean;
}

export function detectEncoding(
  bytes: Uint8Array,
  contentTypeHeader?: string | null,
): { encoding: TallyEncoding; bomLength: number } {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe)
    return { encoding: "utf-16le", bomLength: 2 };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff)
    return { encoding: "utf-16be", bomLength: 2 };
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { encoding: "utf-8", bomLength: 3 };

  // No BOM: XML starts with ASCII ('<' or whitespace), so in UTF-16 one byte of the
  // first pair is zero.
  if (bytes.length >= 4) {
    if (bytes[0] !== 0 && bytes[1] === 0 && bytes[2] !== 0 && bytes[3] === 0)
      return { encoding: "utf-16le", bomLength: 0 };
    if (bytes[0] === 0 && bytes[1] !== 0 && bytes[2] === 0 && bytes[3] !== 0)
      return { encoding: "utf-16be", bomLength: 0 };
  }

  const charset = contentTypeHeader?.match(/charset\s*=\s*"?([\w-]+)/i)?.[1]?.toLowerCase();
  if (charset === "utf-16" || charset === "utf-16le" || charset === "unicode")
    return { encoding: "utf-16le", bomLength: 0 };
  if (charset === "utf-16be") return { encoding: "utf-16be", bomLength: 0 };
  return { encoding: "utf-8", bomLength: 0 };
}

export function decodeTallyResponse(bytes: Uint8Array, contentTypeHeader?: string | null): DecodedResponse {
  const { encoding, bomLength } = detectEncoding(bytes, contentTypeHeader);
  const body = bytes.subarray(bomLength);
  let text: string;
  if (encoding === "utf-16be") {
    // TextDecoder supports utf-16be in Node's full-ICU builds; swap bytes to be safe.
    const swapped = new Uint8Array(body.length - (body.length % 2));
    for (let i = 0; i + 1 < body.length; i += 2) {
      swapped[i] = body[i + 1]!;
      swapped[i + 1] = body[i]!;
    }
    text = new TextDecoder("utf-16le", { fatal: false }).decode(swapped);
  } else {
    text = new TextDecoder(encoding, { fatal: false }).decode(body);
  }
  return { text, encoding, hadBom: bomLength > 0 };
}

export function encodeTallyRequest(xml: string, encoding: "utf-8" | "utf-16le"): Uint8Array {
  if (encoding === "utf-8") return new TextEncoder().encode(xml);
  const out = new Uint8Array(2 + xml.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < xml.length; i++) {
    const code = xml.charCodeAt(i);
    out[2 + i * 2] = code & 0xff;
    out[3 + i * 2] = code >> 8;
  }
  return out;
}

/**
 * Tally is known to emit numeric character references for characters that are illegal
 * in XML 1.0 (most famously `&#4;` before "Primary"). Strict parsers reject those, so
 * strip them, along with raw control characters, before parsing.
 */
export function sanitizeTallyXml(xml: string): string {
  return (
    xml
      .replace(
        /&#(?:x0*([0-9a-f]+)|0*(\d+));/gi,
        (match, hex: string | undefined, dec: string | undefined) => {
          const code = hex !== undefined ? parseInt(hex, 16) : parseInt(dec ?? "", 10);
          const legal =
            code === 0x9 ||
            code === 0xa ||
            code === 0xd ||
            (code >= 0x20 && code <= 0xd7ff) ||
            (code >= 0xe000 && code <= 0xfffd) ||
            (code >= 0x10000 && code <= 0x10ffff);
          return legal ? match : "";
        },
      )
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  );
}
