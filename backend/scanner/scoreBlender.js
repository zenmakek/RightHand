const clamp = (value) => Math.max(0, Math.min(100, value));

const getAxeWeight = () => {
  const parsed = Number(process.env.BLEND_AXE_WEIGHT);
  if (!Number.isFinite(parsed)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, parsed));
};

const blendScores = ({ axeScore, lighthouseScore }) => {
  const safeAxe = Number.isFinite(axeScore) ? clamp(axeScore) : null;
  const safeLighthouse = Number.isFinite(lighthouseScore) ? clamp(lighthouseScore) : null;

  if (safeAxe === null && safeLighthouse === null) {
    throw new Error('Cannot blend scores when both axeScore and lighthouseScore are null.');
  }

  if (safeAxe === null) {
    return Math.round(safeLighthouse);
  }

  if (safeLighthouse === null) {
    return Math.round(safeAxe);
  }

  const axeWeight = getAxeWeight();
  const lighthouseWeight = 1 - axeWeight;

  return Math.round(safeAxe * axeWeight + safeLighthouse * lighthouseWeight);
};

module.exports = {
  blendScores,
};
