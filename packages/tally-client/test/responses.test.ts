import { describe, expect, it } from "vitest";
import { parseExportResponse, parseImportResult, TallyBadResponseError, TallyResponseError } from "../src";

describe("parseExportResponse", () => {
  it("returns the parsed tree on success", () => {
    const root = parseExportResponse(
      "<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION/></DATA></BODY></ENVELOPE>",
    );
    expect(root).toHaveProperty("ENVELOPE");
  });
  it("accepts legacy report output with no header", () => {
    expect(() =>
      parseExportResponse("<ENVELOPE><DSPACCNAME><DSPDISPNAME>Cash</DSPDISPNAME></DSPACCNAME></ENVELOPE>"),
    ).not.toThrow();
  });
  it("throws a readable error for STATUS 0", () => {
    expect(() =>
      parseExportResponse(
        "<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>0</STATUS></HEADER><BODY><DATA>Could not find Report 'Foo'!</DATA></BODY></ENVELOPE>",
      ),
    ).toThrow(/Could not find Report 'Foo'!/);
  });
  it("throws for a bare RESPONSE message", () => {
    expect(() => parseExportResponse("<RESPONSE>Unknown Request, cannot be processed</RESPONSE>")).toThrow(
      TallyResponseError,
    );
  });
  it("throws for LINEERROR anywhere", () => {
    expect(() =>
      parseExportResponse(
        "<ENVELOPE><BODY><DATA><LINEERROR>Company not loaded</LINEERROR></DATA></BODY></ENVELOPE>",
      ),
    ).toThrow(/Company not loaded/);
  });
  it("throws for empty or malformed bodies", () => {
    expect(() => parseExportResponse("   ")).toThrow(TallyBadResponseError);
    expect(() => parseExportResponse("not xml at all")).toThrow();
  });
});

describe("parseImportResult", () => {
  it("parses a TallyPrime IMPORTRESULT success", () => {
    const r = parseImportResult(
      "<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER><BODY><DATA><IMPORTRESULT><CREATED>1</CREATED><ALTERED>0</ALTERED><DELETED>0</DELETED><LASTVCHID>4521</LASTVCHID><LASTMID>0</LASTMID><COMBINED>0</COMBINED><IGNORED>0</IGNORED><ERRORS>0</ERRORS><CANCELLED>0</CANCELLED><EXCEPTIONS>0</EXCEPTIONS></IMPORTRESULT></DATA></BODY></ENVELOPE>",
    );
    expect(r).toMatchObject({
      created: 1,
      errors: 0,
      lastVoucherId: "4521",
      lastMasterId: "0",
      ok: true,
      lineErrors: [],
    });
  });
  it("parses a legacy RESPONSE with LINEERROR as not ok", () => {
    const r = parseImportResult(
      "<RESPONSE><LINEERROR>Ledger 'Shree Ram Traders' does not exist!</LINEERROR><CREATED>0</CREATED><ALTERED>0</ALTERED><LASTVCHID>0</LASTVCHID><LASTMID>0</LASTMID><COMBINED>0</COMBINED><IGNORED>0</IGNORED><ERRORS>1</ERRORS><CANCELLED>0</CANCELLED></RESPONSE>",
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toBe(1);
    expect(r.lineErrors).toEqual(["Ledger 'Shree Ram Traders' does not exist!"]);
  });
  it("treats exceptions as not ok", () => {
    const r = parseImportResult(
      "<RESPONSE><CREATED>0</CREATED><ERRORS>0</ERRORS><EXCEPTIONS>1</EXCEPTIONS></RESPONSE>",
    );
    expect(r.ok).toBe(false);
  });
  it("throws on a response with no counters at all", () => {
    expect(() => parseImportResult("<RESPONSE>Unknown Request, cannot be processed</RESPONSE>")).toThrow(
      TallyResponseError,
    );
  });
  it("throws on garbage counters rather than guessing", () => {
    expect(() => parseImportResult("<RESPONSE><CREATED>one</CREATED></RESPONSE>")).toThrow(
      TallyBadResponseError,
    );
  });
});
