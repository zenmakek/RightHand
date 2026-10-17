const dns = require('dns').promises;
const net = require('net');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

const IPV4_MAX = 0xffffffff;

const toValidationError = (message) => new ValidationError(message);

const normalizeIpCandidate = (hostname) => {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
};

const extractRawHostname = (input) => {
  const authorityMatch = input.match(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\/([^/?#]+)/);
  if (!authorityMatch) {
    return '';
  }

  const authority = authorityMatch[1];
  const withoutCredentials = authority.includes('@') ? authority.split('@').pop() : authority;

  if (withoutCredentials.startsWith('[')) {
    const endIndex = withoutCredentials.indexOf(']');
    if (endIndex > -1) {
      return withoutCredentials.slice(1, endIndex).toLowerCase();
    }
  }

  const hostPart = withoutCredentials.split(':')[0];
  return hostPart.toLowerCase();
};

const hasLeadingZeroNumber = (part) => /^0[0-9]+$/.test(part) && part !== '0';

const parseIPv4ToInt = (ip) => {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const octets = [];
  for (const part of parts) {
    if (!/^[0-9]+$/.test(part) || hasLeadingZeroNumber(part)) {
      return null;
    }
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return null;
    }
    octets.push(value);
  }

  return ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
};

const isInIpv4Range = (ipInt, start, end) => ipInt >= start && ipInt <= end;

const expandEmbeddedIpv4 = (part) => {
  const ipInt = parseIPv4ToInt(part);
  if (ipInt === null) {
    return null;
  }

  return [((ipInt >>> 16) & 0xffff).toString(16), (ipInt & 0xffff).toString(16)];
};

const parseIPv6ToBigInt = (ip) => {
  if (typeof ip !== 'string' || ip.length === 0) {
    return null;
  }

  const normalized = ip.toLowerCase();
  if (normalized.includes(':::')) {
    return null;
  }

  const doubleColonMatches = normalized.match(/::/g);
  if (doubleColonMatches && doubleColonMatches.length > 1) {
    return null;
  }

  const [leftRaw, rightRaw] = normalized.split('::');
  const left = leftRaw ? leftRaw.split(':').filter(Boolean) : [];
  const right = rightRaw ? rightRaw.split(':').filter(Boolean) : [];

  const expandParts = (parts) => {
    const expanded = [];
    for (const part of parts) {
      if (part.includes('.')) {
        const mapped = expandEmbeddedIpv4(part);
        if (!mapped) {
          return null;
        }
        expanded.push(...mapped);
      } else {
        expanded.push(part);
      }
    }
    return expanded;
  };

  const leftExpanded = expandParts(left);
  const rightExpanded = expandParts(right);

  if (!leftExpanded || !rightExpanded) {
    return null;
  }

  let parts;
  if (normalized.includes('::')) {
    const missingCount = 8 - (leftExpanded.length + rightExpanded.length);
    if (missingCount < 0) {
      return null;
    }
    parts = [...leftExpanded, ...Array(missingCount).fill('0'), ...rightExpanded];
  } else {
    parts = [...leftExpanded, ...rightExpanded];
    if (parts.length !== 8) {
      return null;
    }
  }

  let result = 0n;
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) {
      return null;
    }
    const value = parseInt(part, 16);
    result = (result << 16n) + BigInt(value);
  }

  return result;
};

const isIpv6InPrefix = (ipBigInt, prefixBigInt, prefixLength) => {
  const shift = 128n - BigInt(prefixLength);
  return (ipBigInt >> shift) === (prefixBigInt >> shift);
};

const isPrivateIpv4 = (ip) => {
  const ipInt = parseIPv4ToInt(ip);
  if (ipInt === null) {
    return false;
  }

  return (
    isInIpv4Range(ipInt, 0x00000000, 0x00ffffff) ||
    isInIpv4Range(ipInt, 0x0a000000, 0x0affffff) ||
    isInIpv4Range(ipInt, 0x64400000, 0x647fffff) ||
    isInIpv4Range(ipInt, 0x7f000000, 0x7fffffff) ||
    isInIpv4Range(ipInt, 0xa9fe0000, 0xa9feffff) ||
    isInIpv4Range(ipInt, 0xac100000, 0xac1fffff) ||
    isInIpv4Range(ipInt, 0xc0000000, 0xc00000ff) ||
    isInIpv4Range(ipInt, 0xc0a80000, 0xc0a8ffff) ||
    isInIpv4Range(ipInt, 0xc6120000, 0xc613ffff) ||
    isInIpv4Range(ipInt, 0xe0000000, 0xefffffff) ||
    isInIpv4Range(ipInt, 0xf0000000, IPV4_MAX)
  );
};

const isPrivateIpv6 = (ip) => {
  const ipBigInt = parseIPv6ToBigInt(ip);

  const loopback = parseIPv6ToBigInt('::1');
  const unspecified = parseIPv6ToBigInt('::');
  const fc00 = parseIPv6ToBigInt('fc00::');
  const fe80 = parseIPv6ToBigInt('fe80::');

  if (ipBigInt === loopback || ipBigInt === unspecified) {
    return true;
  }

  if (isIpv6InPrefix(ipBigInt, fc00, 7)) {
    return true;
  }

  if (isIpv6InPrefix(ipBigInt, fe80, 10)) {
    return true;
  }

  return false;
};

const isObfuscatedIpv4Host = (hostname) => {
  const lowered = hostname.toLowerCase();

  if (/^[0-9]+$/.test(lowered)) {
    return true;
  }

  const parts = lowered.split('.');
  const allNumericLike = parts.every((part) => /^(0x[0-9a-f]+|[0-9]+)$/.test(part));
  if (!allNumericLike) {
    return false;
  }

  if (parts.some((part) => part.startsWith('0x'))) {
    return true;
  }

  if (parts.some((part) => hasLeadingZeroNumber(part))) {
    return true;
  }

  if (parts.length !== 4) {
    return true;
  }

  return false;
};

const isPrivateIp = (ip) => {
  if (typeof ip !== 'string' || ip.length === 0) {
    return false;
  }

  const normalized = ip.toLowerCase();

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isPrivateIpv4(mapped)) {
      return true;
    }

    const parsedMappedV6 = parseIPv6ToBigInt(normalized);
    const mappedPrefix = parseIPv6ToBigInt('::ffff:0:0');
    if (parsedMappedV6 !== null && isIpv6InPrefix(parsedMappedV6, mappedPrefix, 96)) {
      const mappedInt = Number(parsedMappedV6 & 0xffffffffn);
      const mappedIpv4 = [
        (mappedInt >>> 24) & 0xff,
        (mappedInt >>> 16) & 0xff,
        (mappedInt >>> 8) & 0xff,
        mappedInt & 0xff,
      ].join('.');

      return isPrivateIpv4(mappedIpv4);
    }
  }

  if (net.isIP(normalized) === 4) {
    return isPrivateIpv4(normalized);
  }

  if (net.isIP(normalized) === 6) {
    return isPrivateIpv6(normalized);
  }

  return false;
};

const validateUrl = (input) => {
  if (typeof input !== 'string') {
    throw toValidationError('URL must be a string.');
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw toValidationError('URL cannot be empty.');
  }

  if (trimmed.length > 2048) {
    throw toValidationError('URL exceeds maximum length of 2048 characters.');
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_error) {
    throw toValidationError('URL format is invalid.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw toValidationError('Only http and https URLs are allowed.');
  }

  if (parsed.username || parsed.password) {
    throw toValidationError('URLs with embedded credentials are not allowed.');
  }

  const rawHostname = extractRawHostname(trimmed).replace(/\.$/, '');
  if (rawHostname && isObfuscatedIpv4Host(rawHostname)) {
    throw toValidationError('Obfuscated or non-canonical IPv4 host formats are not allowed.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const hostnameWithoutTrailingDot = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  const ipCandidate = normalizeIpCandidate(hostnameWithoutTrailingDot);
  const ipVersion = net.isIP(ipCandidate);

  if (
    hostnameWithoutTrailingDot === 'localhost' ||
    hostnameWithoutTrailingDot.endsWith('.localhost') ||
    hostnameWithoutTrailingDot.endsWith('.local') ||
    hostnameWithoutTrailingDot.endsWith('.internal')
  ) {
    throw toValidationError('Local or internal hostnames are not allowed.');
  }

  if (ipVersion === 0 && !hostnameWithoutTrailingDot.includes('.')) {
    throw toValidationError('Hostnames must be fully qualified and include a dot.');
  }

  if (ipVersion > 0 && isPrivateIp(ipCandidate)) {
    throw toValidationError('Private or reserved IP addresses are not allowed.');
  }

  return parsed.toString();
};

const validateUrlResolved = async (input) => {
  const normalizedUrl = validateUrl(input);
  const hostname = new URL(normalizedUrl).hostname;
  const ipCandidate = normalizeIpCandidate(hostname);
  const ipVersion = net.isIP(ipCandidate);

  let addresses = [];
  if (ipVersion > 0) {
    addresses = [{ address: ipCandidate, family: ipVersion }];
  } else {
    try {
      addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch (_error) {
      throw toValidationError('Hostname could not be resolved.');
    }
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw toValidationError('Hostname did not resolve to any addresses.');
  }

  for (const record of addresses) {
    if (isPrivateIp(record.address)) {
      throw toValidationError(
        `Resolved address ${record.address} is private or reserved and is not allowed.`
      );
    }
  }

  return normalizedUrl;
};

const isRequestAllowed = (requestUrl) => {
  try {
    validateUrl(requestUrl);
    return true;
  } catch (_error) {
    return false;
  }
};

module.exports = {
  ValidationError,
  validateUrl,
  validateUrlResolved,
  isPrivateIp,
  isRequestAllowed,
  __testOnly: {
    parseIPv6ToBigInt,
  },
};
