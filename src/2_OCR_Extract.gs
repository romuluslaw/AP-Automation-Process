/**
 * Solves pain point #2 (manually opening every invoice to read the
 * details) and part of #3 (time spent renaming + keying).
 *
 * For every file sitting in the Incoming folder — whether it arrived
 * by email or was manually scanned in — this:
 *   1. OCRs it into a throwaway Google Doc (Drive's built-in OCR, free)
 *   2. Rule-based parsing of the OCR text pulls vendor, invoice no.,
 *      date, net amount and GST, and looks up GL account / tax type /
 *      credit term from the VendorMap tab
 *   3. Renames the file to "Vendor_InvoiceNo_Date" and files it into
 *      Processed (high confidence) or Review (missing a required field)
 *   4. Logs one row to the Staging tab
 *
 * Requires: Apps Script editor → Services (+) → add "Drive API" (v3 —
 * v2 was retired) so Drive.Files.create(...) works.
 */
function processIncomingFolder() {
  const incoming = DriveApp.getFolderById(CONFIG.INCOMING_FOLDER_ID);
  const files = incoming.getFiles();
  const vendorMap = loadVendorMap_();

  while (files.hasNext()) {
    const file = files.next();
    try {
      const ocrText = ocrFile_(file);
      const extracted = parseInvoiceText_(ocrText, vendorMap);

      file.setName(buildFileName_(extracted, file));
      const targetFolder = DriveApp.getFolderById(
        extracted.confidence === 'low' ? CONFIG.REVIEW_FOLDER_ID : CONFIG.PROCESSED_FOLDER_ID
      );
      targetFolder.addFile(file);
      incoming.removeFile(file);

      logToStaging_(extracted, file);
    } catch (err) {
      Logger.log(`Failed on "${file.getName()}": ${err}`);
    }
  }
}

function ocrFile_(file) {
  // v3 Drive advanced service: method is Files.create (not .insert), and the
  // resource field is "name" (not "title"). OCR fires automatically when an
  // image/PDF is converted to a Google Doc — ocrLanguage is just a hint,
  // there's no separate "ocr: true" flag in v3.
  const resource = { name: 'OCR_TEMP_' + file.getName(), mimeType: MimeType.GOOGLE_DOCS };
  const ocrDoc = Drive.Files.create(resource, file.getBlob(), { ocrLanguage: 'en' });
  const text = DocumentApp.openById(ocrDoc.id).getBody().getText();
  DriveApp.getFileById(ocrDoc.id).setTrashed(true); // clean up the temp OCR doc
  return text;
}

function parseInvoiceText_(text, vendorMap) {
  const result = {
    // glAccount starts blank on purpose: it should only ever come from a
    // matched VendorMap row, never a hardcoded fallback, so an unknown
    // vendor never gets mis-coded to someone else's GL account.
    vendor: 'UnknownVendor', invoiceNo: 'NA', date: null,
    netAmount: null, gstAmount: null, glAccount: '',
    taxType: null, creditTerm: String(CONFIG.DEFAULT_CREDIT_TERM_DAYS), confidence: 'low'
  };

  // Vendor — match against known aliases so "ABC Pte Ltd" and "ABC Ltd" both resolve
  for (const v of vendorMap) {
    if (v.aliases.some(a => a && text.toLowerCase().includes(a.toLowerCase()))) {
      result.vendor = v.standardName;
      result.glAccount = v.glAccount || ''; // still blank if the VendorMap row itself has no GL code
      result.taxType = v.taxType || CONFIG.DEFAULT_TAX_TYPE;
      result.creditTerm = v.creditTerm || result.creditTerm;
      break;
    }
  }

  // Invoice number — "no/number/#" after "invoice"/"inv" is mandatory (not
  // optional) so this can't match the bare word "Invoice" off a "TAX INVOICE"
  // heading, and the captured value must contain a digit as a sanity check.
  const invMatch = text.match(/\b(?:invoice|inv)\.?\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{2,19})/i);
  if (invMatch && /\d/.test(invMatch[1])) result.invoiceNo = invMatch[1].trim();

  // Date — parsed explicitly as day-first (DD/MM/YYYY, DD-MM-YYYY, or
  // "12 Jan 2026" style). Deliberately NOT handed to JS's native Date()
  // parser: it assumes US MM/DD/YYYY for slash-separated dates, which
  // silently swaps day/month, or returns Invalid Date (→ 1-Jan-1970 once
  // written to a cell) whenever the day is >12.
  const parsedDate = extractDate_(text);
  if (parsedDate) result.date = Utilities.formatDate(parsedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // Amounts — look for explicit Net / GST / Total lines
  const netMatch = text.match(/(?:net\s*amount|sub-?total)[:\s]*\$?\s*([\d,]+\.\d{2})/i);
  const gstMatch = text.match(/(?:gst|tax)(?:\s*\d{1,2}\s*%)?[:\s]*\$?\s*([\d,]+\.\d{2})/i);
  const totalMatch = text.match(/(?:total\s*amount\s*due|grand\s*total|total)[:\s]*\$?\s*([\d,]+\.\d{2})/i);

  if (netMatch) result.netAmount = parseFloat(netMatch[1].replace(/,/g, ''));
  if (gstMatch) result.gstAmount = parseFloat(gstMatch[1].replace(/,/g, ''));
  if (!result.netAmount && totalMatch && result.gstAmount) {
    result.netAmount = round2_(parseFloat(totalMatch[1].replace(/,/g, '')) - result.gstAmount);
  }
  if (!result.gstAmount && result.netAmount) {
    result.gstAmount = round2_(result.netAmount * CONFIG.GST_RATE);
  }

  // Confidence gate — every required field must be present to auto-flag "Ready"
  const complete = result.vendor !== 'UnknownVendor' && result.invoiceNo !== 'NA' &&
                    result.date && result.netAmount;
  result.confidence = complete ? 'high' : 'low';
  result.status = complete ? 'Ready' : 'Needs Review';
  return result;
}

function round2_(n) { return Math.round(n * 100) / 100; }

const MONTH_NAMES_ = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

/**
 * Day-first date extraction. Tries numeric DD/MM/YYYY (or DD-MM-YYYY)
 * first, then falls back to "12 Jan 2026" / "12-Jan-2026" style. Returns
 * a real Date object built from explicit day/month/year components —
 * never from the ambiguous native Date(string) parser.
 */
function extractDate_(text) {
  let m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (m) {
    const dd = parseInt(m[1], 10), mm = parseInt(m[2], 10), yyyy = normalizeYear_(m[3]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return new Date(yyyy, mm - 1, dd);
  }
  m = text.match(/\b(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-](\d{2,4})\b/);
  if (m) {
    const mi = MONTH_NAMES_[m[2].toLowerCase()];
    if (mi !== undefined) return new Date(normalizeYear_(m[3]), mi, parseInt(m[1], 10));
  }
  return null;
}

function normalizeYear_(y) {
  y = parseInt(y, 10);
  return y < 100 ? y + (y < 70 ? 2000 : 1900) : y;
}

function buildFileName_(extracted, file) {
  const ext = (file.getName().match(/\.[^.]+$/) || [''])[0];
  const safeVendor = extracted.vendor.replace(/[^\w\-]/g, '');
  const safeInv = extracted.invoiceNo.replace(/[^\w\-]/g, '');
  return `${safeVendor}_${safeInv}_${extracted.date || 'nodate'}${ext}`;
}

function loadVendorMap_() {
  const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.VENDOR_TAB);
  const rows = sheet.getDataRange().getValues();
  rows.shift(); // drop header row
  return rows
    .filter(r => r[0])
    .map(r => ({
      standardName: r[0],
      aliases: String(r[1]).split(',').map(s => s.trim()),
      glAccount: r[2],
      taxType: r[3],
      creditTerm: r[4]
    }));
}
