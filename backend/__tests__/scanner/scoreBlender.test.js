const { blendScores } = require('../../scanner/scoreBlender');

describe('blendScores', () => {
  const originalWeight = process.env.BLEND_AXE_WEIGHT;

  afterEach(() => {
    if (originalWeight === undefined) {
      delete process.env.BLEND_AXE_WEIGHT;
    } else {
      process.env.BLEND_AXE_WEIGHT = originalWeight;
    }
  });

  test('blends scores with default 0.5 weights', () => {
    delete process.env.BLEND_AXE_WEIGHT;

    expect(blendScores({ axeScore: 80, lighthouseScore: 60 })).toBe(70);
  });

  test('uses configured axe weight', () => {
    process.env.BLEND_AXE_WEIGHT = '0.8';

    expect(blendScores({ axeScore: 90, lighthouseScore: 50 })).toBe(82);
  });

  test('clamps configured weight to 0..1', () => {
    process.env.BLEND_AXE_WEIGHT = '2';
    expect(blendScores({ axeScore: 90, lighthouseScore: 50 })).toBe(90);

    process.env.BLEND_AXE_WEIGHT = '-1';
    expect(blendScores({ axeScore: 90, lighthouseScore: 50 })).toBe(50);
  });

  test('falls back to default weight for invalid env value', () => {
    process.env.BLEND_AXE_WEIGHT = 'not-a-number';

    expect(blendScores({ axeScore: 40, lighthouseScore: 80 })).toBe(60);
  });

  test('returns lighthouse score when axe is null', () => {
    expect(blendScores({ axeScore: null, lighthouseScore: 77 })).toBe(77);
  });

  test('returns axe score when lighthouse is null', () => {
    expect(blendScores({ axeScore: 73, lighthouseScore: null })).toBe(73);
  });

  test('throws when both scores are null', () => {
    expect(() => blendScores({ axeScore: null, lighthouseScore: null })).toThrow(
      /both axeScore and lighthouseScore are null/i
    );
  });

  test('clamps out-of-range numeric inputs to 0..100 before blending', () => {
    process.env.BLEND_AXE_WEIGHT = '0.5';

    expect(blendScores({ axeScore: -20, lighthouseScore: 150 })).toBe(50);
  });
});
