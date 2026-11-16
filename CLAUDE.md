# CLAUDE.md — Tally ↔ Claude bridge

Production tool for Baijay International Pvt Ltd (brand: Charliee). Lets Claude **read** TallyPrime
data and **propose** accounting entries that a human approves before anything reaches the books.
Full brief: [`docs/SPEC.md`](docs/SPEC.md). Business decisions (price levels, godowns, batches, PO
linking, etc.): [`docs/DECISIONS.md`](docs/DECISIONS.md). Items still unconfirmed against real Tally: [`docs/VERIFY.md`](docs/VERIFY.md).

## Non-negotiable safety rules

1. **The MCP server never writes to Tally.** It reads from Tally and writes _proposals_ to the local
   SQLite DB. Only the desktop approval app posts, and only after a human clicks **Approve**.
   Enforced structurally:
   - `apps/mcp-server` must not import `@tally-bridge/poster` or `@tally-bridge/tally-client/transport`
     (ESLint `no-restricted-imports` in `eslint.config.js`, plus an architecture test from Phase 2).
   - `TallyReadClient` runs `assertReadOnlyEnvelope()` on every request; the raw `TallyTransport`
     is not exported from the package's main entry point.
2. **Claude never supplies authoritative numbers.** Rates, tax and totals are recomputed by our code
   from Tally masters/price lists. Claude's amounts are stored only for display and comparison.
3. **No guessing masters.** Party ledgers, stock items, godowns, units and voucher types must match an
   existing Tally master exactly (GUID/name). No exact match → reject and return candidates.
   Never auto-create masters.
4. **No delete or alter tools**, in any phase, unless the owner explicitly asks later.
5. **Whitelists everywhere:** `ALLOWED_VOUCHER_TYPES`, `WRITE_ALLOWED_COMPANIES`, and the global kill
   switch `TALLY_WRITE_ENABLED=false` by default.
6. **Idempotency:** every proposal has a unique reference written into the voucher. Before posting,
   check Tally for an existing voucher with that reference. Retries must never duplicate.
   The transport never retries imports (`retries: 0`); a timed-out import is "unknown", not "failed".
7. **Verify after every post:** read the voucher back and compare party, date, every line (item, qty,
   rate, amount), tax and total. Any mismatch → `FAILED_VERIFY`, loud UI alert, human handles it.
   Never auto-fix.
8. **Invoices go in as Optional vouchers** unless config explicitly allows direct posting for that type.
9. **Append-only audit log** of everything: tool calls, Claude's raw inputs, validation results,
   approver, XML sent, Tally's raw response, verification result.
10. **Test company only** for development and integration testing. Never the live company
    (`Baijay International Private Limited`).
    (`scripts/capture-fixtures.ts` refuses company names without "TEST" unless explicitly confirmed.)

## Working conventions

- You (Claude Code) cannot reach the real Tally server. Test against `apps/mock-tally` + fixtures.
  Never claim something works on real Tally.
- Anything not confirmed against real Tally gets a `// VERIFY-ON-TALLY` comment **and** an entry in
  `docs/VERIFY.md`.
- All Tally tag names, report IDs and TDL expressions live in `packages/tally-client/src/names.ts`.
  Don't hard-code them elsewhere.
- Money is integer paise (`parseTallyAmount`, `formatPaise`); never floating-point arithmetic on amounts.
- Dates in XML are `YYYYMMDD` (`toTallyDate` / `fromTallyDate`). Every company-scoped request sets
  `SVCURRENTCOMPANY` explicitly.
- Strict TypeScript; no `any`. Zod schemas for every tool input and parsed Tally response.
- Never swallow a Tally error. If Tally is unreachable, say so plainly.
- No secrets in the repo (`.env.example` only).
- Work in phases (see SPEC §7); stop for review after each. Small commits, one PR per phase with a
  `VERIFY-ON-TALLY` checklist.

## Commands

```bash
pnpm install
pnpm check         # lint + format check + typecheck + tests
pnpm test
pnpm mock-tally    # fake Tally on 127.0.0.1:9000 using synthetic fixtures
pnpm capture-fixtures --company "<TEST company>"   # run on the Tally server only
```

## Layout

- `packages/tally-client` — XML-over-HTTP client (envelopes, encoding, parsing, serialised transport, health)
- `apps/mock-tally` — fixture-replaying fake Tally
- `scripts/capture-fixtures.ts` — records real responses from the TEST company
- Planned: `packages/core`, `packages/db`, `packages/poster`, `apps/mcp-server`, `apps/desktop`
