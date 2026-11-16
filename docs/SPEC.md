# Build brief: Tally ↔ Claude bridge (MCP server + approval desktop app)

You are building a production tool for Baijay International Pvt Ltd (brand: Charliee), a food manufacturer in Gujarat, India. The goal is to let Claude read data from TallyPrime and prepare accounting entries (purchase orders, sales/purchase invoices) **without ever risking an unreviewed error in the books.**

Read this whole brief before writing code. Save it in the repo as `docs/SPEC.md`, and create a `CLAUDE.md` at the repo root that summarises the non-negotiable rules from section 2 so they apply to every future session.

---

## 1. Context you must know

- **TallyPrime** (Silver/Gold) runs on a **Windows Server** on our LAN. Staff access it over Remote Desktop.
- Tally exposes an **XML-over-HTTP interface** on port **9000** (F1 > Settings > Connectivity > Client/Server configuration → TallyPrime acts as **Server**, port 9000). Requests are XML `ENVELOPE`s POSTed to `http://<TALLY_HOST>:9000`. That port has **no authentication**, so it must never be exposed to the internet.
- Claude will connect in two ways:
  1. **Phase 1–3:** Claude Desktop on the Tally server (or a LAN PC) launches our MCP server over **stdio**.
  2. **Phase 4:** claude.ai web/mobile connects to the same tools over **Streamable HTTP** as a custom connector.
- **You (Claude Code) almost certainly cannot reach our Tally server from your environment.** Do not pretend to test against real Tally. Instead:
  - build a **mock Tally server** that replays recorded XML fixtures,
  - write a **fixture-capture script** that I will run on the Tally server to record real responses from a **test company**,
  - clearly mark anything that still needs verifying against real Tally with `// VERIFY-ON-TALLY` and list those items in `docs/VERIFY.md`.
- Where Tally XML tag names, report names or TDL collection details aren't confirmed, say so and make them easy to change in one place. Don't invent them silently.

---

## 2. Non-negotiable safety rules (put these in CLAUDE.md)

1. **The MCP server process has no code path that writes to Tally.** It can only read from Tally and write *proposals* into the local database. Only the desktop approval app can post to Tally, and only after a human clicks **Approve**. Enforce this structurally: the MCP server package must not import the voucher-posting module (add a lint rule or a test that fails if it does).
2. **Claude never supplies authoritative numbers.** Rates, tax and totals are always recomputed by our code from Tally masters / price lists. Claude's suggested amounts are kept only for display and comparison.
3. **No guessing masters.** Party ledgers, stock items, godowns, units and voucher types must match an existing Tally master **exactly** (by GUID/name). If there's no exact match, reject the proposal and return candidate matches. Never auto-create masters.
4. **No delete or alter tools** in any phase unless I explicitly ask later.
5. **Whitelists everywhere:** allowed voucher types, allowed companies for writes (`WRITE_ALLOWED_COMPANIES`), and a global kill switch `TALLY_WRITE_ENABLED=false` by default.
6. **Idempotency:** every proposal has a unique reference that's written into the voucher (e.g. reference/narration field). Before posting, check Tally for an existing voucher with that reference. A retry must never create a duplicate.
7. **Verify after every post:** read the voucher back from Tally and compare party, date, every line (item, qty, rate, amount), tax and total against the approved proposal. Any mismatch → mark FAILED-VERIFY, alert loudly in the UI and leave it for a human. Never "fix" it automatically.
8. **Invoices go in as Optional vouchers** (they don't affect the books until an accountant regularises them) unless the config explicitly allows direct posting for that voucher type. `// VERIFY-ON-TALLY` the exact XML flag for optional vouchers.
9. **Append-only audit log** of everything: tool calls, Claude's raw inputs, validation results, approver, XML sent, Tally's raw response and verification result.
10. All development and integration testing happens against a **test copy of the company**, never the live one.

---

## 3. Architecture

Monorepo, **TypeScript**, **pnpm workspaces**, Node 20+.

```
/packages
  tally-client/     # low-level XML-over-HTTP client: request builders, response parsers, encoding, retries, timeouts
  core/             # domain types, master lookups, validation engine, pricing/tax computation, proposal model
  db/               # SQLite (better-sqlite3, WAL mode): proposals, audit_log, settings, users; migrations
  poster/           # builds voucher XML from an APPROVED proposal, posts it, reads it back, verifies (ONLY imported by desktop app)
/apps
  mcp-server/       # MCP server (official @modelcontextprotocol/sdk). stdio now, Streamable HTTP in phase 4. Imports tally-client, core, db — NOT poster
  desktop/          # Electron + React approval app: queue, preview, approve/reject, audit viewer, settings, Tally health check
  mock-tally/       # fake Tally HTTP server replaying fixtures, for tests and local dev
/scripts
  capture-fixtures.ts   # I run this on the Tally server against the TEST company to record real XML responses
/docs
  SPEC.md, VERIFY.md, SETUP-WINDOWS.md, TOOLS.md
```

**How the processes cooperate:** the MCP server and the desktop app share one SQLite file (path from config). The MCP server inserts proposals with status `PENDING`. The desktop app watches the table, shows them, and on approval runs `poster`. Proposal statuses: `PENDING → APPROVED → POSTING → POSTED_VERIFIED`, or `REJECTED / FAILED_VALIDATION / FAILED_POST / FAILED_VERIFY / EXPIRED`.

**Config** via `.env` plus a settings screen: `TALLY_HOST`, `TALLY_PORT`, `TALLY_TIMEOUT_MS`, `DEFAULT_COMPANY`, `DB_PATH`, `TALLY_WRITE_ENABLED`, `WRITE_ALLOWED_COMPANIES`, `ALLOWED_VOUCHER_TYPES`, `OPTIONAL_VOUCHER_TYPES`, `SECOND_APPROVAL_THRESHOLD_INR`, `PROPOSAL_EXPIRY_HOURS`.

**Tally client requirements:**
- Serialise requests (one at a time); Tally handles concurrent requests poorly.
- Handle encoding correctly (Tally may respond in UTF-16; detect and decode), and escape XML special characters in all values (`&`, `<`, apostrophes in party names, etc.).
- Parse Tally's import responses (`CREATED`, `ALTERED`, `ERRORS`, `LINEERROR`, exceptions) into typed results.
- Specify the target company explicitly on every request (`SVCURRENTCOMPANY`) so a staff member switching companies in Tally can't redirect writes.
- A `health()` call: is Tally reachable, which companies are loaded, Tally version.
- Indian number/date handling: dates as `YYYYMMDD` in XML, amounts in INR with correct sign conventions (Dr/Cr). `// VERIFY-ON-TALLY` the sign conventions with fixtures.

---

## 4. MCP tools

Write clear tool descriptions. Claude chooses tools based on them. Every tool returns compact, readable JSON with totals, not raw XML. Paginate or limit large results. Document every tool in `docs/TOOLS.md`.

### Read tools (phase 1)
| Tool | Purpose |
|---|---|
| `tally_health` | Connection status, loaded companies, active company |
| `list_companies` | Companies available in Tally |
| `search_ledgers` | Find ledgers by partial name/group. Returns exact names + GUIDs + group + GSTIN |
| `search_stock_items` | Find items by partial name. Returns exact name, GUID, unit, HSN, GST rate, standard rates |
| `get_trial_balance` | For a date range |
| `get_profit_and_loss` | For a date range |
| `get_balance_sheet` | As on a date |
| `get_stock_summary` | Closing stock by item/group/godown |
| `get_bills_outstanding` | Receivables or payables, with ageing buckets (0–30, 31–60, 61–90, 90+) |
| `get_ledger_statement` | Ledger vouchers for a party in a date range |
| `get_sales_register` / `get_purchase_register` | With filters: party, item, date range |
| `get_voucher` | One voucher by number/GUID/reference |
| `get_day_book` | Vouchers for a date range, optionally by type |

### Proposal tools (phases 2–3). These never touch Tally.
| Tool | Purpose |
|---|---|
| `propose_purchase_order` | Input: supplier (exact ledger name or GUID), date, items `[{item, qty, unit, rate?}]`, godown?, notes. Validates and stores a PENDING proposal. Returns proposal ID, computed lines/tax/total, and any warnings |
| `propose_sales_invoice` | Same pattern for sales. Rate comes from price level / standard rate. Claude's rate is only compared, and a mismatch is flagged |
| `propose_purchase_invoice` | Same pattern; optionally linked to an existing PO (pull rates/qty from the PO) |
| `get_proposal_status` | Status + verification result for a proposal ID |
| `list_proposals` | Recent proposals, filterable by status |

Every proposal tool response must end with a plain sentence for Claude to relay, e.g. *"Proposal PO-2026-00042 is waiting for approval in the Tally Bridge app. Nothing has been posted to Tally yet."*

---

## 5. Validation engine (packages/core)

Runs at proposal time **and again** right before posting (masters may have changed). It's pure, deterministic and heavily unit-tested.

- Company is in `WRITE_ALLOWED_COMPANIES`; voucher type is in `ALLOWED_VOUCHER_TYPES`.
- Party ledger exists exactly and is in the correct group (Sundry Creditors for purchases, Sundry Debtors for sales).
- Every stock item exists exactly; the unit matches the item's base/alternate unit; qty > 0 with sane decimals.
- Rate comes from our source of truth (Tally price level / standard rate, or for purchase invoices the linked PO). Claude's rate is only compared. Variance over a configurable % → warning shown prominently in the approval UI.
- GST: intra-state (CGST+SGST) vs inter-state (IGST) is decided from the party's state/GSTIN vs our company's state (Gujarat). Rates come from the item's GST details in Tally. Round-off is handled the way Tally does it. `// VERIFY-ON-TALLY`
- Date falls inside the open financial year and isn't before any books-lock date.
- Totals recomputed and internally consistent (lines + tax + round-off = total).
- Duplicate check: same party + same date + same total within N days → warning; same reference → hard block.
- Amount above `SECOND_APPROVAL_THRESHOLD_INR` → needs two different approvers.
- Each failure returns a specific, human-readable reason and, for master mismatches, the closest candidates so Claude can ask the user to pick.

---

## 6. Desktop approval app (apps/desktop)

Electron + React + TypeScript. Simple, clear and fast. It runs on the Tally server or a LAN PC.

- **Login:** named users with roles: `viewer`, `approver`, `admin`. PIN or password, hashed. Every action is attributed to a user.
- **Queue screen:** pending proposals with type, party, total, created time, warnings badge.
- **Preview screen:** looks like a Tally voucher. Party, GSTIN, date, voucher type, each line (item, qty, unit, rate, amount), tax breakup, round-off and total. Side by side: *what Claude suggested* vs *what will be posted*, with differences highlighted. All warnings in a red/amber box. Shows "Will be posted as OPTIONAL voucher" when applicable.
- **Actions:** Approve (with confirmation) / Reject (reason required). There is no edit in v1. To change something, reject it and ask Claude for a new proposal.
- **After posting:** shows the Tally voucher number, the verification result, and a link to the audit entry. FAILED_VERIFY is shown as a blocking alert.
- **Audit viewer:** searchable and filterable, with an export to CSV.
- **Settings + health:** Tally connection test, companies, write kill switch (admin only), whitelists, thresholds.
- Windows notifications when a new proposal arrives.
- Package with electron-builder as a Windows installer.

---

## 7. Phased delivery. Stop after each phase for my review.

**Phase 0: Scaffold & connectivity**
- Monorepo, linting, formatting, Vitest, GitHub Actions CI (lint + typecheck + tests).
- `tally-client` with `health()`, `mock-tally` server, `capture-fixtures` script with clear instructions.
- `docs/SETUP-WINDOWS.md`: enabling Tally's XML port, installing Node, running the capture script, Claude Desktop config JSON for the stdio server.

**Phase 1: Read-only MCP server**
- All read tools from section 4, tested against fixtures through mock-tally.
- Claude Desktop config example; optional `.mcpb` one-click bundle.
- No writes anywhere.

**Phase 2: Proposals + approval app + Purchase Orders**
- db package, validation engine, `propose_purchase_order`, desktop app, poster for Purchase Order vouchers only, read-back verification, audit log.
- Unit tests for every validation rule. A test proves the mcp-server cannot import `poster`.

**Phase 3: Invoices**
- `propose_sales_invoice`, `propose_purchase_invoice` (with PO linking), posted as Optional vouchers by default, plus GST tests (intra/inter-state, mixed rates, round-off).

**Phase 4: Remote access (claude.ai web & mobile)**
- Streamable HTTP transport for the MCP server with OAuth (or a strong-secret auth) suitable for a claude.ai custom connector.
- Deployment guide: MCP server on a Linux VPS behind Nginx + HTTPS, reaching Tally's port 9000 through an auto-reconnecting SSH tunnel or WireGuard. Tally's port is never public.
- Rate limiting, request logging, and the same proposal-only write model (approvals still happen in the desktop app).

---

## 8. Quality bar

- Strict TypeScript, no `any` in core/poster. Zod schemas for every tool input and every parsed Tally response.
- Tests: unit tests for builders/parsers/validation, fixture-based integration tests via mock-tally, and a golden-file test for every voucher XML the poster can generate.
- Errors are explicit and readable. Never swallow a Tally error. If Tally is unreachable, tools say so plainly.
- No secrets in the repo; `.env.example` only.
- Small, reviewable commits with clear messages; open a PR per phase with a summary and a checklist of `VERIFY-ON-TALLY` items.

---

## 9. Before you start coding

1. Restate the plan back to me in under 15 bullet points.
2. List your open questions. At minimum ask about: our exact voucher type names in Tally, whether we use price levels, godowns, batch/expiry tracking (likely, since we're a food business), multiple GST registrations, and the names of our live vs test companies.
3. Then begin **Phase 0** only.
