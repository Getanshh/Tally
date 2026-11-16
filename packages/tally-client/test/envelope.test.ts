import { describe, expect, it } from "vitest";
import {
  assertReadOnlyEnvelope,
  buildCollectionTdl,
  buildExportEnvelope,
  findFirst,
  parseTallyXml,
  requestCatalog,
  textOf,
  TallyWriteForbiddenError,
} from "../src";

describe("buildExportEnvelope", () => {
  it("builds a well-formed Export envelope with the company pinned", () => {
    const xml = buildExportEnvelope({ type: "Data", id: "Trial Balance", company: "Ram & Shyam's Foods" });
    expect(xml).toContain("<TALLYREQUEST>Export</TALLYREQUEST>");
    expect(xml).toContain("<SVCURRENTCOMPANY>Ram &amp; Shyam&apos;s Foods</SVCURRENTCOMPANY>");
    const root = parseTallyXml(xml);
    expect(textOf(findFirst(root, "SVCURRENTCOMPANY"))).toBe("Ram & Shyam's Foods");
    expect(textOf(findFirst(root, "SVEXPORTFORMAT"))).toBe("$$SysName:XML");
  });

  it("refuses to set the company through staticVariables", () => {
    expect(() =>
      buildExportEnvelope({ type: "Data", id: "X", staticVariables: { SVCURRENTCOMPANY: "Other" } }),
    ).toThrow(/company/);
  });

  it("rejects invalid static variable names (no XML injection via names)", () => {
    expect(() => buildExportEnvelope({ type: "Data", id: "X", staticVariables: { "A><B": "1" } })).toThrow();
  });

  it("escapes values so they cannot inject elements", () => {
    const xml = buildExportEnvelope({
      type: "Data",
      id: "Day Book",
      company: "C",
      staticVariables: { SVFROMDATE: "</SVFROMDATE><TALLYREQUEST>Import</TALLYREQUEST>" },
    });
    expect(() => assertReadOnlyEnvelope(xml)).not.toThrow();
    expect(xml).not.toContain("<TALLYREQUEST>Import");
  });

  it("every catalogued request passes the read-only guard", () => {
    const reqs = [
      requestCatalog.loadedCompanies(),
      requestCatalog.companyDetails("C"),
      requestCatalog.ledgers("C"),
      requestCatalog.groups("C"),
      requestCatalog.stockItems("C"),
      requestCatalog.stockGroups("C"),
      requestCatalog.units("C"),
      requestCatalog.godowns("C"),
      requestCatalog.voucherTypes("C"),
      requestCatalog.vouchers("C", "2026-04-01", "2026-04-30"),
      requestCatalog.report("C", "Trial Balance", "2026-04-01", "2026-04-30"),
    ];
    for (const r of reqs) expect(() => assertReadOnlyEnvelope(buildExportEnvelope(r))).not.toThrow();
  });

  it("every company-scoped catalogued request pins SVCURRENTCOMPANY", () => {
    for (const r of [
      requestCatalog.ledgers("Charliee TEST"),
      requestCatalog.report("Charliee TEST", "Day Book"),
    ]) {
      expect(buildExportEnvelope(r)).toContain("<SVCURRENTCOMPANY>Charliee TEST</SVCURRENTCOMPANY>");
    }
  });
});

describe("assertReadOnlyEnvelope", () => {
  const importXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER><BODY><DESC/><DATA><TALLYMESSAGE><VOUCHER ACTION="Create"/></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
  const legacyImport = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC></IMPORTDATA></BODY></ENVELOPE>`;
  const sneaky = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>X</ID></HEADER><BODY><DATA><TALLYMESSAGE><LEDGER ACTION="Delete" NAME="Cash"/></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
  const execute = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Execute</TALLYREQUEST><TYPE>TDLAction</TYPE><ID>X</ID></HEADER></ENVELOPE>`;

  it.each([
    ["Import request", importXml],
    ["legacy Import Data request", legacyImport],
    ["Export header smuggling a Delete action", sneaky],
    ["Execute/TDL action", execute],
    ["missing header", "<ENVELOPE><BODY/></ENVELOPE>"],
  ])("rejects %s", (_label, xml) => {
    expect(() => assertReadOnlyEnvelope(xml)).toThrow(TallyWriteForbiddenError);
  });

  it("accepts an Export with whitespace around the request type", () => {
    expect(() =>
      assertReadOnlyEnvelope(
        `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST> Export </TALLYREQUEST><TYPE>Data</TYPE><ID>X</ID></HEADER></ENVELOPE>`,
      ),
    ).not.toThrow();
  });
});

describe("buildCollectionTdl", () => {
  it("builds a collection with fetch, compute and filters", () => {
    const tdl = buildCollectionTdl({
      name: "TBTest",
      type: "Ledger",
      fetch: ["NAME", "PARENT"],
      compute: ["X : $Name"],
      filters: ["TBF"],
      formulas: { TBF: '$Parent = "Sundry Debtors"' },
    });
    const root = parseTallyXml(`<R>${tdl}</R>`);
    expect(textOf(findFirst(root, "FETCH"))).toBe("NAME, PARENT");
    expect(textOf(findFirst(root, "SYSTEM"))).toBe('$Parent = "Sundry Debtors"');
  });
});
