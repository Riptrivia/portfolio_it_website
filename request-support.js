(() => {
  "use strict";

  const destination = "pestcoe.zfix@gmail.com";
  const form = document.querySelector("#support-form");
  const preview = document.querySelector("[data-ticket-preview]");
  const ticketType = document.querySelector("[data-ticket-type]");
  const appointmentFields = document.querySelector("[data-appointment-fields]");
  const status = document.querySelector("[data-form-status]");
  const description = document.querySelector("#issue-description");
  const descriptionCount = document.querySelector("[data-description-count]");
  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  let mode = "ticket";

  const value = (selector) => document.querySelector(selector)?.value.trim() || "";
  const selectedDevice = () => form.querySelector('input[name="device"]:checked')?.value || "Not selected";
  const cleanLine = (text) => String(text || "").replace(/[\r\n]+/g, " ").trim();
  const dateLabel = (raw) => {
    if (!raw) return "Not provided";
    const [year, month, day] = raw.split("-");
    return `${month}/${day}/${year}`;
  };

  function buildTicket() {
    const isAppointment = mode === "appointment";
    const heading = isAppointment ? "SUPPORT APPOINTMENT REQUEST" : "SELF-SERVICE SUPPORT TICKET";
    const lines = [
      heading,
      "========================================",
      "",
      `Requester: ${cleanLine(value("#requester-name")) || "Not provided"}`,
      `Email: ${cleanLine(value("#requester-email")) || "Not provided"}`,
      `Phone: ${cleanLine(value("#requester-phone")) || "Not provided"}`,
      "",
      "DEVICE & ISSUE",
      `Device: ${selectedDevice()}`,
      `Category: ${cleanLine(value("#issue-category")) || "Not selected"}`,
      `Urgency: ${cleanLine(value("#urgency")) || "Not selected"}`,
      `Summary: ${cleanLine(value("#issue-summary")) || "Not provided"}`,
      "",
      "DESCRIPTION",
      value("#issue-description") || "Not provided"
    ];

    if (isAppointment) {
      lines.push(
        "",
        "APPOINTMENT PREFERENCE",
        `Preferred date: ${dateLabel(value("#preferred-date"))}`,
        `Preferred time: ${value("#preferred-time") || "Not provided"}`,
        `Backup availability: ${cleanLine(value("#backup-time")) || "Not provided"}`,
        `Format: ${cleanLine(value("#appointment-format")) || "Not selected"}`
      );
    }

    lines.push("", `Created: ${new Date().toLocaleString()}`, "Status: New request");
    return lines.join("\n");
  }

  function updatePreview() {
    const text = buildTicket();
    preview.textContent = text;
    ticketType.textContent = mode === "appointment" ? "APPOINTMENT REQUEST" : "SELF-SERVICE TICKET";
    descriptionCount.textContent = String(description.value.length);
  }

  function setMode(nextMode) {
    mode = nextMode;
    const isAppointment = mode === "appointment";
    appointmentFields.hidden = !isAppointment;
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelector("#preferred-date").required = isAppointment;
    document.querySelector("#preferred-time").required = isAppointment;
    status.textContent = "";
    updatePreview();
  }

  function validate() {
    let firstInvalid = null;
    form.querySelectorAll("[required]").forEach((field) => {
      const valid = field.type === "radio"
        ? Boolean(form.querySelector(`input[name="${field.name}"]:checked`))
        : field.checkValidity();
      field.setAttribute("aria-invalid", String(!valid));
      if (!valid && !firstInvalid) firstInvalid = field;
    });
    return firstInvalid;
  }

  async function copyTicket(text) {
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

  form.addEventListener("input", updatePreview);
  form.addEventListener("change", updatePreview);
  modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.classList.remove("is-error");
    const firstInvalid = validate();
    if (firstInvalid) {
      status.textContent = "Please complete the required fields before creating the email.";
      status.classList.add("is-error");
      firstInvalid.focus();
      return;
    }

    const ticket = buildTicket();
    const copied = await copyTicket(ticket);
    const device = selectedDevice();
    const summary = cleanLine(value("#issue-summary"));
    const prefix = mode === "appointment" ? "Appointment request" : "Support request";
    const subject = `${prefix}: ${device} — ${summary}`.slice(0, 160);
    status.textContent = copied
      ? "Ticket copied. Opening your email app—review the message before sending."
      : "Opening your email app. Copy the preview manually if the clipboard is unavailable.";

    window.location.href = `mailto:${destination}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(ticket)}`;
  });

  document.querySelector("[data-clear-form]").addEventListener("click", () => {
    form.reset();
    setMode("ticket");
    status.textContent = "Form cleared.";
    document.querySelector('input[name="device"]').focus();
  });

  document.querySelector("#preferred-date").min = new Date().toISOString().slice(0, 10);
  setMode("ticket");
})();
