const encoder = new TextEncoder();
const decoder = new TextDecoder();
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const VALID_STATUSES = new Set(["Received", "Under review", "Approval pending", "Approved", "Declined", "Scheduled", "In progress", "Completed", "Closed"]);

function cors(origin, allowedOrigin) {
  const allowed = origin === allowedOrigin || /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Webhook-Secret",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function base64url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function base32Encode(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, buffer = 0;
  const output = [];
  for (const char of value.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

async function sha256(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function signToken(payload, secret, ttlSeconds) {
  const header = base64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(encoder.encode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })));
  const signature = await hmac(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

async function verifyToken(token, secret, expectedType) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = await hmac(`${parts[0]}.${parts[1]}`, secret);
  if (expected.length !== parts[2].length) return null;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ parts[2].charCodeAt(index);
  if (mismatch) return null;
  try {
    const payload = JSON.parse(decoder.decode(fromBase64url(parts[1])));
    if (payload.exp < Math.floor(Date.now() / 1000) || payload.type !== expectedType) return null;
    return payload;
  } catch { return null; }
}

function bearer(request) {
  const value = request.headers.get("Authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function encryptTotpSecret(secret, encryptionKey) {
  const keyBytes = Uint8Array.from(atob(encryptionKey), (char) => char.charCodeAt(0));
  if (keyBytes.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must decode to 32 bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(secret)));
  return `${base64url(iv)}.${base64url(ciphertext)}`;
}

async function decryptTotpSecret(value, encryptionKey) {
  const [ivText, ciphertextText] = String(value).split(".");
  const keyBytes = Uint8Array.from(atob(encryptionKey), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64url(ivText) }, key, fromBase64url(ciphertextText));
  return decoder.decode(clear);
}

async function totpAt(secret, step) {
  const counter = new Uint8Array(8);
  let value = BigInt(step);
  for (let index = 7; index >= 0; index -= 1) { counter[index] = Number(value & 255n); value >>= 8n; }
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = digest[digest.length - 1] & 15;
  const number = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(number % 1000000).padStart(6, "0");
}

async function verifyTotp(secret, code, lastStep) {
  const current = Math.floor(Date.now() / 1000 / 30);
  for (const step of [current - 1, current, current + 1]) {
    if (step <= Number(lastStep || -1)) continue;
    if (await totpAt(secret, step) === String(code)) return step;
  }
  return null;
}

async function verifyGoogleCredential(credential, env) {
  const parts = String(credential || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed Google credential");
  const header = JSON.parse(decoder.decode(fromBase64url(parts[0])));
  const payload = JSON.parse(decoder.decode(fromBase64url(parts[1])));
  if (header.alg !== "RS256") throw new Error("Unexpected Google token algorithm");
  const response = await fetch(GOOGLE_JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!response.ok) throw new Error("Unable to load Google signing keys");
  const keys = (await response.json()).keys || [];
  const jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new Error("Google signing key not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  const now = Math.floor(Date.now() / 1000);
  if (!valid || payload.exp < now || payload.iat > now + 60) throw new Error("Expired or invalid Google credential");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) throw new Error("Unexpected Google issuer");
  if (payload.aud !== env.GOOGLE_CLIENT_ID) throw new Error("Unexpected Google audience");
  if (!payload.email_verified || String(payload.email).toLowerCase() !== String(env.ADMIN_EMAIL).toLowerCase()) throw new Error("Google account is not authorized");
  return payload;
}

async function handleGoogleLogin(request, env, headers) {
  const body = await readJson(request);
  if (!body?.credential) return json({ error: "Google credential required" }, 400, headers);
  let google;
  try { google = await verifyGoogleCredential(body.credential, env); }
  catch (error) { console.error("Google login rejected", error.message); return json({ error: "Google sign-in could not be verified" }, 401, headers); }
  const now = new Date().toISOString();
  let admin = await env.DB.prepare("SELECT * FROM admin_auth WHERE google_sub = ?").bind(google.sub).first();
  if (!admin) {
    const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
    const encrypted = await encryptTotpSecret(secret, env.TOTP_ENCRYPTION_KEY);
    await env.DB.prepare("INSERT INTO admin_auth (google_sub,email,encrypted_totp_secret,created_at,updated_at) VALUES (?,?,?,?,?)")
      .bind(google.sub, google.email, encrypted, now, now).run();
    admin = await env.DB.prepare("SELECT * FROM admin_auth WHERE google_sub = ?").bind(google.sub).first();
  }
  const challenge = await signToken({ type: "admin_challenge", sub: google.sub, email: google.email }, env.SESSION_SECRET, 300);
  const response = { challenge, totpRequired: Boolean(admin.totp_confirmed) };
  if (!admin.totp_confirmed) {
    const secret = await decryptTotpSecret(admin.encrypted_totp_secret, env.TOTP_ENCRYPTION_KEY);
    response.enrollment = {
      manualKey: secret,
      otpauthUri: `otpauth://totp/${encodeURIComponent("Marcielo ZFix Admin")}:${encodeURIComponent(google.email)}?secret=${secret}&issuer=${encodeURIComponent("Marcielo ZFix Admin")}&algorithm=SHA1&digits=6&period=30`
    };
  }
  return json(response, 200, headers);
}

async function handleTotpVerify(request, env, headers) {
  const body = await readJson(request);
  const challenge = await verifyToken(body?.challenge, env.SESSION_SECRET, "admin_challenge");
  if (!challenge || !/^\d{6}$/.test(String(body?.code || ""))) return json({ error: "Invalid or expired verification request" }, 401, headers);
  const admin = await env.DB.prepare("SELECT * FROM admin_auth WHERE google_sub = ? AND email = ?").bind(challenge.sub, challenge.email).first();
  if (!admin) return json({ error: "Administrator account not found" }, 401, headers);
  const secret = await decryptTotpSecret(admin.encrypted_totp_secret, env.TOTP_ENCRYPTION_KEY);
  const acceptedStep = await verifyTotp(secret, body.code, admin.last_totp_step);
  if (acceptedStep === null) return json({ error: "Authenticator code was not accepted" }, 401, headers);
  await env.DB.prepare("UPDATE admin_auth SET totp_confirmed=1,last_totp_step=?,updated_at=? WHERE google_sub=?")
    .bind(acceptedStep, new Date().toISOString(), challenge.sub).run();
  const session = await signToken({ type: "admin_session", sub: challenge.sub, email: challenge.email }, env.SESSION_SECRET, 3600);
  return json({ session, expiresIn: 3600 }, 200, headers);
}

async function requireAdmin(request, env) {
  const session = await verifyToken(bearer(request), env.SESSION_SECRET, "admin_session");
  return session && String(session.email).toLowerCase() === String(env.ADMIN_EMAIL).toLowerCase() ? session : null;
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return raw.match(/.{1,4}/g).join("-");
}

async function customerAccessHash(ticketId, code, env) {
  return sha256(`${ticketId}:${code}:${env.CUSTOMER_TOKEN_PEPPER}`);
}

async function nextTicketId(env) {
  const result = await env.DB.prepare("SELECT id FROM tickets ORDER BY CAST(substr(id,6) AS INTEGER) DESC LIMIT 1").first();
  const number = result ? Number(String(result.id).slice(5)) + 1 : 1001;
  return `ZFIX-${number}`;
}

async function queueEmail(env, ticketId, recipient, subject, textBody) {
  await env.DB.prepare("INSERT INTO email_outbox (ticket_id,recipient,subject,text_body,created_at) VALUES (?,?,?,?,?)")
    .bind(ticketId || null, recipient, subject, textBody, new Date().toISOString()).run();
}

async function handleGmailIntake(request, env, headers) {
  if (request.headers.get("X-Webhook-Secret") !== env.GMAIL_WEBHOOK_SECRET) return json({ error: "Unauthorized" }, 401, headers);
  const body = await readJson(request);
  const required = ["gmailMessageId", "customerName", "customerEmail", "device", "category", "summary", "description"];
  if (!body || required.some((key) => !String(body[key] || "").trim())) return json({ error: "Required ticket fields are missing" }, 400, headers);
  const duplicate = await env.DB.prepare("SELECT ticket_id FROM processed_emails WHERE gmail_message_id=?").bind(body.gmailMessageId).first();
  if (duplicate) return json({ status: "duplicate", ticketId: duplicate.ticket_id }, 200, headers);
  const id = await nextTicketId(env);
  const accessCode = randomCode();
  const accessHash = await customerAccessHash(id, accessCode, env);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tickets (id,customer_name,customer_email,customer_phone,device,category,urgency,summary,description,status,access_hash,access_hint,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, body.customerName.trim(), body.customerEmail.trim().toLowerCase(), String(body.customerPhone || "").trim(), body.device.trim(), body.category.trim(), String(body.urgency || "Normal").trim(), body.summary.trim(), body.description.trim(), "Received", accessHash, accessCode.slice(-4), "gmail", now, now),
    env.DB.prepare("INSERT INTO ticket_updates (ticket_id,status,public_message,actor,created_at) VALUES (?,?,?,?,?)")
      .bind(id, "Received", "Your support request was received successfully.", "system", now),
    env.DB.prepare("INSERT INTO processed_emails (gmail_message_id,ticket_id,processed_at) VALUES (?,?,?)").bind(body.gmailMessageId, id, now)
  ]);
  const portal = `${env.CUSTOMER_PORTAL_URL}?ticket=${encodeURIComponent(id)}`;
  await queueEmail(env, id, body.customerEmail.trim().toLowerCase(), `Support request received — ${id}`,
    `Hi ${body.customerName.trim()},\n\nYour support request has been received.\n\nTicket: ${id}\nPrivate access code: ${accessCode}\nStatus: Received\n\nCheck your status: ${portal}\n\nKeep the access code private. I will never ask for your password, MFA code, or banking information.\n\n— Marcielo`);
  return json({ status: "created", ticketId: id }, 201, headers);
}

async function handleOutbox(request, env, headers) {
  if (request.headers.get("X-Webhook-Secret") !== env.GMAIL_WEBHOOK_SECRET) return json({ error: "Unauthorized" }, 401, headers);
  if (request.method === "GET") {
    const rows = await env.DB.prepare("SELECT id,recipient,subject,text_body FROM email_outbox WHERE status='pending' AND attempts < 5 ORDER BY created_at LIMIT 10").all();
    return json({ messages: rows.results || [] }, 200, headers);
  }
  const body = await readJson(request);
  if (!Number.isInteger(body?.id) || !["sent", "failed"].includes(body?.status)) return json({ error: "Invalid outbox acknowledgment" }, 400, headers);
  if (body.status === "sent") {
    await env.DB.prepare("UPDATE email_outbox SET status='sent',sent_at=?,attempts=attempts+1,last_error=NULL WHERE id=?").bind(new Date().toISOString(), body.id).run();
  } else {
    await env.DB.prepare("UPDATE email_outbox SET attempts=attempts+1,last_error=? WHERE id=?").bind(String(body.error || "Unknown Gmail error").slice(0, 500), body.id).run();
  }
  return json({ status: "recorded" }, 200, headers);
}

async function handleAdminTickets(request, env, headers) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator session required" }, 401, headers);
  const rows = await env.DB.prepare(
    "SELECT id,customer_name,device,category,urgency,summary,status,created_at,updated_at FROM tickets ORDER BY updated_at DESC LIMIT 100"
  ).all();
  return json({ tickets: rows.results || [] }, 200, headers);
}

async function handleAdminTicket(request, env, headers, ticketId) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator session required" }, 401, headers);
  const ticket = await env.DB.prepare(
    "SELECT id,customer_name,customer_email,customer_phone,device,category,urgency,summary,description,status,source,created_at,updated_at FROM tickets WHERE id=?"
  ).bind(ticketId).first();
  if (!ticket) return json({ error: "Ticket not found" }, 404, headers);
  const updates = await env.DB.prepare(
    "SELECT id,status,public_message,private_note,actor,created_at FROM ticket_updates WHERE ticket_id=? ORDER BY created_at"
  ).bind(ticketId).all();
  const quote = await env.DB.prepare(
    "SELECT id,version,service_description,rate_cents,rate_unit,minimum_cents,maximum_cents,terms,expires_at,decision,decision_note,decided_at,created_at FROM quotes WHERE ticket_id=? ORDER BY version DESC LIMIT 1"
  ).bind(ticketId).first();
  return json({ ticket, updates: updates.results || [], quote: quote || null }, 200, headers);
}

async function handleAdminUpdate(request, env, headers, ticketId) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Administrator session required" }, 401, headers);
  const body = await readJson(request);
  const status = String(body?.status || "").trim();
  const publicMessage = String(body?.publicMessage || "").trim().slice(0, 1000);
  const privateNote = String(body?.privateNote || "").trim().slice(0, 1000);
  if (!VALID_STATUSES.has(status)) return json({ error: "Invalid ticket status" }, 400, headers);
  const ticket = await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(ticketId).first();
  if (!ticket) return json({ error: "Ticket not found" }, 404, headers);
  if (!publicMessage && !privateNote && status === ticket.status) return json({ error: "No ticket changes supplied" }, 400, headers);
  const now = new Date().toISOString();
  const customerMessage = publicMessage || (status !== ticket.status ? `Your ticket status changed to ${status}.` : "");
  const operations = [env.DB.prepare("UPDATE tickets SET status=?,updated_at=? WHERE id=?").bind(status, now, ticketId)];
  if (customerMessage || privateNote) {
    operations.push(env.DB.prepare(
      "INSERT INTO ticket_updates (ticket_id,status,public_message,private_note,actor,created_at) VALUES (?,?,?,?,?,?)"
    ).bind(ticketId, status, customerMessage, privateNote, admin.email, now));
  }
  await env.DB.batch(operations);
  if (customerMessage) {
    await queueEmail(env, ticketId, ticket.customer_email, `${ticketId} update — ${status}`,
      `Hi ${ticket.customer_name.split(" ")[0]},\n\nYour support ticket has been updated.\n\nTicket: ${ticketId}\nStatus: ${status}\nUpdate: ${customerMessage}\n\nView the ticket: ${env.CUSTOMER_PORTAL_URL}?ticket=${encodeURIComponent(ticketId)}\n\n— Marcielo`);
  }
  return json({ status: "saved", ticketStatus: status, emailQueued: Boolean(customerMessage) }, 200, headers);
}

async function handleCustomerLogin(request, env, headers) {
  const body = await readJson(request);
  const id = String(body?.ticketId || "").toUpperCase().trim();
  const ticket = await env.DB.prepare("SELECT id,access_hash FROM tickets WHERE id=?").bind(id).first();
  if (!ticket || await customerAccessHash(id, String(body?.accessCode || "").trim(), env) !== ticket.access_hash) {
    return json({ error: "Ticket number or access code not recognized" }, 401, headers);
  }
  const session = await signToken({ type: "customer_session", ticketId: id }, env.SESSION_SECRET, 1800);
  return json({ session, expiresIn: 1800 }, 200, headers);
}

async function customerTicket(request, env, headers) {
  const session = await verifyToken(bearer(request), env.SESSION_SECRET, "customer_session");
  if (!session) return json({ error: "Customer session required" }, 401, headers);
  const ticket = await env.DB.prepare("SELECT id,device,category,urgency,summary,status,created_at,updated_at FROM tickets WHERE id=?").bind(session.ticketId).first();
  if (!ticket) return json({ error: "Ticket not found" }, 404, headers);
  const updates = await env.DB.prepare("SELECT status,public_message,created_at FROM ticket_updates WHERE ticket_id=? ORDER BY created_at").bind(session.ticketId).all();
  const quote = await env.DB.prepare("SELECT id,version,service_description,rate_cents,rate_unit,minimum_cents,maximum_cents,terms,expires_at,decision,decided_at FROM quotes WHERE ticket_id=? ORDER BY version DESC LIMIT 1").bind(session.ticketId).first();
  return json({ ticket, updates: updates.results || [], quote: quote || null }, 200, headers);
}

async function handleQuoteDecision(request, env, headers) {
  const session = await verifyToken(bearer(request), env.SESSION_SECRET, "customer_session");
  const body = await readJson(request);
  if (!session || !["accepted", "declined"].includes(body?.decision)) return json({ error: "Valid customer session and decision required" }, 401, headers);
  const quote = await env.DB.prepare("SELECT * FROM quotes WHERE id=? AND ticket_id=? AND decision='pending'").bind(Number(body.quoteId), session.ticketId).first();
  if (!quote || new Date(quote.expires_at).getTime() < Date.now()) return json({ error: "Quote is unavailable or expired" }, 409, headers);
  const status = body.decision === "accepted" ? "Approved" : "Declined";
  const now = new Date().toISOString();
  const message = body.decision === "accepted" ? "The customer approved the estimate." : "The customer declined the estimate.";
  await env.DB.batch([
    env.DB.prepare("UPDATE quotes SET decision=?,decision_note=?,decided_at=? WHERE id=?").bind(body.decision, String(body.note || "").slice(0, 500), now, quote.id),
    env.DB.prepare("UPDATE tickets SET status=?,updated_at=? WHERE id=?").bind(status, now, session.ticketId),
    env.DB.prepare("INSERT INTO ticket_updates (ticket_id,status,public_message,actor,created_at) VALUES (?,?,?,?,?)").bind(session.ticketId, status, message, "customer", now)
  ]);
  await queueEmail(env, session.ticketId, env.ADMIN_EMAIL, `${session.ticketId} estimate ${body.decision}`, `${message}\n\nTicket: ${session.ticketId}\nCustomer note: ${String(body.note || "None")}`);
  return json({ status, decision: body.decision }, 200, headers);
}

async function handleAdminQuote(request, env, headers, ticketId) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator session required" }, 401, headers);
  const body = await readJson(request);
  if (!body?.serviceDescription || !body?.terms || !body?.expiresAt) return json({ error: "Service, terms, and expiration are required" }, 400, headers);
  const ticket = await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(ticketId).first();
  if (!ticket) return json({ error: "Ticket not found" }, 404, headers);
  const latest = await env.DB.prepare("SELECT COALESCE(MAX(version),0) AS version FROM quotes WHERE ticket_id=?").bind(ticketId).first();
  const version = Number(latest.version) + 1;
  const now = new Date().toISOString();
  const rateCents = Number.isInteger(body.rateCents) ? body.rateCents : null;
  const minimumCents = Number.isInteger(body.minimumCents) ? body.minimumCents : null;
  const maximumCents = Number.isInteger(body.maximumCents) ? body.maximumCents : null;
  if ([rateCents, minimumCents, maximumCents].some((value) => value !== null && value < 0)) return json({ error: "Estimate amounts cannot be negative" }, 400, headers);
  if ((minimumCents === null) !== (maximumCents === null)) return json({ error: "Provide both minimum and maximum totals" }, 400, headers);
  if (minimumCents !== null && minimumCents > maximumCents) return json({ error: "Minimum total cannot exceed maximum total" }, 400, headers);
  if (!Number.isFinite(new Date(body.expiresAt).getTime()) || new Date(body.expiresAt).getTime() <= Date.now()) return json({ error: "Estimate expiration must be in the future" }, 400, headers);
  const result = await env.DB.prepare("INSERT INTO quotes (ticket_id,version,service_description,rate_cents,rate_unit,minimum_cents,maximum_cents,terms,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(ticketId, version, body.serviceDescription.trim(), rateCents, String(body.rateUnit || "flat"), minimumCents, maximumCents, body.terms.trim(), body.expiresAt, now).run();
  await env.DB.batch([
    env.DB.prepare("UPDATE tickets SET status='Approval pending',updated_at=? WHERE id=?").bind(now, ticketId),
    env.DB.prepare("INSERT INTO ticket_updates (ticket_id,status,public_message,private_note,actor,created_at) VALUES (?,?,?,?,?,?)")
      .bind(ticketId, "Approval pending", "An estimate is ready for your review.", String(body.privateNote || "").slice(0, 500), "admin", now)
  ]);
  const amount = minimumCents !== null ? `$${(minimumCents / 100).toFixed(2)}–$${(maximumCents / 100).toFixed(2)}` : rateCents !== null ? `$${(rateCents / 100).toFixed(2)} ${body.rateUnit || ""}`.trim() : "See portal";
  await queueEmail(env, ticketId, ticket.customer_email, `${ticketId} — estimate ready for approval`,
    `Hi ${ticket.customer_name.split(" ")[0]},\n\nI reviewed your support request and prepared an estimate.\n\nService: ${body.serviceDescription.trim()}\nEstimated price: ${amount}\nTerms: ${body.terms.trim()}\nExpires: ${body.expiresAt}\n\nNo work will begin until you approve the estimate in the customer portal.\n\nPortal: ${env.CUSTOMER_PORTAL_URL}?ticket=${encodeURIComponent(ticketId)}\n\n— Marcielo`);
  return json({ status: "queued", quoteId: result.meta.last_row_id, version }, 201, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request.headers.get("Origin") || "", env.ALLOWED_ORIGIN);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/" || url.pathname === "/health") return json({ status: "ok", service: "zfix-ticket-api" }, 200, headers);
    if (request.method === "POST" && url.pathname === "/api/admin/google") return handleGoogleLogin(request, env, headers);
    if (request.method === "POST" && url.pathname === "/api/admin/totp/verify") return handleTotpVerify(request, env, headers);
    if (request.method === "POST" && url.pathname === "/internal/gmail/intake") return handleGmailIntake(request, env, headers);
    if (["GET", "POST"].includes(request.method) && url.pathname === "/internal/gmail/outbox") return handleOutbox(request, env, headers);
    if (request.method === "POST" && url.pathname === "/api/customer/login") return handleCustomerLogin(request, env, headers);
    if (request.method === "GET" && url.pathname === "/api/customer/ticket") return customerTicket(request, env, headers);
    if (request.method === "POST" && url.pathname === "/api/customer/quote-decision") return handleQuoteDecision(request, env, headers);
    if (request.method === "GET" && url.pathname === "/api/admin/tickets") return handleAdminTickets(request, env, headers);
    const adminTicketMatch = url.pathname.match(/^\/api\/admin\/tickets\/(ZFIX-\d+)$/);
    if (request.method === "GET" && adminTicketMatch) return handleAdminTicket(request, env, headers, adminTicketMatch[1]);
    const updateMatch = url.pathname.match(/^\/api\/admin\/tickets\/(ZFIX-\d+)\/update$/);
    if (request.method === "POST" && updateMatch) return handleAdminUpdate(request, env, headers, updateMatch[1]);
    const quoteMatch = url.pathname.match(/^\/api\/admin\/tickets\/(ZFIX-\d+)\/quote$/);
    if (request.method === "POST" && quoteMatch) return handleAdminQuote(request, env, headers, quoteMatch[1]);
    return json({ error: "Not found" }, 404, headers);
  }
};
