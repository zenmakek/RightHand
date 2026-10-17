const { computeAxeScore } = require('../../scanner/axeRunner');

describe('computeAxeScore', () => {
  test('returns 100 when there are no violations', () => {
    expect(computeAxeScore([], 0)).toBe(100);
  });

  test('applies weighted penalties by impact', () => {
    const violations = [
      { ruleId: 'a', impact: 'critical' },
      { ruleId: 'b', impact: 'serious' },
      { ruleId: 'c', impact: 'moderate' },
      { ruleId: 'd', impact: 'minor' },
    ];

    expect(computeAxeScore(violations, 0)).toBe(82);
  });

  test('treats null impact as minor', () => {
    const violations = [{ ruleId: 'a', impact: null }];

    expect(computeAxeScore(violations, 0)).toBe(99);
  });

  test('caps repeated penalties for the same rule', () => {
    const repeated = Array.from({ length: 20 }, () => ({ ruleId: 'same', impact: 'critical' }));

    // Each critical is 10, but per-rule cap is 15.
    expect(computeAxeScore(repeated, 0)).toBe(85);
  });

  test('can reach floor score 0 with many distinct severe rules', () => {
    const manyRules = Array.from({ length: 20 }, (_, idx) => ({
      ruleId: `rule-${idx}`,
      impact: 'critical',
    }));

    expect(computeAxeScore(manyRules, 0)).toBe(0);
  });

  test('adds deterministic pass bonus up to cap', () => {
    expect(computeAxeScore([], 0)).toBe(100);
    expect(computeAxeScore([{ ruleId: 'x', impact: 'moderate' }], 25)).toBe(99);
    expect(computeAxeScore([{ ruleId: 'x', impact: 'moderate' }], 500)).toBe(100);
  });

  test('is deterministic for the same input', () => {
    const input = [
      { ruleId: 'one', impact: 'serious' },
      { ruleId: 'one', impact: 'serious' },
      { ruleId: 'two', impact: 'critical' },
    ];

    const first = computeAxeScore(input, 80);
    const second = computeAxeScore(input, 80);

    expect(first).toBe(second);
  });
});
