const fs = require('fs');
const path = require('path');

jest.mock('../../database/pool', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

const { query, getClient } = require('../../database/pool');
const { createScan, getAllScans, getScanById } = require('../../models/scanModel');

describe('scanModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createScan commits transaction and returns complete mapped object', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            url: 'https://example.com',
            accessibility_score: 88,
            axe_score: 84,
            lighthouse_score: 92,
            scan_duration_ms: 1432,
            status: 'completed',
            error_message: null,
            scan_date: '2026-10-17T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 21,
            scan_id: 7,
            rule_id: 'color-contrast',
            description: 'Insufficient contrast',
            help_url: 'https://dequeuniversity.com',
            impact: 'serious',
            element: '<a>Link</a>',
            wcag_tags: ['wcag2aa'],
          },
        ],
      })
      .mockResolvedValueOnce({});
    const release = jest.fn();
    getClient.mockResolvedValue({ query: clientQuery, release });

    const result = await createScan({
      url: 'https://example.com',
      accessibilityScore: 88,
      axeScore: 84,
      lighthouseScore: 92,
      scanDurationMs: 1432,
      status: 'completed',
      violations: [
        {
          ruleId: 'color-contrast',
          description: 'Insufficient contrast',
          helpUrl: 'https://dequeuniversity.com',
          impact: 'serious',
          element: '<a>Link</a>',
          wcagTags: ['wcag2aa'],
        },
      ],
    });

    expect(clientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(clientQuery).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: 7,
      url: 'https://example.com',
      accessibility_score: 88,
      axe_score: 84,
      lighthouse_score: 92,
      scan_duration_ms: 1432,
      status: 'completed',
      error_message: null,
      scan_date: '2026-10-17T00:00:00.000Z',
      violations: [
        {
          id: 21,
          scan_id: 7,
          rule_id: 'color-contrast',
          description: 'Insufficient contrast',
          help_url: 'https://dequeuniversity.com',
          impact: 'serious',
          element: '<a>Link</a>',
          wcag_tags: ['wcag2aa'],
        },
      ],
    });
  });

  test('createScan rolls back transaction on error', async () => {
    const expectedError = new Error('insert failed');
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(expectedError)
      .mockResolvedValueOnce({});
    const release = jest.fn();
    getClient.mockResolvedValue({ query: clientQuery, release });

    await expect(
      createScan({
        url: 'https://example.com',
        accessibilityScore: 77,
      })
    ).rejects.toThrow('insert failed');

    expect(clientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(clientQuery).toHaveBeenLastCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });

  test('createScan uses parameterized query and does not interpolate url', async () => {
    const maliciousUrl = "https://example.com'; DROP TABLE scans; --";
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            url: maliciousUrl,
            accessibility_score: 80,
            axe_score: null,
            lighthouse_score: null,
            scan_duration_ms: null,
            status: 'completed',
            error_message: null,
            scan_date: '2026-10-17T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({});

    getClient.mockResolvedValue({ query: clientQuery, release: jest.fn() });

    await createScan({
      url: maliciousUrl,
      accessibilityScore: 80,
    });

    const insertCall = clientQuery.mock.calls.find((call) =>
      call[0].includes('INSERT INTO scans')
    );
    expect(insertCall[0]).toContain('$1');
    expect(insertCall[0]).not.toContain(maliciousUrl);
    expect(insertCall[1][0]).toBe(maliciousUrl);
  });

  test('getAllScans forwards limit and offset and returns mapped rows', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: 10,
          url: 'https://a11y.example',
          accessibility_score: 91,
          axe_score: 89,
          lighthouse_score: 93,
          scan_duration_ms: 1800,
          status: 'completed',
          error_message: null,
          scan_date: '2026-10-17T00:00:00.000Z',
          violation_count: 3,
          critical_count: 1,
          serious_count: 1,
          moderate_count: 1,
          minor_count: 0,
        },
      ],
    });

    const result = await getAllScans({ limit: 25, offset: 5 });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1 OFFSET $2'), [25, 5]);
    expect(result).toEqual([
      {
        id: 10,
        url: 'https://a11y.example',
        accessibility_score: 91,
        axe_score: 89,
        lighthouse_score: 93,
        scan_duration_ms: 1800,
        status: 'completed',
        error_message: null,
        scan_date: '2026-10-17T00:00:00.000Z',
        violation_count: 3,
        severity_counts: {
          critical: 1,
          serious: 1,
          moderate: 1,
          minor: 0,
        },
      },
    ]);
  });

  test('getScanById returns null when scan does not exist', async () => {
    query.mockResolvedValue({ rows: [] });

    const result = await getScanById(999);

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE s.id = $1'), [999]);
  });

  test('getScanById maps scan and violations to API shape', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: 5,
          url: 'https://example.org',
          accessibility_score: 70,
          axe_score: 65,
          lighthouse_score: 75,
          scan_duration_ms: 2100,
          status: 'failed',
          error_message: 'Timeout reached',
          scan_date: '2026-10-17T00:00:00.000Z',
          violations: [
            {
              id: 100,
              scan_id: 5,
              rule_id: 'label',
              description: 'Label missing',
              help_url: 'https://dequeuniversity.com/rules/axe/4.10/label',
              impact: 'moderate',
              element: '<input type="text" />',
              wcag_tags: ['wcag131'],
            },
          ],
        },
      ],
    });

    const result = await getScanById(5);

    expect(result).toEqual({
      id: 5,
      url: 'https://example.org',
      accessibility_score: 70,
      axe_score: 65,
      lighthouse_score: 75,
      scan_duration_ms: 2100,
      status: 'failed',
      error_message: 'Timeout reached',
      scan_date: '2026-10-17T00:00:00.000Z',
      violations: [
        {
          id: 100,
          scan_id: 5,
          rule_id: 'label',
          description: 'Label missing',
          help_url: 'https://dequeuniversity.com/rules/axe/4.10/label',
          impact: 'moderate',
          element: '<input type="text" />',
          wcag_tags: ['wcag131'],
        },
      ],
    });
  });
});

describe('database/init.sql', () => {
  test('contains required CREATE TABLE statements and impact values', () => {
    const sqlPath = path.resolve(__dirname, '../../../database/init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS scans/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS violations/i);
    expect(sql).toContain("'critical'");
    expect(sql).toContain("'serious'");
    expect(sql).toContain("'moderate'");
    expect(sql).toContain("'minor'");
  });
});
