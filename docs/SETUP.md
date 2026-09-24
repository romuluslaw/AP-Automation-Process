# Setup

About 20 minutes, one-time.

## 1. Drive folders

Create three folders in Google Drive:
- `Payables/Incoming`
- `Payables/Processed`
- `Payables/Review`

Open each and copy its ID from the URL (the string after `/folders/`)
into `src/Config.gs`.

## 2. Control Sheet

New Google Sheet, two tabs:

**Staging** — header row:
`Status | Vendor | Invoice No | Date | Due Date | Net Amount | GST Amount | GL Account | Tax Type | Credit Term | File Link | Notes`

**VendorMap** — header row:
`Standard Name | Aliases (comma-separated) | GL Account | Tax Type | Credit Term (days)`
Paste the rows from `sample-data/VendorMap_seed.csv` underneath to seed it
with the 5 vendors the sample invoices use.

Copy the Sheet's ID into `Config.gs`.

## 3. Gmail label

Create the label `Payables/ToProcess` and a Gmail filter that
auto-applies it to your AP inbox/alias.

## 4. Apps Script project

Open the Control Sheet → Extensions → Apps Script. Create one script
file per file in `src/` and paste in the matching code.

In the editor: Services (+) → add **Drive API** (v3 only is offered —
this is what the OCR step uses).

## 5. Authorize and schedule

Run `installTriggers` once from the editor (approve the permissions
prompt). This schedules the full pipeline to run hourly. A **Payables
Automation** menu also appears in the Sheet for manual runs.

## 6. Verify it works

Follow [`TESTING.md`](TESTING.md) using the 12 sample invoices in
`sample-data/test-invoices/` — 9 should process cleanly, 3 are
deliberately broken to prove the review workflow catches what it
should.

## GL account and GST

GL account (including the Balance Sheet side, e.g. GST input tax) is
looked up per vendor from the `VendorMap` tab — fill it in once per
supplier. GST is read directly off the invoice text when present;
otherwise it falls back to `CONFIG.GST_RATE`. Always check rows
flagged "Needs Review."
