/**
 * Solves pain point #1: "invoices downloaded 1-by-1 from email, risk
 * of missing some." This sweeps every thread under CONFIG.GMAIL_LABEL,
 * saves every PDF/image attachment to the Incoming folder, and
 * re-labels the thread so nothing gets processed twice or skipped.
 *
 * Setup: in Gmail, create a filter matching your AP inbox/alias and
 * have it auto-apply the label CONFIG.GMAIL_LABEL. This script never
 * touches unlabeled mail, so normal inbox use is unaffected.
 */
function ingestEmailInvoices() {
  const label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL);
  if (!label) throw new Error(`Gmail label "${CONFIG.GMAIL_LABEL}" not found — create it in Gmail first.`);
  const doneLabel = getOrCreateLabel_(CONFIG.GMAIL_DONE_LABEL);
  const incomingFolder = DriveApp.getFolderById(CONFIG.INCOMING_FOLDER_ID);

  const threads = label.getThreads(0, 50); // 50/run keeps well under Gmail quotas
  let savedCount = 0;

  threads.forEach(thread => {
    thread.getMessages().forEach(message => {
      message.getAttachments({ includeInlineImages: false }).forEach(att => {
        const type = att.getContentType();
        if (type === 'application/pdf' || type.startsWith('image/')) {
          incomingFolder.createFile(att.copyBlob());
          savedCount++;
        }
      });
    });
    // Move the thread out of the queue immediately so a re-run never re-downloads it
    thread.removeLabel(label);
    thread.addLabel(doneLabel);
  });

  Logger.log(`Ingested ${savedCount} attachment(s) from ${threads.length} thread(s).`);
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
