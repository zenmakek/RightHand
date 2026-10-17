jest.mock('dns', () => ({
  promises: {
    lookup: jest.fn(),
  },
}));

const dns = require('dns').promises;

const {
  ValidationError,
  validateUrl,
  validateUrlResolved,
  isPrivateIp,
  isRequestAllowed,
  __testOnly,
} = require('../../utils/urlValidator');

describe('validateUrl', () => {
  test.each([
    ['https://example.com', 'https://example.com/'],
    ['http://example.org/path?x=1', 'http://example.org/path?x=1'],
    ['  https://sub.domain.com  ', 'https://sub.domain.com/'],
    ['https://172.15.255.255/path', 'https://172.15.255.255/path'],
    ['https://172.32.0.0', 'https://172.32.0.0/'],
    ['https://8.8.8.8', 'https://8.8.8.8/'],
    ['https://[2001:4860:4860::8888]/', 'https://[2001:4860:4860::8888]/'],
  ])('accepts public URL %s', (input, expected) => {
    expect(validateUrl(input)).toBe(expected);
  });

  test.each([
    [''],
    ['    '],
    [null],
    [undefined],
    [123],
    ['not a url'],
    ['ftp://example.com'],
    ['file:///etc/passwd'],
    ['javascript:alert(1)'],
    ['data:text/plain,hello'],
    ['https://user:pass@example.com'],
    ['https://localhost'],
    ['https://localhost:3000'],
    ['https://api.localhost'],
    ['https://machine.local'],
    ['https://service.internal'],
    ['http://intranet'],
    ['http://2130706433'],
    ['http://0x7f.0.0.1'],
    ['http://0177.0.0.1'],
    ['http://127.1'],
    ['http://0.0.0.1'],
    ['http://10.0.0.1'],
    ['http://100.64.0.1'],
    ['http://127.0.0.1'],
    ['http://169.254.169.254'],
    ['http://172.16.0.0'],
    ['http://172.31.255.255'],
    ['http://192.0.0.1'],
    ['http://192.168.1.1'],
    ['http://198.18.0.1'],
    ['http://224.0.0.1'],
    ['http://240.0.0.1'],
    ['http://[::1]/'],
    ['http://[::]/'],
    ['http://[fc00::1]/'],
    ['http://[fe80::1]/'],
    ['http://[::ffff:127.0.0.1]/'],
    [`https://example.com/${'a'.repeat(2050)}`],
  ])('rejects unsafe or invalid URL %p', (input) => {
    expect(() => validateUrl(input)).toThrow(ValidationError);
  });

  test('error has statusCode 400', () => {
    const capturedError = (() => {
      try {
        validateUrl('ftp://example.com');
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(capturedError).toBeInstanceOf(ValidationError);
    expect(capturedError.statusCode).toBe(400);
    expect(capturedError.message).toMatch(/allowed/i);
  });

  test('rejects URL with empty hostname after parsing', () => {
    expect(() => validateUrl('http:///only-path')).toThrow(ValidationError);
  });

  test.each(['http://2130706433', 'http://0x7f.0.0.1', 'http://0177.0.0.1'])(
    'rejects obfuscated IPv4 format %s with specific message',
    (input) => {
      expect(() => validateUrl(input)).toThrow(/Obfuscated or non-canonical IPv4/);
    }
  );
});

describe('isPrivateIp boundaries', () => {
  test.each([
    ['0.0.0.0', true],
    ['0.255.255.255', true],
    ['1.0.0.0', false],
    ['9.255.255.255', false],
    ['10.0.0.0', true],
    ['10.255.255.255', true],
    ['11.0.0.0', false],
    ['100.63.255.255', false],
    ['100.64.0.0', true],
    ['100.127.255.255', true],
    ['100.128.0.0', false],
    ['126.255.255.255', false],
    ['127.0.0.0', true],
    ['127.255.255.255', true],
    ['128.0.0.0', false],
    ['169.253.255.255', false],
    ['169.254.0.0', true],
    ['169.254.255.255', true],
    ['169.255.0.0', false],
    ['172.15.255.255', false],
    ['172.16.0.0', true],
    ['172.31.255.255', true],
    ['172.32.0.0', false],
    ['191.255.255.255', false],
    ['192.0.0.0', true],
    ['192.0.0.255', true],
    ['192.0.1.0', false],
    ['192.167.255.255', false],
    ['192.168.0.0', true],
    ['192.168.255.255', true],
    ['192.169.0.0', false],
    ['198.17.255.255', false],
    ['198.18.0.0', true],
    ['198.19.255.255', true],
    ['198.20.0.0', false],
    ['223.255.255.255', false],
    ['224.0.0.0', true],
    ['239.255.255.255', true],
    ['240.0.0.0', true],
    ['255.255.255.255', true],
    ['8.8.8.8', false],
    ['::', true],
    ['::1', true],
    ['2001:4860:4860::8888', false],
    ['fc00::1', true],
    ['fdff::1', true],
    ['fe80::1', true],
    ['febf::1', true],
    ['fec0::1', false],
    ['::ffff:127.0.0.1', true],
    ['::ffff:7f00:1', true],
    ['::ffff:8.8.8.8', false],
    ['::ffff:gggg', false],
    ['2001:db8::192.0.2.33', false],
    ['', false],
    ['not-an-ip', false],
  ])('classifies %s as private=%s', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe('validateUrlResolved', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns normalized URL when DNS resolves to public IPs', async () => {
    dns.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    await expect(validateUrlResolved('https://example.com')).resolves.toBe('https://example.com/');
    expect(dns.lookup).toHaveBeenCalledWith('example.com', { all: true, verbatim: true });
  });

  test('rejects DNS rebinding to private IP', async () => {
    dns.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.10.10.10', family: 4 },
    ]);

    await expect(validateUrlResolved('https://safe-looking-domain.com')).rejects.toThrow(
      ValidationError
    );
  });

  test('rejects unresolvable host', async () => {
    dns.lookup.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(validateUrlResolved('https://example.com')).rejects.toThrow(ValidationError);
  });

  test('does not perform DNS lookup for direct IP hosts', async () => {
    await expect(validateUrlResolved('https://8.8.8.8')).resolves.toBe('https://8.8.8.8/');
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  test('does not perform DNS lookup for direct IPv6 hosts', async () => {
    await expect(validateUrlResolved('https://[2001:4860:4860::8888]/')).resolves.toBe(
      'https://[2001:4860:4860::8888]/'
    );
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  test('rejects when DNS resolves to no addresses', async () => {
    dns.lookup.mockResolvedValue([]);

    await expect(validateUrlResolved('https://example.com')).rejects.toThrow(ValidationError);
  });
});

describe('isRequestAllowed', () => {
  test('allows public request URL', () => {
    expect(isRequestAllowed('https://example.com/path')).toBe(true);
  });

  test('blocks local/private request URL', () => {
    expect(isRequestAllowed('http://localhost/admin')).toBe(false);
    expect(isRequestAllowed('http://192.168.0.10/admin')).toBe(false);
  });
});

describe('urlValidator internals', () => {
  test('parseIPv6ToBigInt returns null for invalid embedded IPv4 segment', () => {
    expect(__testOnly.parseIPv6ToBigInt('::ffff:300.1.1.1')).toBeNull();
  });

  test('parseIPv6ToBigInt returns null when :: expansion would exceed 8 parts', () => {
    expect(__testOnly.parseIPv6ToBigInt('::ffff:1:2:3:4:5:6:7:8')).toBeNull();
  });

  test('parseIPv6ToBigInt returns null for non-:: form with invalid part count', () => {
    expect(__testOnly.parseIPv6ToBigInt('1:2:3:4:5:6:7')).toBeNull();
  });
});
