/**
 * Writes one extracted invoice to the Staging tab — this tab IS the
 * "accounting system" staging area. Nothing gets keyed by hand; a
 * human only reviews rows marked "Needs Review" against the source file.
 *
 * Staging tab columns (row 1 headers):
 * Status | Vendor | Invoice No | Date | Due Date | Net Amount |
 * GST Amount | GL Account | Tax Type | Credit Term (days) | File Link | Notes
 */
function logToStaging_(extracted, file) {
  const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.STAGING_TAB);

  // Store real Date objects (not strings) so the cell format below controls
  // display consistently, and the value stays sortable/usable downstream —
  // the Xero export step re-reads and reformats these the same way either way.
  const dateObj = extracted.date ? new Date(extracted.date) : '';
  const dueDateObj = extracted.date
    ? addDaysToDate_(extracted.date, parseInt(extracted.creditTerm, 10) || CONFIG.DEFAULT_CREDIT_TERM_DAYS)
    : '';

  sheet.appendRow([
    extracted.status,
    extracted.vendor,
    extracted.invoiceNo,
    dateObj,
    dueDateObj,
    extracted.netAmount,
    extracted.gstAmount,
    extracted.glAccount,
    extracted.taxType || CONFIG.DEFAULT_TAX_TYPE,
    extracted.creditTerm,
    file.getUrl(),
    extracted.confidence === 'low' ? 'Auto-extraction incomplete — verify against source file' : ''
  ]);

  // Force DD-MMM-YYYY display on the Date (col 4) and Due Date (col 5) cells
  // of the row just written, regardless of the sheet's default formatting.
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 4, 1, 2).setNumberFormat('dd-mmm-yyyy');
}

function addDaysToDate_(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + days);
  return d; // real Date object — logToStaging_ handles formatting
}
