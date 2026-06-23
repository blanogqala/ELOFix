const TRUST_LEVELS = [
  { min: 90, max: 100, id: "elite", label: "Elite Provider" },
  { min: 75, max: 89, id: "trusted", label: "Trusted Provider" },
  { min: 60, max: 74, id: "monitor", label: "Monitor" },
  { min: 40, max: 59, id: "restricted", label: "Restricted" },
  { min: 0, max: 39, id: "high_risk", label: "High Risk" },
];

function getTrustLevel(score) {
  const n = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const level = TRUST_LEVELS.find((l) => n >= l.min && n <= l.max) || TRUST_LEVELS[TRUST_LEVELS.length - 1];
  return { ...level, score: n };
}

function isHighRisk(score) {
  return getTrustLevel(score).id === "high_risk";
}

module.exports = { TRUST_LEVELS, getTrustLevel, isHighRisk };
