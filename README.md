# Tally Bridge

Lets Claude read data from TallyPrime and prepare purchase orders and invoices **without ever
posting an unreviewed entry**. Claude only creates _proposals_; a person approves each one in a
desktop app before it is posted, and every posted voucher is read back and verified.

> **Status: Phase 0 (scaffold & connectivity).** Nothing in this repository writes to Tally yet.

- Rules every contributor (human or Claude) must follow: [`CLAUDE.md`](CLAUDE.md)
- Full specification: [`docs/SPEC.md`](docs/SPEC.md)
- Windows/Tally setup and fixture capture: [`docs/SETUP-WINDOWS.md`](docs/SETUP-WINDOWS.md)
- Things still to confirm on real Tally: [`docs/VERIFY.md`](docs/VERIFY.md)
- MCP tools (planned): [`docs/TOOLS.md`](docs/TOOLS.md)

## Development

Requires Node 20+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm check       # lint, format check, typecheck, tests
pnpm mock-tally  # fake Tally on http://127.0.0.1:9000
```
