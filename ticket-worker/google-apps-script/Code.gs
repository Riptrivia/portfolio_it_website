const CONFIG = {
  workerUrl: PropertiesService.getScriptProperties().getProperty("WORKER_URL"),
  webhookSecret: PropertiesService.getScriptProperties().getProperty("GMAIL_WEBHOOK_SECRET"),
  supportAddress: "pestcoe.zfix@gmail.com",
  intakeLabel: "ZFix/New-Ticket",
  processedLabel: "ZFix/Processed",
  subjectPrefix: "Support request:"
};

function setupZFix() {
  if (!CONFIG.workerUrl || !CONFIG.webhookSecret) throw new Error("Set WORKER_URL and GMAIL_WEBHOOK_SECRET in Apps Script properties first.");
  getOrCreateLabel_(CONFIG.intakeLabel);
  getOrCreateLabel_(CONFIG.processedLabel);
  ScriptApp.getProjectTriggers().filter((trigger) => trigger.getHandlerFunction() === "syncZFix").forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("syncZFix").timeBased().everyMinutes(5).create();
  syncZFix();
}

function syncZFix() {
  importNewTickets_();
  sendPendingMessages_();
}

function importNewTickets_() {
  const processed = getOrCreateLabel_(CONFIG.processedLabel);
  const query = `to:${CONFIG.supportAddress} {subject:"${CONFIG.subjectPrefix}" subject:"Appointment request:"} -label:"${CONFIG.processedLabel}"`;
  GmailApp.search(query, 0, 20).forEach((thread) => {
    thread.getMessages().forEach((message) => {
      if (message.isDraft() || message.getFrom().indexOf(CONFIG.supportAddress) >= 0) return;
      const parsed = parseTicket_(message.getPlainBody());
      if (!parsed) return;
      parsed.gmailMessageId = message.getId();
      if (!parsed.customerEmail) parsed.customerEmail = extractEmail_(message.getFrom());
      const response = workerRequest_("/internal/gmail/intake", "post", parsed);
      if (response.status === "created" || response.status === "duplicate") thread.addLabel(processed);
    });
  });
}

function sendPendingMessages_() {
  const response = workerRequest_("/internal/gmail/outbox", "get");
  (response.messages || []).forEach((message) => {
    try {
      GmailApp.sendEmail(message.recipient, message.subject, message.text_body, { name: "Marcielo — ZFix Support", replyTo: CONFIG.supportAddress });
      workerRequest_("/internal/gmail/outbox", "post", { id: message.id, status: "sent" });
    } catch (error) {
      workerRequest_("/internal/gmail/outbox", "post", { id: message.id, status: "failed", error: String(error) });
    }
  });
}

function parseTicket_(body) {
  if (body.indexOf("SELF-SERVICE SUPPORT TICKET") < 0 && body.indexOf("SUPPORT APPOINTMENT REQUEST") < 0) return null;
  const value = (label) => {
    const match = body.match(new RegExp(`^${label}:\\s*(.+)$`, "mi"));
    return match ? match[1].trim() : "";
  };
  const descriptionMatch = body.match(/DESCRIPTION\s*\n([\s\S]*?)(?:\n\s*APPOINTMENT PREFERENCE|\n\s*Created:|$)/i);
  return {
    customerName: value("Requester"),
    customerEmail: value("Email"),
    customerPhone: value("Phone"),
    device: value("Device"),
    category: value("Category"),
    urgency: value("Urgency"),
    summary: value("Summary"),
    description: descriptionMatch ? descriptionMatch[1].trim() : ""
  };
}

function workerRequest_(path, method, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: { "X-Webhook-Secret": CONFIG.webhookSecret },
    contentType: "application/json"
  };
  if (payload !== undefined) options.payload = JSON.stringify(payload);
  const response = UrlFetchApp.fetch(CONFIG.workerUrl.replace(/\/$/, "") + path, options);
  const text = response.getContentText();
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error(`Worker ${path} failed (${response.getResponseCode()}): ${text}`);
  return text ? JSON.parse(text) : {};
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function extractEmail_(value) {
  const match = value.match(/<([^>]+)>/) || value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? (match[1] || match[0]).trim() : "";
}
