# Debugging log

This wasn't a one-shot build. Four real bugs surfaced during testing,
each diagnosed from actual output and fixed. Kept here deliberately —
the debugging is the more interesting part of the project.

---

## 1. Drive API v2 retirement

**Symptom:** `TypeError: Drive.Files.insert is not a function` the
first time the OCR step ran.

**Cause:** Google retired the v2 Drive advanced service. The `Files`
resource moved from `.insert()` to `.create()`, and the resource field
renamed from `title` to `name`. v3 also dropped the explicit `ocr: true`
flag — OCR now fires automatically whenever an image/PDF is converted
to a Google Doc; `ocrLanguage` is just a hint.

```diff
- const resource = { title: 'OCR_TEMP_' + file.getName(), mimeType: MimeType.GOOGLE_DOCS };
- const ocrDoc = Drive.Files.insert(resource, file.getBlob(), { ocr: true, ocrLanguage: 'en' });
+ const resource = { name: 'OCR_TEMP_' + file.getName(), mimeType: MimeType.GOOGLE_DOCS };
+ const ocrDoc = Drive.Files.create(resource, file.getBlob(), { ocrLanguage: 'en' });
```

---

## 2. Invoice number extracted as the literal word "Invoice"

**Symptom:** the Staging tab's Invoice No. column, and the renamed
filenames, showed `Invoice` instead of the real number (e.g.
`AceOfficeSuppliesPteLtd_Invoice_2026-02-09.pdf`).

**Cause:** the original regex made `no|number|#` *optional* after the
word "invoice", and its character class allowed plain letters
(case-insensitive). On a document with a `TAX INVOICE` heading above
the real `Invoice No: INV-1001` line, the regex matched the bare word
"Invoice" from the heading and stopped there — never reaching the
actual label.

```diff
- const invMatch = text.match(/(?:invoice\s*(?:no|number|#)?[:\s]*)([A-Z0-9\-\/]{3,20})/i);
- if (invMatch) result.invoiceNo = invMatch[1].trim();
+ // "no/number/#" after "invoice"/"inv" is now mandatory, and the
+ // captured value must contain a digit as a sanity check.
+ const invMatch = text.match(/\b(?:invoice|inv)\.?\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{2,19})/i);
+ if (invMatch && /\d/.test(invMatch[1])) result.invoiceNo = invMatch[1].trim();
```

---

## 3. Unmatched vendors silently got a real GL account

**Symptom:** an invoice from a vendor not in `VendorMap` was flagged
"Needs Review" as expected, but still had `429` populated in the GL
Account column — a real account code that belonged to other vendors.

**Cause:** the parser fell back to a hardcoded `CONFIG.DEFAULT_ACCOUNT_CODE`
whenever no vendor matched, instead of only ever pulling the GL account
from a matched `VendorMap` row.

```diff
  const result = {
    vendor: 'UnknownVendor', invoiceNo: 'NA', date: null,
-   netAmount: null, gstAmount: null, glAccount: CONFIG.DEFAULT_ACCOUNT_CODE,
+   netAmount: null, gstAmount: null, glAccount: '', // blank until a vendor actually matches
    ...
  };
  for (const v of vendorMap) {
    if (v.aliases.some(a => a && text.toLowerCase().includes(a.toLowerCase()))) {
      result.vendor = v.standardName;
-     result.glAccount = v.glAccount || CONFIG.DEFAULT_ACCOUNT_CODE;
+     result.glAccount = v.glAccount || ''; // still blank if the VendorMap row itself has no GL code
      ...
    }
  }
```

---

## 4. Dates silently swapped day and month, or collapsed to 1-Jan-1970

**Symptom:** two different failure patterns in the same batch. Some
rows showed `01-Jan-1970` (Greenleaf, Metro Logistics). Others showed
a plausible-looking but wrong date — a 1 September invoice logged as
9 January (BluePrint Design); a 10 September invoice logged as 9
October (Skyline IT).

**Cause:** the date substring was handed to JavaScript's native
`new Date(string)`. For slash-separated dates, `Date()` assumes
**US month-first order (MM/DD/YYYY)**, not the day-first format
(DD/MM/YYYY) the source invoices actually use:
- When the day number was >12 (e.g. `20/08/2026`), there's no valid
  month 20, so `Date()` returned an Invalid Date — which serializes
  as epoch zero (1-Jan-1970) once written to a Sheets cell.
- When both numbers were ≤12 (e.g. `01/09/2026`, meant as 1 Sep),
  `Date()` didn't fail — it just silently parsed day and month in the
  wrong order (January 9th instead of September 1st).

```diff
- function normalizeDate_(raw) {
-   const d = new Date(raw);
-   return isNaN(d) ? raw : Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
- }
+ // Explicit day-first parsing — never handed to the ambiguous native
+ // Date(string) parser.
+ function extractDate_(text) {
+   let m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
+   if (m) {
+     const dd = parseInt(m[1], 10), mm = parseInt(m[2], 10), yyyy = normalizeYear_(m[3]);
+     if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return new Date(yyyy, mm - 1, dd);
+   }
+   m = text.match(/\b(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-](\d{2,4})\b/);
+   if (m) {
+     const mi = MONTH_NAMES_[m[2].toLowerCase()];
+     if (mi !== undefined) return new Date(normalizeYear_(m[3]), mi, parseInt(m[1], 10));
+   }
+   return null;
+ }
```

**Known limitation this doesn't solve:** this assumes every invoice is
day-first. A vendor that genuinely uses US-style MM/DD/YYYY would now
be misread the other way — a case where the ambiguity can't be
resolved from the text alone. Planned fix: a per-vendor date-format
column in `VendorMap` (see the main README's roadmap).
