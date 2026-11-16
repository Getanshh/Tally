/**
 * EVERY Tally-specific identifier used by this project lives in this file.
 *
 * Tally's XML interface is only partly documented, so anything below marked
 * VERIFY-ON-TALLY has been written from general TallyPrime knowledge and must be
 * confirmed against fixtures captured from the TEST company (see docs/VERIFY.md).
 * If something turns out to be wrong, change it HERE — nowhere else should hard-code
 * a Tally tag, report name or TDL expression.
 */

/** Header values for request envelopes (TallyPrime "Version 1" request format). */
export const ENVELOPE = {
  VERSION: "1",
  REQUEST_EXPORT: "Export",
  /** Only the poster package (desktop app) may ever build envelopes with this value. */
  REQUEST_IMPORT: "Import",
  TYPE_COLLECTION: "Collection",
  TYPE_DATA: "Data",
  TYPE_OBJECT: "Object",
} as const;

/** Static variables sent in <STATICVARIABLES>. */
export const STATIC_VARS = {
  EXPORT_FORMAT: "SVEXPORTFORMAT",
  EXPORT_FORMAT_XML: "$$SysName:XML",
  /** Set on EVERY company-scoped request so a user switching companies in Tally can't redirect us. */
  CURRENT_COMPANY: "SVCURRENTCOMPANY",
  FROM_DATE: "SVFROMDATE",
  TO_DATE: "SVTODATE",
} as const;

/**
 * Names of our own inline-TDL collections. Prefixed so they never collide with
 * Tally's built-in collections (e.g. the built-in "List of Companies").
 */
export const COLLECTIONS = {
  COMPANIES: "TBCompanies",
  COMPANY_DETAILS: "TBCompanyDetails",
  LEDGERS: "TBLedgers",
  GROUPS: "TBGroups",
  STOCK_ITEMS: "TBStockItems",
  STOCK_GROUPS: "TBStockGroups",
  UNITS: "TBUnits",
  GODOWNS: "TBGodowns",
  VOUCHER_TYPES: "TBVoucherTypes",
  CURRENCIES: "TBCurrencies",
  VOUCHERS: "TBVouchers",
} as const;

/** Tally object type names used in <TYPE> of inline collections. */
export const OBJECT_TYPES = {
  COMPANY: "Company",
  LEDGER: "Ledger",
  GROUP: "Group",
  STOCK_ITEM: "StockItem",
  STOCK_GROUP: "StockGroup",
  UNIT: "Unit",
  GODOWN: "Godown",
  VOUCHER_TYPE: "VoucherType",
  CURRENCY: "Currency",
  VOUCHER: "Voucher",
} as const;

/**
 * Element names of objects inside a collection export response, e.g.
 * <DATA><COLLECTION><COMPANY NAME="..">..</COMPANY></COLLECTION></DATA>.
 * VERIFY-ON-TALLY: element names are upper-cased object type names.
 */
export const RESPONSE_ELEMENTS = {
  COMPANY: "COMPANY",
  LEDGER: "LEDGER",
  GROUP: "GROUP",
  STOCK_ITEM: "STOCKITEM",
  STOCK_GROUP: "STOCKGROUP",
  UNIT: "UNIT",
  GODOWN: "GODOWN",
  VOUCHER_TYPE: "VOUCHERTYPE",
  CURRENCY: "CURRENCY",
  VOUCHER: "VOUCHER",
} as const;

/** Built-in Tally report names used with TYPE=Data. VERIFY-ON-TALLY: exact report IDs. */
export const REPORTS = {
  TRIAL_BALANCE: "Trial Balance",
  PROFIT_AND_LOSS: "Profit and Loss",
  BALANCE_SHEET: "Balance Sheet",
  STOCK_SUMMARY: "Stock Summary",
  DAY_BOOK: "Day Book",
  BILLS_RECEIVABLE: "Bills Receivable",
  BILLS_PAYABLE: "Bills Payable",
  LEDGER_VOUCHERS: "Ledger Vouchers",
  SALES_REGISTER: "Sales Register",
  PURCHASE_REGISTER: "Purchase Register",
} as const;

/**
 * Fields fetched for the health-check company collection.
 * COMPUTE expressions are VERIFY-ON-TALLY: if Tally rejects them, health() still
 * works and simply reports `activeCompany: null` / `version: null`.
 */
export const HEALTH_COMPANY_FETCH = ["NAME", "GUID", "STARTINGFROM", "BOOKSFROM", "ENDINGAT"] as const;
export const HEALTH_COMPUTE = {
  /** True for the company currently selected in the Tally UI. VERIFY-ON-TALLY */
  IS_ACTIVE: "TBISACTIVE : $$IsEqual:$Name:##SVCurrentCompany",
  /** Tally product/release string. VERIFY-ON-TALLY: function name unconfirmed. */
  VERSION: "TBVERSION : $$SysInfo:Version",
} as const;

/** Banner returned by a plain GET to the Tally port. VERIFY-ON-TALLY */
export const SERVER_BANNER_PATTERN = /(Tally\S*(?:\s?Prime)?|Tally\.ERP\s*9)[^<]*Server is Running/i;

/** Response tags of an import (write) result. Parsing only — this package never sends imports. */
export const IMPORT_RESULT_TAGS = {
  CREATED: "CREATED",
  ALTERED: "ALTERED",
  DELETED: "DELETED",
  LAST_VOUCHER_ID: "LASTVCHID",
  LAST_MASTER_ID: "LASTMID",
  COMBINED: "COMBINED",
  IGNORED: "IGNORED",
  ERRORS: "ERRORS",
  CANCELLED: "CANCELLED",
  EXCEPTIONS: "EXCEPTIONS",
  LINE_ERROR: "LINEERROR",
} as const;
