/**
 * Adds a "Payables Automation" menu to the Control Sheet, and sets up
 * the hourly trigger that runs the pipeline with no one touching it.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Payables Automation')
    .addItem('1. Pull new invoice emails', 'ingestEmailInvoices')
    .addItem('2. Process incoming folder (OCR + extract)', 'processIncomingFolder')
    .addSeparator()
    .addItem('Run full pipeline now', 'runFullPipeline')
    .addSeparator()
    .addItem('Export "Ready" rows to Xero CSV', 'exportReadyRowsToXeroCsv')
    .addSeparator()
    .addItem('⚙ Install hourly auto-run trigger', 'installTriggers')
    .addToUi();
}

function runFullPipeline() {
  ingestEmailInvoices();
  processIncomingFolder();
}

/** Run once from the editor (not the menu) to authorize + schedule the pipeline. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runFullPipeline').timeBased().everyHours(1).create();
  SpreadsheetApp.getUi().alert('Installed: runFullPipeline will now run automatically every hour.');
}
