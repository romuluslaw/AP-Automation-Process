/**
 * Builds a Xero "Import Bills" CSV from every Staging row marked
 * "Ready", saves it to the Processed folder, and flags those rows
 * "Exported" so they're never included twice.
 *
 * Column order matches Xero's Purchase Bill CSV template. Before your
 * first real export, go to Xero → Business → Bills to pay → Import →
 * Download template, and confirm your org hasn't customized the
 * headers, AccountCode values, or TaxType labels — those must match
 * exactly or the whole file is rejected.
 */
function exportReadyRowsToXeroCsv() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.STAGING_TAB);
  const data = sheet.getDataRange().getValues();
  data.shift(); // header row

  const XERO_HEADER = ['ContactName', 'InvoiceNumber', 'Reference', 'InvoiceDate', 'DueDate',
    'Description', 'Quantity', 'UnitAmount', 'AccountCode', 'TaxType'];
  const rows = [XERO_HEADER];
  const exportedRowIndexes = [];

  data.forEach((row, i) => {
    const [status, vendor, invoiceNo, date, dueDate, netAmount, , glAccount, taxType] = row;
    if (status !== 'Ready') return;

    rows.push([
      vendor,
      invoiceNo,
      '', // Reference — optional, e.g. your internal PO number
      formatXeroDate_(date),
      formatXeroDate_(dueDate),
      `Invoice ${invoiceNo}`,
      1,
      netAmount,
      glAccount,
      taxType || CONFIG.DEFAULT_TAX_TYPE
    ]);
    exportedRowIndexes.push(i + 2); // +2 = header row offset + 1-indexed sheet rows
  });

  if (rows.length === 1) {
    SpreadsheetApp.getUi().alert('No rows marked "Ready" to export.');
    return;
  }

  const csv = rows.map(r => r.map(csvEscape_).join(',')).join('\n');
  const fileName = `Xero_Bills_Import_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm')}.csv`;
  DriveApp.getFolderById(CONFIG.PROCESSED_FOLDER_ID).createFile(fileName, csv, MimeType.CSV);

  exportedRowIndexes.forEach(r => sheet.getRange(r, 1).setValue('Exported'));
  SpreadsheetApp.getUi().alert(
    `Exported ${rows.length - 1} bill(s) → ${fileName}\n` +
    `Upload it in Xero: Business > Bills to pay > Import from CSV.`
  );
}

function formatXeroDate_(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d) ? dateStr : Utilities.formatDate(d, Session.getScriptTimeZone(), CONFIG.XERO_DATE_FORMAT);
}

function csvEscape_(val) {
  const s = String(val === null || val === undefined ? '' : val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
