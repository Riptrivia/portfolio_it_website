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

byId('subnet-form').requestSubmit();
byId('transfer-form').requestSubmit();
