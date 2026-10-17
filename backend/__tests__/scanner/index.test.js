jest.mock('../../utils/urlValidator', () => ({
  validateUrlResolved: jest.fn(),
}));

jest.mock('../../scanner/browser', () => ({
  launchBrowser: jest.fn(),
  createSafePage: jest.fn(),
}));

jest.mock('../../scanner/axeRunner', () => ({
  runAxe: jest.fn(),
  computeAxeScore: jest.fn(),
}));

jest.mock('../../scanner/lighthouseRunner', () => ({
  runLighthouse: jest.fn(),
}));

jest.mock('../../scanner/scoreBlender', () => ({
  blendScores: jest.fn(),
}));

const { validateUrlResolved } = require('../../utils/urlValidator');
const { launchBrowser, createSafePage } = require('../../scanner/browser');
const { runAxe, computeAxeScore } = require('../../scanner/axeRunner');
const { runLighthouse } = require('../../scanner/lighthouseRunner');
const { blendScores } = require('../../scanner/scoreBlender');
const { scanUrl } = require('../../scanner');

describe('scanUrl orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns blended result and closes browser on success', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const browser = { close };
    const page = { goto: jest.fn().mockResolvedValue(undefined) };

    validateUrlResolved.mockResolvedValue('https://example.com/');
    launchBrowser.mockResolvedValue(browser);
    createSafePage.mockResolvedValue(page);
    runAxe.mockResolvedValue({ violations: [{ ruleId: 'a', impact: 'minor' }], passesCount: 20 });
    computeAxeScore.mockReturnValue(88);
    runLighthouse.mockResolvedValue({ score: 92 });
    blendScores.mockReturnValue(90);

    const result = await scanUrl('https://example.com');

    expect(validateUrlResolved).toHaveBeenCalledWith('https://example.com');
    expect(launchBrowser).toHaveBeenCalledTimes(1);
    expect(createSafePage).toHaveBeenCalledWith(browser);
    expect(page.goto).toHaveBeenCalledWith('https://example.com/', { waitUntil: 'networkidle2' });
    expect(runAxe).toHaveBeenCalledWith(page);
    expect(computeAxeScore).toHaveBeenCalledWith([{ ruleId: 'a', impact: 'minor' }], 20);
    expect(runLighthouse).toHaveBeenCalledWith('https://example.com/', browser);
    expect(blendScores).toHaveBeenCalledWith({ axeScore: 88, lighthouseScore: 92 });
    expect(close).toHaveBeenCalledTimes(1);

    expect(result).toEqual(
      expect.objectContaining({
        url: 'https://example.com/',
        accessibilityScore: 90,
        axeScore: 88,
        lighthouseScore: 92,
        violations: [{ ruleId: 'a', impact: 'minor' }],
        scanDurationMs: expect.any(Number),
      })
    );
  });

  test('continues with axe-only result when lighthouse fails and closes browser', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const browser = { close };
    const page = { goto: jest.fn().mockResolvedValue(undefined) };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    validateUrlResolved.mockResolvedValue('https://example.com/');
    launchBrowser.mockResolvedValue(browser);
    createSafePage.mockResolvedValue(page);
    runAxe.mockResolvedValue({ violations: [], passesCount: 30 });
    computeAxeScore.mockReturnValue(95);
    runLighthouse.mockRejectedValue(new Error('lighthouse crashed'));
    blendScores.mockReturnValue(95);

    const result = await scanUrl('https://example.com');

    expect(runLighthouse).toHaveBeenCalledTimes(1);
    expect(blendScores).toHaveBeenCalledWith({ axeScore: 95, lighthouseScore: null });
    expect(result.lighthouseScore).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Lighthouse failed/i));

    warnSpy.mockRestore();
  });

  test('closes browser when scan fails after launch', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const browser = { close };
    const page = { goto: jest.fn().mockRejectedValue(new Error('navigation failed')) };

    validateUrlResolved.mockResolvedValue('https://example.com/');
    launchBrowser.mockResolvedValue(browser);
    createSafePage.mockResolvedValue(page);

    await expect(scanUrl('https://example.com')).rejects.toThrow('navigation failed');
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('invalid URL fails before launching browser', async () => {
    validateUrlResolved.mockRejectedValue(new Error('bad url'));

    await expect(scanUrl('bad-input')).rejects.toThrow('bad url');

    expect(launchBrowser).not.toHaveBeenCalled();
    expect(createSafePage).not.toHaveBeenCalled();
  });
});
