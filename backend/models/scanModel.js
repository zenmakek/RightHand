const { query, getClient } = require('../database/pool');

const mapViolationRow = (row) => ({
  id: row.id,
  scan_id: row.scan_id,
  rule_id: row.rule_id,
  description: row.description,
  help_url: row.help_url,
  impact: row.impact,
  element: row.element,
  wcag_tags: row.wcag_tags || [],
});

const mapScanRow = (row) => ({
  id: row.id,
  url: row.url,
  accessibility_score: row.accessibility_score,
  axe_score: row.axe_score,
  lighthouse_score: row.lighthouse_score,
  scan_duration_ms: row.scan_duration_ms,
  status: row.status,
  error_message: row.error_message,
  scan_date: row.scan_date,
});

const createScan = async ({
  url,
  accessibilityScore,
  axeScore = null,
  lighthouseScore = null,
  scanDurationMs = null,
  violations = [],
  status = 'completed',
  errorMessage = null,
}) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const scanInsertText = `
      INSERT INTO scans (url, accessibility_score, axe_score, lighthouse_score, scan_duration_ms, status, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, url, accessibility_score, axe_score, lighthouse_score, scan_duration_ms, status, error_message, scan_date
    `;
    const scanInsertValues = [
      url,
      accessibilityScore,
      axeScore,
      lighthouseScore,
      scanDurationMs,
      status,
      errorMessage,
    ];
    const scanResult = await client.query(scanInsertText, scanInsertValues);
    const createdScan = mapScanRow(scanResult.rows[0]);

    const insertedViolations = [];
    for (const violation of violations) {
      const violationInsertText = `
        INSERT INTO violations (scan_id, rule_id, description, help_url, impact, element, wcag_tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, scan_id, rule_id, description, help_url, impact, element, wcag_tags
      `;
      const violationInsertValues = [
        createdScan.id,
        violation.ruleId,
        violation.description,
        violation.helpUrl || null,
        violation.impact,
        violation.element || null,
        violation.wcagTags || [],
      ];

      const violationResult = await client.query(violationInsertText, violationInsertValues);
      insertedViolations.push(mapViolationRow(violationResult.rows[0]));
    }

    await client.query('COMMIT');

    return {
      ...createdScan,
      violations: insertedViolations,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getAllScans = async ({ limit = 50, offset = 0 } = {}) => {
  const scansText = `
    SELECT
      s.id,
      s.url,
      s.accessibility_score,
      s.axe_score,
      s.lighthouse_score,
      s.scan_duration_ms,
      s.status,
      s.error_message,
      s.scan_date,
      COUNT(v.id)::INTEGER AS violation_count,
      COUNT(v.id) FILTER (WHERE v.impact = 'critical')::INTEGER AS critical_count,
      COUNT(v.id) FILTER (WHERE v.impact = 'serious')::INTEGER AS serious_count,
      COUNT(v.id) FILTER (WHERE v.impact = 'moderate')::INTEGER AS moderate_count,
      COUNT(v.id) FILTER (WHERE v.impact = 'minor')::INTEGER AS minor_count
    FROM scans s
    LEFT JOIN violations v ON v.scan_id = s.id
    GROUP BY s.id
    ORDER BY s.scan_date DESC
    LIMIT $1 OFFSET $2
  `;
  const result = await query(scansText, [limit, offset]);

  return result.rows.map((row) => ({
    ...mapScanRow(row),
    violation_count: row.violation_count,
    severity_counts: {
      critical: row.critical_count,
      serious: row.serious_count,
      moderate: row.moderate_count,
      minor: row.minor_count,
    },
  }));
};

const getScanById = async (id) => {
  const scanText = `
    SELECT
      s.id,
      s.url,
      s.accessibility_score,
      s.axe_score,
      s.lighthouse_score,
      s.scan_duration_ms,
      s.status,
      s.error_message,
      s.scan_date,
      COALESCE(
        json_agg(
          json_build_object(
            'id', v.id,
            'scan_id', v.scan_id,
            'rule_id', v.rule_id,
            'description', v.description,
            'help_url', v.help_url,
            'impact', v.impact,
            'element', v.element,
            'wcag_tags', v.wcag_tags
          )
          ORDER BY v.id
        ) FILTER (WHERE v.id IS NOT NULL),
        '[]'::json
      ) AS violations
    FROM scans s
    LEFT JOIN violations v ON v.scan_id = s.id
    WHERE s.id = $1
    GROUP BY s.id
  `;

  const result = await query(scanText, [id]);
  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    ...mapScanRow(row),
    violations: Array.isArray(row.violations)
      ? row.violations.map((violation) => mapViolationRow(violation))
      : [],
  };
};

module.exports = {
  createScan,
  getAllScans,
  getScanById,
};
