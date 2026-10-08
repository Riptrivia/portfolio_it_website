(() => {
  "use strict";

  const config = window.ZFIX_CONFIG || {};
  const apiBase = String(config.apiBase || "").replace(/\/$/, "");
  const customerSessionKey = "zfix-customer-session";
  const adminSessionKey = "zfix-admin-session";
  let customerSession = sessionStorage.getItem(customerSessionKey) || "";
  let adminSession = sessionStorage.getItem(adminSessionKey) || "";
  let adminChallenge = "";
  let activeAdminTicket = "";
  let activeCustomerQuote = null;

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const clean = (value) => String(value || "").trim();
  const escapeHtml = (value) => String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const dateLabel = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
  const money = (value) => Number.isInteger(value) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100) : "—";
  const cents = (value) => clean(value) === "" ? null : Math.round(Number(value) * 100);

  async function api(path, options = {}) {
    if (!apiBase) throw new Error("Ticket service is not configured.");
    const response = await fetch(`${apiBase}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const error = new Error(data.error || `Ticket service returned ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setMessage(element, text, error = false) {
    element.textContent = text;
    element.classList.toggle("is-error", error);
  }

  function setTab(name) {
    $$('[data-portal-tab]').forEach((button) => {
      const active = button.dataset.portalTab === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$('[data-portal-panel]').forEach((panel) => {
      const active = panel.dataset.portalPanel === name;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    if (name === "admin") {
      if (adminSession) openAdminWorkspace();
      else initializeGoogleButton();
    }
  }

  function quotePrice(quote) {
    if (Number.isInteger(quote.minimum_cents) && Number.isInteger(quote.maximum_cents)) return `${money(quote.minimum_cents)}–${money(quote.maximum_cents)}`;
    if (Number.isInteger(quote.rate_cents)) return `${money(quote.rate_cents)}${quote.rate_unit === "per hour" ? " per hour" : ""}`;
    return "See estimate terms";
  }

  function renderCustomerQuote(quote) {
    const card = $('[data-customer-quote]');
    activeCustomerQuote = quote;
    if (!quote) { card.hidden = true; return; }
    card.hidden = false;
    $('[data-quote-service]').textContent = quote.service_description;
    $('[data-quote-price]').textContent = quotePrice(quote);
    $('[data-quote-expires]').textContent = dateLabel(quote.expires_at);
    $('[data-quote-terms]').textContent = quote.terms;
    $('[data-quote-decision]').textContent = quote.decision;
    const pending = quote.decision === "pending" && new Date(quote.expires_at).getTime() >= Date.now();
    $('[data-quote-consent]').disabled = !pending;
    $('[data-quote-consent]').checked = false;
    $('[data-quote-accept]').disabled = true;
    $('[data-quote-decline]').disabled = !pending;
    $('[data-quote-note]').disabled = !pending;
    setMessage($('[data-quote-message]'), pending ? "Review the estimate before making a decision." : `This estimate is ${quote.decision}.`);
  }

  function renderCustomerTicket(data) {
    const { ticket, updates, quote } = data;
    const result = $('[data-ticket-result]');
    result.classList.remove("is-empty");
    $('.empty-state', result).hidden = true;
    $('.ticket-content', result).hidden = false;
    $('[data-result-id]').textContent = ticket.id;
    $('[data-result-summary]').textContent = ticket.summary;
    $('[data-result-status]').textContent = ticket.status;
    $('[data-result-device]').textContent = ticket.device;
    $('[data-result-updated]').textContent = dateLabel(ticket.updated_at);
    $('[data-result-timeline]').innerHTML = updates.slice().reverse().map((update) => `
      <article class="timeline-item"><span class="timeline-dot">✓</span><div><h4>${escapeHtml(update.status)}</h4><p>${escapeHtml(update.public_message)}</p><time>${escapeHtml(dateLabel(update.created_at))}</time></div></article>`).join("");
    renderCustomerQuote(quote);
  }

  async function loadCustomerTicket() {
    if (!customerSession) return;
    try {
      const data = await api("/api/customer/ticket", { headers: { Authorization: `Bearer ${customerSession}` } });
      renderCustomerTicket(data);
    } catch (error) {
      if (error.status === 401) { customerSession = ""; sessionStorage.removeItem(customerSessionKey); }
      setMessage($('[data-customer-message]'), error.message, true);
    }
  }

  $('[data-customer-lookup]').addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const message = $('[data-customer-message]');
    const submit = $('button[type="submit"]', event.currentTarget);
    submit.disabled = true;
    setMessage(message, "Verifying private access…");
    try {
      const result = await api("/api/customer/login", { method: "POST", body: JSON.stringify({ ticketId: clean(data.get("ticketId")), accessCode: clean(data.get("accessCode")) }) });
      customerSession = result.session;
      sessionStorage.setItem(customerSessionKey, customerSession);
      event.currentTarget.elements.accessCode.value = "";
      setMessage(message, "Private ticket access confirmed.");
      await loadCustomerTicket();
    } catch (error) { setMessage(message, error.message, true); }
    finally { submit.disabled = false; }
  });

  $('[data-toggle-secret]').addEventListener("click", (event) => {
    const input = event.currentTarget.previousElementSibling;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    event.currentTarget.textContent = showing ? "Show" : "Hide";
  });

  $('[data-quote-consent]').addEventListener("change", (event) => { $('[data-quote-accept]').disabled = !event.currentTarget.checked; });

  async function decideQuote(decision) {
    if (!activeCustomerQuote || !customerSession) return;
    if (decision === "accepted" && !$('[data-quote-consent]').checked) return;
    const message = $('[data-quote-message]');
    $$('[data-quote-accept],[data-quote-decline]').forEach((button) => { button.disabled = true; });
    setMessage(message, "Recording your decision…");
    try {
      await api("/api/customer/quote-decision", { method: "POST", headers: { Authorization: `Bearer ${customerSession}` }, body: JSON.stringify({ quoteId: activeCustomerQuote.id, decision, note: clean($('[data-quote-note]').value) }) });
      setMessage(message, decision === "accepted" ? "Estimate approved. Marcielo has been notified." : "Estimate declined. Marcielo has been notified.");
      await loadCustomerTicket();
    } catch (error) {
      setMessage(message, error.message, true);
      $('[data-quote-decline]').disabled = false;
      $('[data-quote-accept]').disabled = !$('[data-quote-consent]').checked;
    }
  }

  $('[data-quote-accept]').addEventListener("click", () => decideQuote("accepted"));
  $('[data-quote-decline]').addEventListener("click", () => decideQuote("declined"));

  function initializeGoogleButton(attempt = 0) {
    const message = $('[data-google-message]');
    const clientId = clean(config.googleClientId);
    if (!clientId || clientId.startsWith("REPLACE_")) {
      setMessage(message, "Google administrator sign-in needs its public OAuth client ID added to ticket-config.js.", true);
      return;
    }
    if (!window.google?.accounts?.id) {
      if (attempt < 40) setTimeout(() => initializeGoogleButton(attempt + 1), 150);
      else setMessage(message, "Google Sign-In could not load. Check browser privacy or content-blocking settings.", true);
      return;
    }
    const container = $('[data-google-signin]');
    if (container.dataset.ready) return;
    window.google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential });
    window.google.accounts.id.renderButton(container, { theme: "outline", size: "large", shape: "pill", text: "signin_with", width: 280 });
    container.dataset.ready = "true";
    setMessage(message, "Only the approved support account can continue.");
  }

  async function handleGoogleCredential(response) {
    const message = $('[data-google-message]');
    setMessage(message, "Verifying Google identity…");
    try {
      const result = await api("/api/admin/google", { method: "POST", body: JSON.stringify({ credential: response.credential }) });
      adminChallenge = result.challenge;
      $('[data-totp-form]').hidden = false;
      $('[data-totp-enrollment]').hidden = !result.enrollment;
      if (result.enrollment) $('[data-totp-key]').textContent = result.enrollment.manualKey;
      setMessage(message, result.enrollment ? "Google verified. Enroll Google Authenticator, then enter its code." : "Google verified. Enter the current Authenticator code.");
      $('[data-totp-form] input[name="code"]').focus();
    } catch (error) { setMessage(message, error.message, true); }
  }

  $('[data-copy-totp]').addEventListener("click", async () => {
    const key = $('[data-totp-key]').textContent;
    try { await navigator.clipboard.writeText(key); setMessage($('[data-totp-message]'), "Setup key copied. Clear your clipboard after enrollment."); }
    catch { setMessage($('[data-totp-message]'), "Clipboard unavailable. Select and copy the key manually.", true); }
  });

  $('[data-totp-form]').addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $('[data-totp-message]');
    const code = clean(new FormData(event.currentTarget).get("code"));
    setMessage(message, "Verifying Authenticator code…");
    try {
      const result = await api("/api/admin/totp/verify", { method: "POST", body: JSON.stringify({ challenge: adminChallenge, code }) });
      adminSession = result.session;
      sessionStorage.setItem(adminSessionKey, adminSession);
      event.currentTarget.reset();
      await openAdminWorkspace();
    } catch (error) { setMessage(message, error.message, true); }
  });

  async function adminApi(path, options = {}) {
    try { return await api(path, { ...options, headers: { Authorization: `Bearer ${adminSession}`, ...(options.headers || {}) } }); }
    catch (error) { if (error.status === 401) logoutAdmin("Administrator session expired. Sign in again."); throw error; }
  }

  async function openAdminWorkspace() {
    $('[data-admin-gate]').hidden = true;
    $('[data-admin-workspace]').hidden = false;
    await loadAdminQueue();
  }

  function logoutAdmin(message = "Signed out.") {
    adminSession = "";
    adminChallenge = "";
    sessionStorage.removeItem(adminSessionKey);
    $('[data-admin-workspace]').hidden = true;
    $('[data-admin-gate]').hidden = false;
    setMessage($('[data-google-message]'), message);
  }

  async function loadAdminQueue() {
    const list = $('[data-ticket-list]');
    list.innerHTML = '<p class="queue-loading">Loading ticket queue…</p>';
    try {
      const data = await adminApi("/api/admin/tickets");
      const tickets = data.tickets || [];
      const openCount = tickets.filter((ticket) => !["Completed", "Closed", "Declined"].includes(ticket.status)).length;
      $('[data-open-count]').textContent = String(openCount);
      $('[data-open-count]').parentElement.lastChild.textContent = ` open request${openCount === 1 ? "" : "s"}`;
      list.innerHTML = tickets.length ? tickets.map((ticket) => `
        <button class="queue-ticket${ticket.id === activeAdminTicket ? " is-active" : ""}" type="button" data-ticket-id="${escapeHtml(ticket.id)}"><span class="queue-ticket-top"><b>${escapeHtml(ticket.id)}</b><span>${escapeHtml(ticket.status)}</span></span><h3>${escapeHtml(ticket.summary)}</h3><p>${escapeHtml(ticket.customer_name)} · ${escapeHtml(ticket.device)}</p></button>`).join("") : '<p class="queue-loading">No tickets yet.</p>';
      $$('[data-ticket-id]', list).forEach((button) => button.addEventListener("click", () => loadAdminTicket(button.dataset.ticketId)));
      if (activeAdminTicket && tickets.some((ticket) => ticket.id === activeAdminTicket)) await loadAdminTicket(activeAdminTicket);
      else if (tickets[0]) await loadAdminTicket(tickets[0].id);
    } catch (error) { list.innerHTML = `<p class="queue-loading error">${escapeHtml(error.message)}</p>`; }
  }

  async function loadAdminTicket(ticketId) {
    activeAdminTicket = ticketId;
    try {
      const { ticket, updates, quote } = await adminApi(`/api/admin/tickets/${encodeURIComponent(ticketId)}`);
      $$('[data-ticket-id]').forEach((button) => button.classList.toggle("is-active", button.dataset.ticketId === ticketId));
      $('[data-editor-empty]').hidden = true;
      $('[data-editor-content]').hidden = false;
      $('[data-editor-id]').textContent = ticket.id;
      $('[data-editor-summary]').textContent = ticket.summary;
      $('[data-editor-urgency]').textContent = ticket.urgency;
      $('[data-editor-name]').textContent = ticket.customer_name;
      $('[data-editor-email]').textContent = ticket.customer_email;
      $('[data-editor-email]').href = `mailto:${ticket.customer_email}`;
      $('[data-editor-initials]').textContent = ticket.customer_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
      $('[data-editor-device]').textContent = ticket.device;
      $('[data-editor-category]').textContent = ticket.category;
      $('[data-editor-created]').textContent = dateLabel(ticket.created_at);
      $('[data-editor-description]').textContent = ticket.description;
      $('[data-editor-status]').value = ticket.status;
      $('[data-editor-update]').value = "";
      const lastPrivate = updates.slice().reverse().find((update) => update.private_note);
      $('[data-editor-private]').value = lastPrivate?.private_note || "";
      $('[data-admin-quote-service]').value = quote?.service_description || "";
      $('[data-admin-rate-unit]').value = quote?.rate_unit || "flat";
      $('[data-admin-rate]').value = Number.isInteger(quote?.rate_cents) ? (quote.rate_cents / 100).toFixed(2) : "";
      $('[data-admin-min]').value = Number.isInteger(quote?.minimum_cents) ? (quote.minimum_cents / 100).toFixed(2) : "";
      $('[data-admin-max]').value = Number.isInteger(quote?.maximum_cents) ? (quote.maximum_cents / 100).toFixed(2) : "";
      $('[data-admin-quote-terms]').value = quote?.terms || "No work begins until this estimate is approved. Additional work requires a revised estimate.";
      $('[data-admin-quote-expiry]').value = quote?.expires_at ? quote.expires_at.slice(0, 10) : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      setMessage($('[data-admin-message]'), quote ? `Latest estimate: ${quote.decision}.` : "Ticket loaded.");
    } catch (error) { setMessage($('[data-admin-message]'), error.message, true); }
  }

  $('[data-ticket-editor]').addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeAdminTicket) return;
    const message = $('[data-admin-message]');
    setMessage(message, "Saving update…");
    try {
      const result = await adminApi(`/api/admin/tickets/${encodeURIComponent(activeAdminTicket)}/update`, { method: "POST", body: JSON.stringify({ status: $('[data-editor-status]').value, publicMessage: clean($('[data-editor-update]').value), privateNote: clean($('[data-editor-private]').value) }) });
      setMessage(message, result.emailQueued ? "Update saved. Customer email queued for the Gmail bridge." : "Private update saved.");
      await loadAdminQueue();
    } catch (error) { setMessage(message, error.message, true); }
  });

  $('[data-send-quote]').addEventListener("click", async () => {
    if (!activeAdminTicket) return;
    const message = $('[data-quote-admin-message]');
    const minimumCents = cents($('[data-admin-min]').value);
    const maximumCents = cents($('[data-admin-max]').value);
    if (minimumCents !== null && maximumCents !== null && minimumCents > maximumCents) { setMessage(message, "Minimum total cannot exceed maximum total.", true); return; }
    const expiry = $('[data-admin-quote-expiry]').value;
    setMessage(message, "Creating estimate…");
    try {
      await adminApi(`/api/admin/tickets/${encodeURIComponent(activeAdminTicket)}/quote`, {
        method: "POST",
        body: JSON.stringify({ serviceDescription: clean($('[data-admin-quote-service]').value), rateCents: cents($('[data-admin-rate]').value), rateUnit: $('[data-admin-rate-unit]').value, minimumCents, maximumCents, terms: clean($('[data-admin-quote-terms]').value), expiresAt: expiry ? new Date(`${expiry}T23:59:59`).toISOString() : "" })
      });
      setMessage(message, "Estimate saved and approval email queued.");
      await loadAdminQueue();
    } catch (error) { setMessage(message, error.message, true); }
  });

  $('[data-refresh-queue]').addEventListener("click", loadAdminQueue);
  $('[data-refresh-ticket]').addEventListener("click", () => activeAdminTicket && loadAdminTicket(activeAdminTicket));
  $('[data-admin-logout]').addEventListener("click", () => logoutAdmin());
  $$('[data-portal-tab]').forEach((button) => button.addEventListener("click", () => setTab(button.dataset.portalTab)));

  const ticketFromUrl = new URLSearchParams(location.search).get("ticket");
  if (ticketFromUrl) $('[data-customer-lookup]').elements.ticketId.value = ticketFromUrl.toUpperCase();
  setTab(location.hash === "#admin" ? "admin" : "customer");
  if (customerSession) loadCustomerTicket();
})();
