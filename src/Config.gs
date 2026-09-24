/**
 * ============================================================
 *  CONFIG.gs — Central configuration for the Payables Automation
 * ============================================================
 *  Fill these in once after following docs/SETUP.md, then every
 *  other file reads from here. Nothing else needs editing.
 */
const CONFIG = {
  // Drive folder IDs — create the 3 folders first, then paste each ID
  // (the long string after /folders/ in the folder's URL).
  INCOMING_FOLDER_ID: 'PASTE_INCOMING_FOLDER_ID',    // emailed + scanned invoices land here
  PROCESSED_FOLDER_ID: 'PASTE_PROCESSED_FOLDER_ID',  // renamed, successfully-parsed invoices
  REVIEW_FOLDER_ID: 'PASTE_REVIEW_FOLDER_ID',        // low-confidence extractions for a human check

  // The Control Sheet — create it with the 2 tabs described in README, paste its ID
  SHEET_ID: 'PASTE_CONTROL_SHEET_ID',
  STAGING_TAB: 'Staging',
  VENDOR_TAB: 'VendorMap',

  // Gmail label applied to invoice emails (set up a Gmail filter that
  // auto-labels mail from your AP inbox/alias with this label)
  GMAIL_LABEL: 'Payables/ToProcess',
  GMAIL_DONE_LABEL: 'Payables/Downloaded',

  // GST — adjust to your current jurisdiction's rate, used only as a
  // fallback when the OCR text doesn't contain an explicit GST line
  GST_RATE: 0.09,

  // Xero purchase-bill CSV export settings
  XERO_DATE_FORMAT: 'dd/MM/yyyy', // must match Xero Settings > General Settings > Date Format
  DEFAULT_TAX_TYPE: 'Tax on Purchases', // must match an exact Tax Rate name in your Xero org
  DEFAULT_ACCOUNT_CODE: '429', // NOT auto-applied — GL Account is left blank for any vendor
                                // not found in VendorMap. Kept here only if you want to wire
                                // it back in yourself as a fallback.
  DEFAULT_CREDIT_TERM_DAYS: 30
};
