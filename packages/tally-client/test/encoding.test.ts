import { describe, expect, it } from "vitest";
import { decodeTallyResponse, detectEncoding, encodeTallyRequest, sanitizeTallyXml } from "../src";

const xml = "<ENVELOPE><NAME>Ram &amp; Shyam ₹ ચાર્લી</NAME></ENVELOPE>";
const utf16le = (s: string, bom: boolean): Uint8Array => {
  const body = Buffer.from(s, "utf16le");
  return new Uint8Array(bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body);
};

describe("detectEncoding / decodeTallyResponse", () => {
  it("decodes UTF-8 without BOM", () => {
    const r = decodeTallyResponse(new TextEncoder().encode(xml));
    expect(r).toEqual({ text: xml, encoding: "utf-8", hadBom: false });
  });
  it("strips a UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(xml)]);
    expect(decodeTallyResponse(bytes)).toEqual({ text: xml, encoding: "utf-8", hadBom: true });
  });
  it("decodes UTF-16LE with BOM", () => {
    expect(decodeTallyResponse(utf16le(xml, true))).toEqual({
      text: xml,
      encoding: "utf-16le",
      hadBom: true,
    });
  });
  it("detects UTF-16LE without BOM from the zero-byte pattern", () => {
    expect(decodeTallyResponse(utf16le(xml, false))).toEqual({
      text: xml,
      encoding: "utf-16le",
      hadBom: false,
    });
  });
  it("decodes UTF-16BE with BOM", () => {
    const le = Buffer.from(xml, "utf16le");
    const be = Buffer.alloc(le.length);
    for (let i = 0; i < le.length; i += 2) {
      be[i] = le[i + 1]!;
      be[i + 1] = le[i]!;
    }
    const bytes = new Uint8Array(Buffer.concat([Buffer.from([0xfe, 0xff]), be]));
    expect(decodeTallyResponse(bytes).text).toBe(xml);
  });
  it("falls back to the Content-Type charset when bytes are ambiguous", () => {
    expect(detectEncoding(new Uint8Array([0x3c]), "text/xml; charset=UTF-16").encoding).toBe("utf-16le");
    expect(detectEncoding(new Uint8Array([0x3c]), "text/xml").encoding).toBe("utf-8");
  });
});

describe("encodeTallyRequest", () => {
  it("round-trips UTF-16LE with BOM", () => {
    const bytes = encodeTallyRequest(xml, "utf-16le");
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xfe);
    expect(decodeTallyResponse(bytes).text).toBe(xml);
  });
});

describe("sanitizeTallyXml", () => {
  it("removes illegal numeric character references like &#4;", () => {
    expect(sanitizeTallyXml("<P>&#4; Primary</P>")).toBe("<P> Primary</P>");
    expect(sanitizeTallyXml("<P>&#x1F;x&#0;</P>")).toBe("<P>x</P>");
  });
  it("keeps legal character references and entities", () => {
    expect(sanitizeTallyXml("<P>&#13;&#10;&#8377;&amp;&#x20B9;</P>")).toBe(
      "<P>&#13;&#10;&#8377;&amp;&#x20B9;</P>",
    );
  });
  it("removes raw control characters", () => {
    expect(sanitizeTallyXml("<P>a\u0004b</P>")).toBe("<P>ab</P>");
  });
});
