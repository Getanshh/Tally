# Windows setup (Tally server)

This guide covers Phase 0: enabling Tally's XML port, installing the tools, and capturing
fixtures from the **TEST** company. Phase 1 adds the Claude Desktop configuration (preview at
the end).

> ⚠️ Tally's XML port (9000) has **no authentication**. Anyone who can reach it can read and
> write your books. It must only ever be reachable from the server itself or your office LAN,
> never from the internet. Do not add a port-forward for it on your router.

---

## 1. Create a TEST copy of the company

All development and fixture capture happens on a copy, never on the live company.

1. In TallyPrime, take a backup of the live company (**Data → Backup**).
2. Restore it into a **separate data folder**, for example `D:\TallyData-TEST`
   (**Data → Restore**, choose the new folder as destination).
3. Open the restored copy and rename it so it is unmistakable:
   **Alt+K (Company) → Alter** → change the name to e.g. `Baijay International Private Limited TEST`.
   The capture script refuses to run against a company whose name does not contain `TEST`.
4. Keep the live and test data folders separate so they can't be mixed up.

_(Menu paths differ slightly between TallyPrime releases. If yours doesn't match, the goal is
simply: a restored copy, in its own folder, with "TEST" in the company name.)_

## 2. Enable the XML port

1. In TallyPrime press **F1 (Help) → Settings → Connectivity**.
2. Open **Client/Server configuration** and set:
   - **TallyPrime acts as**: `Server` (or `Both`)
   - **Enable ODBC**: `Yes` (needed on some releases)
   - **Port**: `9000`
3. Save, then **restart TallyPrime**.
4. Check it works: on the server, open a browser at <http://localhost:9000>. You should see
   _"TallyPrime Server is Running"_. (If the text differs, note it in `docs/VERIFY.md`, item T1.)

Tally only answers while it is running with a company open. If staff use Remote Desktop, have
the session that runs Tally **disconnect** rather than **sign out**, or Tally will close.

### Firewall

Only needed if a different LAN PC (not the Tally server itself) will connect. Allow port 9000
**from the local subnet only** (PowerShell as Administrator):

```powershell
New-NetFirewallRule -DisplayName "Tally XML port (LAN only)" -Direction Inbound -Protocol TCP -LocalPort 9000 -RemoteAddress LocalSubnet -Action Allow
```

## 3. Install Node.js, Git and pnpm

PowerShell (as your normal user):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Close and reopen PowerShell, then:

```powershell
corepack enable
node --version    # must be v20 or newer
pnpm --version
```

## 4. Get the code

```powershell
cd C:\
git clone https://github.com/getanshh/tally.git tally-bridge
cd C:\tally-bridge
pnpm install
pnpm test
```

## 5. Capture fixtures from the TEST company

The capture script only **reads** from Tally (every request is checked to be an Export before it
is sent). It records Tally's real answers so the mock server and tests can replay them.

### 5a. Prepare the TEST company (~30 minutes)

Do all of this in the **TEST** company only. Put every voucher in **one month** so a single capture
picks them all up. Give each one a recognisable **Reference** such as `SAMPLE-01`, `SAMPLE-02` and so on.

**Masters and settings first**

- [ ] **Batches:** F11 (Features) → Inventory → turn on batch-wise details, expiry dates and
      manufacturing dates. Then on **2 items**, set _Maintain in batches = Yes_ and _Track
      expiry = Yes_. (TEST only. Turning batches on in the live company is a separate decision.)
- [ ] **Price levels:** check at least **2 price levels** exist, each with a price list for a few
      items. Assign party A to one level and party B to the other. Leave party C with **no** price level.
- [ ] **Standard selling rate** on the items party C will buy.
- [ ] **Parties:** at least one **outside Gujarat**, with a GSTIN from another state, and one whose
      name contains `&` or an apostrophe (e.g. `Ram & Sons`, `Shree Ram's`).
- [ ] **Items:** at least one at **5% GST** and one at **12% or 18%**.
- [ ] **Godowns:** at least 2 in use.

**Vouchers**

| Ref       | Voucher                                                                                                                | What it shows us                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| SAMPLE-01 | **Purchase Order**: one supplier, 2 items, quantity 100 each, with a due date                                          | PO structure and order tracking                     |
| SAMPLE-02 | **Purchase** against SAMPLE-01, receiving only **60** of item 1, one batch item with batch no. + expiry, into godown 2 | PO linking, **partial receipt**, batch/expiry XML   |
| SAMPLE-03 | **Purchase** against SAMPLE-01 for the remaining **40** + item 2                                                       | PO closed by a second receipt                       |
| SAMPLE-04 | **Sales** to party A (Gujarat, price level 1), from godown 2                                                           | CGST + SGST, price-level rate, godown               |
| SAMPLE-05 | **Sales** to the **out-of-state** party                                                                                | IGST                                                |
| SAMPLE-06 | **Sales** to party C (**no price level**)                                                                              | Standard-rate fallback                              |
| SAMPLE-07 | **Sales** with **5% and 18% items together** and quantities that give **odd paise**                                    | Mixed rates, **round-off**                          |
| SAMPLE-08 | **Sales** of a **batch** item, picking a specific batch                                                                | Batch selection on sales                            |
| SAMPLE-09 | **Sales** to the `&` / apostrophe party, saved as an **Optional** voucher                                              | Optional flag, escaping                             |
| SAMPLE-10 | **Purchase** saved as **Optional**                                                                                     | Optional flag on purchases                          |
| SAMPLE-11 | **Receipt** from party A part-paying SAMPLE-04 (bill-wise _Agst Ref_)                                                  | Bills outstanding and ageing                        |
| SAMPLE-12 | Any **Sales**, then **cancel** it                                                                                      | How cancelled vouchers appear (we must ignore them) |

Note each sample's voucher number and total. I'll check that the captured XML says the same.

### 5b. Run the capture

With TallyPrime running and the TEST company **open**:

```powershell
cd C:\tally-bridge
pnpm capture-fixtures --company "Baijay International Private Limited TEST" --from 2026-10-01 --to 2026-10-31
```

- `--company` must match the name in Tally **exactly**.
- `--from/--to` should cover the vouchers you prepared in 5a.
- Add `--host 192.168.x.x` if running from another LAN PC.
- Slow reports? Add `--timeout 300000`.

It prints one line per request and writes a folder `captured-fixtures\<timestamp>\` containing
`*.meta.json`, `*.request.xml`, `*.response.xml` and a `SUMMARY.md`. A line marked
`TALLY ERROR (saved)` is fine — the error itself is useful.

### 5c. Send the fixtures back

The folder contains test-company data (party names, GSTINs, amounts). It is `.gitignore`d so it
is never committed by accident. Review it, then either zip it and share it, or copy it into
`apps\mock-tally\fixtures\captured\` on a branch if you're happy for it to live in this private
repository.

### Try the mock server with your capture

```powershell
pnpm mock-tally --port 9100 --fixtures captured-fixtures\<timestamp>
```

## 6. Claude Desktop configuration (Phase 1 preview)

The MCP server does not exist yet; this is the planned configuration so you can see what's
coming. File: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tally": {
      "command": "node",
      "args": ["C:\\tally-bridge\\apps\\mcp-server\\dist\\index.js"],
      "env": {
        "TALLY_HOST": "127.0.0.1",
        "TALLY_PORT": "9000",
        "DEFAULT_COMPANY": "Baijay International Private Limited TEST",
        "DB_PATH": "C:\\tally-bridge\\data\\tally-bridge.sqlite"
      }
    }
  }
}
```

Restart Claude Desktop after editing. Phase 1 will also offer a one-click `.mcpb` bundle.
