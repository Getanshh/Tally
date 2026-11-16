# MCP tools

> Phase 0: **no MCP server exists yet.** This page lists the planned tools so the shape is
> agreed before Phase 1. Each tool will get its input schema, an example response and its
> failure messages here as it is implemented.

All tools return compact JSON with totals (never raw XML), paginate large results, and say
plainly when Tally is unreachable.

## Read tools (Phase 1) — read from Tally only

| Tool                                           | Purpose                                                                            | Status                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `tally_health`                                 | Connection status, Tally version, loaded companies, active company                 | planned (client side done: `TallyReadClient.health()`) |
| `list_companies`                               | Companies available in Tally                                                       | planned                                                |
| `search_ledgers`                               | Find ledgers by partial name/group → exact name, GUID, group, GSTIN                | planned                                                |
| `search_stock_items`                           | Find items by partial name → exact name, GUID, unit, HSN, GST rate, standard rates | planned                                                |
| `get_trial_balance`                            | Trial balance for a date range                                                     | planned                                                |
| `get_profit_and_loss`                          | P&L for a date range                                                               | planned                                                |
| `get_balance_sheet`                            | Balance sheet as on a date                                                         | planned                                                |
| `get_stock_summary`                            | Closing stock by item / group / godown                                             | planned                                                |
| `get_bills_outstanding`                        | Receivables or payables with ageing (0–30, 31–60, 61–90, 90+)                      | planned                                                |
| `get_ledger_statement`                         | Vouchers for a ledger in a date range                                              | planned                                                |
| `get_sales_register` / `get_purchase_register` | Filter by party, item, date range                                                  | planned                                                |
| `get_voucher`                                  | One voucher by number / GUID / reference                                           | planned                                                |
| `get_day_book`                                 | Vouchers in a date range, optionally by type                                       | planned                                                |

## Proposal tools (Phases 2–3) — never touch Tally

| Tool                       | Purpose                                               | Status            |
| -------------------------- | ----------------------------------------------------- | ----------------- |
| `propose_purchase_order`   | Validate + store a PENDING purchase order proposal    | planned (Phase 2) |
| `propose_sales_invoice`    | Same for sales; rate from price level / standard rate | planned (Phase 3) |
| `propose_purchase_invoice` | Same for purchases; optionally linked to a PO         | planned (Phase 3) |
| `get_proposal_status`      | Status + verification result                          | planned (Phase 2) |
| `list_proposals`           | Recent proposals, filterable by status                | planned (Phase 2) |

Every proposal response ends with a sentence for Claude to relay, e.g.
_"Proposal PO-2026-00042 is waiting for approval in the Tally Bridge app. Nothing has been posted to Tally yet."_
