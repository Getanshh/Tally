# VERIFY-ON-TALLY checklist

Everything below was written from general TallyPrime knowledge and has **not** been confirmed
against your real Tally. Each item is marked `// VERIFY-ON-TALLY` in the code. Fixtures captured
from the TEST company (see `SETUP-WINDOWS.md` → step 5) should settle most of them.

Status legend: ⬜ unverified · ✅ confirmed · ❌ wrong (fix in code, then tick)

## Transport & encoding

| #   | Item                                                                             | Where                                                          | How to confirm                                                                              | Status |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| T1  | Banner text for `GET http://host:9000` ("TallyPrime Server is Running")          | `names.ts` `SERVER_BANNER_PATTERN`, synthetic `banner` fixture | `banner.response.xml` from a capture                                                        | ⬜     |
| T2  | Response encoding (UTF-8 vs UTF-16LE, BOM or not)                                | `xml/encoding.ts`                                              | `"encoding"` field in captured `.meta.json` files                                           | ⬜     |
| T3  | Request encoding needed for Gujarati / `₹` characters (`TALLY_REQUEST_ENCODING`) | `config.ts`, `transport.ts`                                    | Capture once with `utf-8`; if names with non-ASCII come back garbled, retry with `utf-16le` | ⬜     |
| T4  | Tally emits illegal char refs such as `&#4;` (we strip them)                     | `sanitizeTallyXml`                                             | Look for `&#4;` in `groups.response.xml`                                                    | ⬜     |

## Request / response format

| #   | Item                                                                                                                                                                                                          | Where                                 | How to confirm                                                        | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- | ------ |
| R1  | "Version 1" Export envelope with inline TDL `<COLLECTION>` is accepted                                                                                                                                        | `envelope.ts`, `tdl.ts`               | `companies`, `ledgers` captures succeed                               | ⬜     |
| R2  | Collection response shape `<DATA><COLLECTION><COMPANY NAME=..>` and element names = upper-cased types (`STOCKITEM`, `VOUCHERTYPE`…)                                                                           | `names.ts` `RESPONSE_ELEMENTS`        | Inspect captured collection responses                                 | ⬜     |
| R3  | Error response shapes (`STATUS 0` + `<DATA>msg`, bare `<RESPONSE>msg`, `LINEERROR`)                                                                                                                           | `responses.ts` `parseExportResponse`  | Any capture that came back as "TALLY ERROR" in `SUMMARY.md`           | ⬜     |
| R4  | `COMPUTE` `$$IsEqual:$Name:##SVCurrentCompany` identifies the active company                                                                                                                                  | `names.ts` `HEALTH_COMPUTE.IS_ACTIVE` | `TBISACTIVE` = Yes on exactly one company in `companies.response.xml` | ⬜     |
| R5  | `$$SysInfo:Version` returns Tally's version (may not exist → `version: null`)                                                                                                                                 | `names.ts` `HEALTH_COMPUTE.VERSION`   | `TBVERSION` in `companies.response.xml`                               | ⬜     |
| R6  | `Company` collection lists only **loaded** companies; how to list unloaded ones (for `list_companies`)                                                                                                        | `client.ts`                           | Compare with companies on disk                                        | ⬜     |
| R7  | Built-in report IDs used with `TYPE=Data` (Trial Balance, Profit and Loss, Balance Sheet, Stock Summary, Day Book, Bills Receivable/Payable, Ledger Vouchers, Sales/Purchase Register) and their output shape | `names.ts` `REPORTS`                  | `report-*.response.xml`                                               | ⬜     |
| R8  | FETCH field names for ledgers, items (GST/HSN details, standard rates, price lists), units, godowns, voucher types, vouchers                                                                                  | `requests.ts`                         | Fields present/absent in captures                                     | ⬜     |
| R9  | `SVFROMDATE`/`SVTODATE` respected by collection exports of vouchers                                                                                                                                           | `requests.ts` `vouchers`              | Captured vouchers fall inside the requested range                     | ⬜     |
| R10 | TDL string-quoting rules when user values go inside filter formulas (Phase 1)                                                                                                                                 | `tdl.ts`                              | Search for a party whose name contains `"` or `'`                     | ⬜     |
| R11 | Import response shape (`<IMPORTRESULT>` vs legacy `<RESPONSE>`)                                                                                                                                               | `responses.ts` `parseImportResult`    | Phase 2, first post to TEST company                                   | ⬜     |

## Values & accounting conventions

| #   | Item                                                                                 | Where                                       | How to confirm                                                             | Status |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------- | ------ |
| V1  | Sign convention in XML: negative = Debit, positive = Credit (and `ISDEEMEDPOSITIVE`) | `values.ts` `parseTallyAmount`              | A sales voucher in `vouchers.response.xml`: party line vs sales line signs | ⬜     |
| V2  | Report amounts with `Dr`/`Cr` suffix or Indian digit grouping                        | `values.ts`                                 | `report-trial-balance.response.xml`                                        | ⬜     |
| V3  | Display-format dates (`1-Apr-2026`) in some report outputs                           | `values.ts` `fromTallyDate`                 | Report captures                                                            | ⬜     |
| V4  | XML flag for **Optional** vouchers (`ISOPTIONAL`?)                                   | Phase 3 poster                              | Create one optional voucher in TEST before capturing; inspect it           | ⬜     |
| V5  | GST round-off method and ledger names for CGST/SGST/IGST/round-off                   | Phase 3 core                                | Captured sales invoices with odd paise                                     | ⬜     |
| V6  | How batch/expiry allocations appear on inventory lines                               | Phase 2/3                                   | Captured voucher using a batch-tracked item                                | ⬜     |
| V7  | Books-lock date field on the company                                                 | `requests.ts` `companyDetails` (`LOCKDATE`) | `company-details.response.xml`                                             | ⬜     |
