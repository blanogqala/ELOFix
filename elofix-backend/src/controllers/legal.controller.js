const { getLegalVersions } = require("../services/legalAcceptance.service");

async function getVersions(_req, res) {
  res.json({ success: true, versions: getLegalVersions() });
}

module.exports = { getVersions };
