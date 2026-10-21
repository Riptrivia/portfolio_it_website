(() => {
  "use strict";

  const destination = "pestcoe.zfix@gmail.com";
  const form = document.querySelector("#ewaste-handoff-form");
  if (!form) return;

  const preview = document.querySelector("[data-handoff-preview]");
  const status = document.querySelector("[data-handoff-status]");
  const dialog = document.querySelector("[data-handoff-email]");
  const checkoutStatus = document.querySelector("[data-handoff-checkout-status]");
  const handoffDate = document.querySelector("#handoff-date");
  let pendingRecord = "";
  let pendingSubject = "";

  const field = (selector) => document.querySelector(selector);
  const value = (selector) => field(selector)?.value.trim() || "";
  const checked = (selector) => Boolean(field(selector)?.checked);
  const cleanLine = (text) => String(text || "").replace(/[\r\n]+/g, " ").trim();
  const normalizedName = (text) => cleanLine(text).toLocaleLowerCase().replace(/\s+/g, " ");
  const yesNo = (state) => state ? "YES" : "NO";
  const recordId = () => `EWH-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
  const localDate = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  };

  function buildRecord(final = false) {
    const lines = [
      "E-WASTE EQUIPMENT HANDOFF ACKNOWLEDGMENT",
      "================================================",
      `Record ID: ${final ? recordId() : "Generated when emailed"}`,
      `Created: ${new Date().toLocaleString()}`,
      "",
      "OWNER / AUTHORIZED PERSON",
      `Name: ${cleanLine(value("#handoff-owner")) || "Not provided"}`,
      `Email: ${cleanLine(value("#handoff-email")) || "Not provided"}`,
      "",
      "EQUIPMENT",
      `Device type: ${cleanLine(value("#handoff-device")) || "Not selected"}`,
      `Make and model: ${cleanLine(value("#handoff-model")) || "Not provided"}`,
      `Serial / identifier: ${cleanLine(value("#handoff-serial")) || "Not provided"}`,
      `Physical condition: ${cleanLine(value("#handoff-condition")) || "Not selected"}`,
      `Known damage / accessories: ${value("#handoff-notes") || "None provided"}`,
      "",
      "REQUIRED ACKNOWLEDGMENTS",
      `All storage removed and retained by owner: ${yesNo(checked("#handoff-storage"))}`,
      `Ownership or disposal authority confirmed: ${yesNo(checked("#handoff-authority"))}`,
      `Reuse / parts / recycling disposition understood: ${yesNo(checked("#handoff-disposition"))}`,
      "",
      "ELECTRONIC SIGNATURE",
      `Typed signature: ${cleanLine(value("#handoff-signature")) || "Not signed"}`,
      `Handoff date: ${value("#handoff-date") || "Not provided"}`,
      "",
      "The signer states that the information above is accurate and intends the typed name to serve as an electronic signature on this equipment handoff acknowledgment.",
      "",
      "This frontend-generated email does not independently verify identity, ownership, delivery, or legal enforceability. Both parties should retain the sent message."
    ];
    return lines.join("\n");
  }

  function updatePreview() {
    preview.textContent = buildRecord(false);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      return copied;
    }
  }

  function providerUrl(provider) {
    const to = encodeURIComponent(destination);
    const subject = encodeURIComponent(pendingSubject);
    const body = encodeURIComponent(pendingRecord);
    return ({
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`,
      outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${subject}&body=${body}`,
      yahoo: `https://compose.mail.yahoo.com/?to=${to}&subject=${subject}&body=${body}`,
      icloud: "https://www.icloud.com/mail/",
      aol: "https://mail.aol.com/"
    })[provider] || "";
  }

  async function openProvider(provider) {
    await copyText(pendingRecord);
    const url = providerUrl(provider);
    if (!url) return;
    checkoutStatus.textContent = ["icloud", "aol"].includes(provider)
      ? "Record copied. Open a new message and paste it into the email body."
      : "Opening a prefilled message. Review the record and signature before sending.";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function validateSignature() {
    const signature = field("#handoff-signature");
    const matches = normalizedName(signature.value) === normalizedName(value("#handoff-owner"));
    signature.setCustomValidity(matches ? "" : "The typed signature must match the owner or authorized-person name.");
    return matches;
  }

  form.addEventListener("input", () => {
    if (field("#handoff-signature").value) validateSignature();
    updatePreview();
  });
  form.addEventListener("change", updatePreview);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.classList.remove("is-error");
    validateSignature();
    if (!form.checkValidity()) {
      status.textContent = "Complete every required field and acknowledgment. The typed signature must match the owner name.";
      status.classList.add("is-error");
      form.reportValidity();
      return;
    }

    pendingRecord = buildRecord(true);
    pendingSubject = `E-waste handoff acknowledgment: ${cleanLine(value("#handoff-device"))} — ${cleanLine(value("#handoff-model"))}`.slice(0, 170);
    const copied = await copyText(pendingRecord);
    status.textContent = copied ? "Signed record copied. Choose an email provider to continue." : "Choose an email provider, then copy the preview manually if needed.";
    checkoutStatus.textContent = copied ? "Signed record copied to the clipboard." : "Choose an email option to continue.";
    dialog.showModal();
  });

  document.querySelectorAll("[data-handoff-provider]").forEach((button) => {
    button.addEventListener("click", () => openProvider(button.dataset.handoffProvider));
  });

  field("[data-handoff-default]").addEventListener("click", async () => {
    await copyText(pendingRecord);
    checkoutStatus.textContent = "Opening the default email app. Review the record before sending.";
    window.location.href = `mailto:${destination}?subject=${encodeURIComponent(pendingSubject)}&body=${encodeURIComponent(pendingRecord)}`;
  });

  field("[data-handoff-copy]").addEventListener("click", async () => {
    checkoutStatus.textContent = await copyText(pendingRecord) ? "Signed record copied—paste it into any email service." : "Clipboard unavailable. Copy the live preview manually.";
  });

  field("[data-handoff-copy-address]").addEventListener("click", async () => {
    checkoutStatus.textContent = await copyText(destination) ? "Email address copied." : `Copy this address: ${destination}`;
  });

  field("[data-handoff-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

  field("[data-handoff-clear]").addEventListener("click", () => {
    form.reset();
    handoffDate.value = localDate();
    status.textContent = "Handoff form cleared.";
    updatePreview();
    field("#handoff-owner").focus();
  });

  handoffDate.value = localDate();
  handoffDate.max = localDate();
  updatePreview();
})();
