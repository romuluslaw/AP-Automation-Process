# Testing

12 mock invoices are included in `sample-data/test-invoices/`: 9
should sail through as "Ready", 3 are deliberately broken so you can
prove the automation catches real-world mess instead of silently
mis-keying it. Complete [`SETUP.md`](SETUP.md) first — this assumes
the Drive folders, Control Sheet, and script are already in place.

## 1. Drive-only test run (do this first)

This tests the OCR + extraction engine without touching Gmail.

1. Upload all 12 PDFs from `sample-data/test-invoices/` directly into
   `Payables/Incoming` (drag-and-drop in Drive works fine).
2. In the Apps Script editor, run `processIncomingFolder` (the run
   button) — approve the permissions prompt the first time. This is
   the same function the hourly trigger calls later.
3. Check the results against the table below.

## 2. Gmail test run (optional but recommended)

This proves the email side actually works — invoices arriving by mail
get swept up automatically, not downloaded one at a time.

1. In Gmail, create the label `Payables/ToProcess` and a filter that
   auto-applies it (e.g. filter on subject contains "invoice").
2. Email yourself 2-3 of the PDFs from `sample-data/test-invoices/` as
   attachments, with a subject line matching your filter.
3. Run `ingestEmailInvoices`. Confirm the attachments appear in
   `Payables/Incoming` and the thread's label flips from
   `Payables/ToProcess` to `Payables/Downloaded`.
4. Run `processIncomingFolder` to carry them through the rest of the
   pipeline, same as step 1.

## 3. Expected results

| File | Expected folder | Expected Staging status | Why |
|---|---|---|---|
| 01–09 (Ace, Skyline, Greenleaf, Metro, BluePrint) | `/Processed` | **Ready** | Known vendor, invoice no., date, and amounts all present |
| `10_FAIL_UnknownVendor_Northwind.pdf` | `/Review` | **Needs Review** | Vendor not in `VendorMap` — nothing to auto-match |
| `11_FAIL_MissingInvoiceNo_AceOffice.pdf` | `/Review` | **Needs Review** | Known vendor, but no invoice number anywhere on the document |
| `12_FAIL_MissingAmounts_SkylineIT.pdf` | `/Review` | **Needs Review** | Known vendor + invoice number, but no Net/GST/Total in `$X.XX` format |

If all 9 land in `/Processed` marked "Ready" and all 3 land in
`/Review` marked "Needs Review" with the `Notes` column flagging
incomplete extraction, the pipeline is working exactly as designed —
that 9/12 vs 3/12 split is the actual proof point: it's not just "it
works," it's "it knows what it doesn't know."

Also spot-check one Processed file's renamed filename, e.g.
`01_AceOffice_INV-1001.pdf` should become something like
`AceOfficeSuppliesPteLtd_INV-1001_2026-08-05.pdf`.

## 4. Test the Xero export

In the Sheet, use the **Payables Automation** menu → "Export 'Ready'
rows to Xero CSV". You should get an alert confirming 9 bills exported,
and a new CSV in `/Processed` with headers `ContactName, InvoiceNumber,
Reference, InvoiceDate, DueDate, Description, Quantity, UnitAmount,
AccountCode, TaxType` — open it to confirm all 9 rows are there and
the 3 "Needs Review" rows are correctly excluded.

## 5. Reset between test runs

Clear the Staging tab (keep the header row), move all files back from
`/Processed` and `/Review` into `/Incoming`, and re-run
`processIncomingFolder`.
