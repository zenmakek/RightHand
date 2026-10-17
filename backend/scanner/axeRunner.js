const AxePuppeteer = require('@axe-core/puppeteer').default;

const IMPACT_WEIGHTS = {
  critical: 10,
  serious: 5,
  moderate: 2,
  minor: 1,
};

const MAX_VIOLATIONS = 200;
const MAX_ELEMENT_SNIPPET_LENGTH = 500;
const MAX_RULE_PENALTY = 15;

const normalizeImpact = (impact) => {
  if (impact && IMPACT_WEIGHTS[impact]) {
    return impact;
  }
  return 'minor';
};

const normalizeElement = (html) => {
  if (typeof html !== 'string') {
    return '';
  }
  return html.slice(0, MAX_ELEMENT_SNIPPET_LENGTH);
};

const runAxe = async (page) => {
  const axeResult = await new AxePuppeteer(page)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();

  const normalized = [];
  for (const violation of axeResult.violations) {
    for (const node of violation.nodes) {
      normalized.push({
        ruleId: violation.id,
        description: violation.description,
        helpUrl: violation.helpUrl,
        impact: normalizeImpact(violation.impact),
        element: normalizeElement(node.html),
        wcagTags: (violation.tags || []).filter((tag) => tag.startsWith('wcag')),
      });

      if (normalized.length >= MAX_VIOLATIONS) {
        return {
          violations: normalized,
          passesCount: axeResult.passes.length,
        };
      }
    }
  }

  return {
    violations: normalized,
    passesCount: axeResult.passes.length,
  };
};

const clampScore = (score) => Math.max(0, Math.min(100, Math.round(score)));

const computeAxeScore = (violations, passesCount = 0) => {
  const safeViolations = Array.isArray(violations) ? violations : [];

  // Scoring model:
  // - Starts at 100.
  // - Applies weighted penalties by violation impact severity.
  // - Penalties are capped per ruleId so one repeated rule cannot dominate the score.
  // - Adds a small deterministic pass bonus to reward broader standards compliance.
  const penaltiesByRule = new Map();
  for (const violation of safeViolations) {
    const impact = normalizeImpact(violation.impact);
    const penalty = IMPACT_WEIGHTS[impact];
    const ruleId = violation.ruleId || 'unknown-rule';
    const current = penaltiesByRule.get(ruleId) || 0;
    penaltiesByRule.set(ruleId, Math.min(MAX_RULE_PENALTY, current + penalty));
  }

  const totalPenalty = Array.from(penaltiesByRule.values()).reduce((sum, value) => sum + value, 0);
  const passBonus = Math.min(5, Math.floor(Math.max(0, Number(passesCount) || 0) / 25));

  return clampScore(100 - totalPenalty + passBonus);
};

module.exports = {
  runAxe,
  computeAxeScore,
};
