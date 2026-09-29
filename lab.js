const byId = (id) => document.getElementById(id);

function parseIPv4(value) {
  const parts = value.trim().split('.');
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return NaN;
    if (part.length > 1 && part.startsWith('0')) return NaN;
    return Number(part);
  });

  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets;
}

function octetsToInt(octets) {
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

function intToIPv4(value) {
  const number = value >>> 0;
  return [number >>> 24, (number >>> 16) & 255, (number >>> 8) & 255, number & 255].join('.');
}

function addressType(octets) {
  const [a, b] = octets;
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'Private RFC 1918';
  if (a === 127) return 'Loopback';
  if (a === 169 && b === 254) return 'Link-local';
  if (a >= 224 && a <= 239) return 'Multicast';
  if (a === 0 || a >= 240) return 'Reserved';
  return 'Public';
}

function calculateSubnet(event) {
  event.preventDefault();
  const octets = parseIPv4(byId('subnet-ip').value);
  const prefix = Number(byId('subnet-cidr').value);
  const error = byId('subnet-error');

  if (!octets || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    error.textContent = 'Enter a valid IPv4 address and a CIDR prefix from 0 to 32.';
    return;
  }

  error.textContent = '';
  const ip = octetsToInt(octets);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const wildcard = (~mask) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;
  const total = 2 ** (32 - prefix);
  const usable = prefix === 32 ? 1 : prefix === 31 ? 2 : Math.max(0, total - 2);
  const first = prefix >= 31 ? network : (network + 1) >>> 0;
  const last = prefix === 32 ? network : prefix === 31 ? broadcast : (broadcast - 1) >>> 0;

  byId('network-address').textContent = `${intToIPv4(network)}/${prefix}`;
  byId('broadcast-address').textContent = intToIPv4(broadcast);
  byId('subnet-mask').textContent = intToIPv4(mask);
  byId('wildcard-mask').textContent = intToIPv4(wildcard);
  byId('first-host').textContent = intToIPv4(first);
  byId('last-host').textContent = intToIPv4(last);
  byId('total-addresses').textContent = total.toLocaleString();
  byId('usable-hosts').textContent = usable.toLocaleString();
  byId('address-type').textContent = addressType(octets);
}

function validateIPv4(event) {
  event.preventDefault();
  const value = byId('ip-input').value;
  const result = byId('ip-result');
  const octets = parseIPv4(value);

  result.classList.toggle('valid', Boolean(octets));
  result.classList.toggle('invalid', !octets);
  result.textContent = octets
    ? `✓ Valid IPv4 address · ${addressType(octets)}`
    : '× Invalid IPv4 address · use four octets from 0 to 255';
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} seconds`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.round(seconds % 60);
  if (hours) return `${hours}h ${minutes}m ${remaining}s`;
  return `${minutes}m ${remaining}s`;
}

function estimateTransfer(event) {
  event.preventDefault();
  const size = Number(byId('file-size').value);
  const speed = Number(byId('link-speed').value);
  const efficiency = Number(byId('efficiency').value);
  const unit = byId('file-unit').value;
  const result = byId('transfer-result');

  if (!(size > 0) || !(speed > 0)) {
    result.innerHTML = '<strong>Check inputs</strong><span>size and link speed must be greater than zero</span>';
    return;
  }

  const multipliers = { MB: 1, GB: 1024, TB: 1024 * 1024 };
  const megabits = size * multipliers[unit] * 8;
  const seconds = megabits / (speed * efficiency);
  result.innerHTML = `<strong>${formatDuration(seconds)}</strong><span>at ${(speed * efficiency).toFixed(1)} Mbps effective throughput</span>`;
}

const keyHistory = [];

function recordKey(event) {
  if (event.target.closest('input, select, button')) return;
  if (event.target !== byId('key-display') && !byId('key-display').contains(event.target)) return;
  event.preventDefault();
  const value = event.key === ' ' ? 'Spacebar' : event.key;
  byId('key-display').innerHTML = `Key: <strong>${value.replace(/[<>]/g, '')}</strong><br><small>Code: ${event.code.replace(/[<>]/g, '')}</small>`;
  keyHistory.unshift(`${value} · ${event.code}`);
  if (keyHistory.length > 6) keyHistory.pop();
  byId('history-box').innerHTML = keyHistory.map((item) => `<li>${item.replace(/[<>]/g, '')}</li>`).join('');
}

function inspectUrl(event) {
  event.preventDefault();
  const raw = byId('url-input').value.trim();
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');

    const signals = [];
    if (parsed.protocol === 'http:') signals.push('unencrypted HTTP');
    if (parsed.username || parsed.password) signals.push('embedded credentials');
    if (parsed.hostname.startsWith('xn--') || parsed.hostname.includes('.xn--')) signals.push('punycode hostname');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname)) signals.push('IP-literal host');
    if (parsed.href.length > 180) signals.push('unusually long URL');

    const effectivePort = parsed.port || (parsed.protocol === 'https:' ? '443 (default)' : '80 (default)');
    byId('url-protocol').textContent = parsed.protocol.replace(':', '').toUpperCase();
    byId('url-host').textContent = parsed.hostname;
    byId('url-port').textContent = effectivePort;
    byId('url-path').textContent = `${parsed.pathname || '/'}${parsed.hash || ''}`;
    byId('url-query').textContent = `${[...parsed.searchParams].length} parameter${[...parsed.searchParams].length === 1 ? '' : 's'}`;
    byId('url-signals').textContent = signals.length ? signals.join(' · ') : 'no obvious structural flags';
  } catch {
    byId('url-protocol').textContent = 'Invalid';
    byId('url-host').textContent = 'Enter a valid web URL or hostname';
    ['url-port', 'url-path', 'url-query', 'url-signals'].forEach((id) => { byId(id).textContent = '—'; });
  }
}

const commonPorts = {
  20: ['FTP data', 'TCP', 'Legacy file-transfer data channel; avoid exposing it directly to the internet.'],
  21: ['FTP control', 'TCP', 'Legacy file transfer; credentials and data are not encrypted by default.'],
  22: ['SSH / SFTP', 'TCP', 'Secure remote shell and file transfer. Restrict access and use strong authentication.'],
  23: ['Telnet', 'TCP', 'Unencrypted remote terminal service; replace with SSH where possible.'],
  25: ['SMTP', 'TCP', 'Server-to-server email transport.'],
  53: ['DNS', 'TCP / UDP', 'Name resolution; UDP is common, TCP supports larger responses and zone transfers.'],
  67: ['DHCP server', 'UDP', 'Assigns network configuration to clients.'],
  68: ['DHCP client', 'UDP', 'Receives network configuration from a DHCP server.'],
  80: ['HTTP', 'TCP', 'Unencrypted web traffic; redirect sensitive sites to HTTPS.'],
  110: ['POP3', 'TCP', 'Legacy mail retrieval; prefer encrypted variants.'],
  123: ['NTP', 'UDP', 'Network time synchronization.'],
  135: ['Microsoft RPC', 'TCP / UDP', 'Windows RPC endpoint mapper; normally restricted to trusted networks.'],
  137: ['NetBIOS name service', 'UDP', 'Legacy Windows name resolution.'],
  139: ['NetBIOS session', 'TCP', 'Legacy Windows file and printer sharing.'],
  143: ['IMAP', 'TCP', 'Mail retrieval; use encrypted IMAPS where available.'],
  161: ['SNMP', 'UDP', 'Network monitoring; prefer SNMPv3 and restrict management access.'],
  389: ['LDAP', 'TCP / UDP', 'Directory queries; use TLS for sensitive directory traffic.'],
  443: ['HTTPS', 'TCP / UDP', 'Encrypted web traffic; HTTP/3 commonly uses UDP via QUIC.'],
  445: ['SMB', 'TCP', 'Windows file sharing; keep internet-blocked and restrict lateral access.'],
  465: ['SMTPS', 'TCP', 'SMTP submission over implicit TLS.'],
  514: ['Syslog', 'UDP', 'Common log transport; secure transports are preferred for sensitive logs.'],
  587: ['SMTP submission', 'TCP', 'Authenticated email submission, commonly upgraded with STARTTLS.'],
  636: ['LDAPS', 'TCP', 'LDAP over TLS.'],
  993: ['IMAPS', 'TCP', 'IMAP mail retrieval over TLS.'],
  995: ['POP3S', 'TCP', 'POP3 mail retrieval over TLS.'],
  1433: ['Microsoft SQL Server', 'TCP', 'Database service; restrict to application and administration networks.'],
  3306: ['MySQL', 'TCP', 'Database service; do not expose publicly without strong controls.'],
  3389: ['Remote Desktop', 'TCP / UDP', 'Windows remote desktop; protect with VPN, MFA, and access controls.'],
  5432: ['PostgreSQL', 'TCP', 'Database service; restrict to trusted hosts.'],
  5900: ['VNC', 'TCP', 'Remote desktop protocol; tunnel and authenticate securely.'],
  8080: ['Alternate HTTP', 'TCP', 'Common development, proxy, and application web port.']
};

function lookupPort(event) {
  event.preventDefault();
  const port = Number(byId('port-input').value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    byId('port-service').textContent = 'Invalid port';
    byId('port-transport').textContent = 'Use 0–65535';
    byId('port-description').textContent = 'Port numbers must be whole numbers.';
    byId('port-range').textContent = '—';
    return;
  }

  const match = commonPorts[port];
  const range = port <= 1023 ? 'Well-known port' : port <= 49151 ? 'Registered port' : 'Dynamic / private port';
  byId('port-service').textContent = match ? match[0] : 'No common service in local reference';
  byId('port-transport').textContent = match ? match[1] : 'Protocol varies';
  byId('port-description').textContent = match ? match[2] : 'The port is valid, but this compact offline reference has no standard association for it.';
  byId('port-range').textContent = `Port ${port} · ${range}`;
}

function evaluatePassword() {
  const value = byId('password-input').value;
  const feedback = [];
  let pool = 0;
  if (/[a-z]/.test(value)) pool += 26;
  if (/[A-Z]/.test(value)) pool += 26;
  if (/\d/.test(value)) pool += 10;
  if (/[^A-Za-z\d]/.test(value)) pool += 33;

  const bits = value.length && pool ? Math.round(value.length * Math.log2(pool)) : 0;
  let label = 'Awaiting input';
  let score = 0;
  if (value) {
    if (bits < 36) { label = 'Very weak'; score = 15; }
    else if (bits < 60) { label = 'Weak'; score = 35; }
    else if (bits < 80) { label = 'Fair'; score = 58; }
    else if (bits < 100) { label = 'Strong'; score = 78; }
    else { label = 'Very strong'; score = 100; }
  }

  if (value.length < 14) feedback.push('Use at least 14 characters.');
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z\d]/.test(value)) feedback.push('Add more character variety or use a longer passphrase.');
  if (/(.)\1{2,}/.test(value)) feedback.push('Avoid repeated character runs.');
  if (!value) feedback.push('Use a long, unique password or passphrase.');
  if (value && !feedback.length) feedback.push('Good length and character variety; uniqueness still matters.');

  byId('strength-label').textContent = label;
  byId('entropy-bits').textContent = `${bits} estimated bits`;
  byId('strength-fill').style.width = `${score}%`;
  byId('password-feedback').replaceChildren(...feedback.map((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    return li;
  }));
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToUtf8(value) {
  const binary = atob(value.replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function transformText(event) {
  event.preventDefault();
  const input = byId('codec-input').value;
  const mode = byId('codec-mode').value;
  try {
    const transforms = {
      'base64-encode': utf8ToBase64,
      'base64-decode': base64ToUtf8,
      'url-encode': encodeURIComponent,
      'url-decode': decodeURIComponent
    };
    byId('codec-output').value = transforms[mode](input);
  } catch {
    byId('codec-output').value = 'Unable to decode this input. Check the selected format and try again.';
  }
}

function permissionText(digit) {
  const value = Number(digit);
  return `${value & 4 ? 'r' : '-'}${value & 2 ? 'w' : '-'}${value & 1 ? 'x' : '-'}`;
}

function permissionWords(digit) {
  const value = Number(digit);
  const words = [];
  if (value & 4) words.push('read');
  if (value & 2) words.push('write');
  if (value & 1) words.push('execute');
  return words.length ? words.join(', ') : 'no permissions';
}

function applySpecialPermission(symbolic, specialDigit) {
  const special = Number(specialDigit || 0);
  const chars = [...symbolic];
  if (special & 4) chars[2] = chars[2] === 'x' ? 's' : 'S';
  if (special & 2) chars[5] = chars[5] === 'x' ? 's' : 'S';
  if (special & 1) chars[8] = chars[8] === 'x' ? 't' : 'T';
  return chars.join('');
}

function convertPermissions(event) {
  event.preventDefault();
  const raw = byId('permissions-input').value.trim();
  if (!/^[0-7]{3,4}$/.test(raw)) {
    byId('permission-symbolic').textContent = 'Invalid';
    byId('permission-command').textContent = 'Use three or four octal digits from 0 to 7.';
    ['permission-owner', 'permission-group', 'permission-others'].forEach((id) => { byId(id).textContent = '—'; });
    return;
  }

  const standard = raw.slice(-3);
  const [owner, group, others] = standard;
  const special = raw.length === 4 ? raw[0] : '';
  const symbolic = `${permissionText(owner)}${permissionText(group)}${permissionText(others)}`;
  byId('permission-symbolic').textContent = applySpecialPermission(symbolic, special);
  byId('permission-command').textContent = `chmod ${raw} filename${special && special !== '0' ? ' · includes special mode bits' : ''}`;
  byId('permission-owner').textContent = permissionWords(owner);
  byId('permission-group').textContent = permissionWords(group);
  byId('permission-others').textContent = permissionWords(others);
}

function parseBigInt(value, base) {
  const cleaned = value.trim().replace(/_/g, '');
  const patterns = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[\da-fA-F]+$/ };
  if (!patterns[base].test(cleaned)) throw new Error('Invalid digits');
  if (base === 10) return BigInt(cleaned);
  if (base === 16) return BigInt(`0x${cleaned}`);
  if (base === 8) return BigInt(`0o${cleaned}`);
  return BigInt(`0b${cleaned}`);
}

function convertBase(event) {
  event.preventDefault();
  try {
    const number = parseBigInt(byId('base-input').value, Number(byId('base-source').value));
    byId('base-binary').textContent = number.toString(2);
    byId('base-octal').textContent = number.toString(8);
    byId('base-decimal').textContent = number.toString(10);
    byId('base-hex').textContent = number.toString(16).toUpperCase();
    byId('base-error').textContent = '';
  } catch {
    byId('base-error').textContent = 'The value contains digits that are not valid for the selected input base.';
    ['base-binary', 'base-octal', 'base-decimal', 'base-hex'].forEach((id) => { byId(id).textContent = '—'; });
  }
}

byId('subnet-form').addEventListener('submit', calculateSubnet);
byId('ip-form').addEventListener('submit', validateIPv4);
byId('transfer-form').addEventListener('submit', estimateTransfer);
byId('key-display').addEventListener('keydown', recordKey);
byId('clear-history').addEventListener('click', () => {
  keyHistory.length = 0;
  byId('history-box').innerHTML = '';
  byId('key-display').innerHTML = 'Awaiting input<br><small>Click here, then press any key</small>';
  byId('key-display').focus();
});
byId('url-form').addEventListener('submit', inspectUrl);
byId('port-form').addEventListener('submit', lookupPort);
byId('password-input').addEventListener('input', evaluatePassword);
byId('show-password').addEventListener('change', (event) => {
  byId('password-input').type = event.target.checked ? 'text' : 'password';
});
byId('codec-form').addEventListener('submit', transformText);
byId('permissions-form').addEventListener('submit', convertPermissions);
byId('base-form').addEventListener('submit', convertBase);

byId('subnet-form').requestSubmit();
byId('transfer-form').requestSubmit();
byId('url-form').requestSubmit();
byId('port-form').requestSubmit();
byId('codec-form').requestSubmit();
byId('permissions-form').requestSubmit();
byId('base-form').requestSubmit();
