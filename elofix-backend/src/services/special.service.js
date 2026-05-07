const prisma = require("../config/prisma");

async function listSpecials({ supplierId, branchId, category } = {}) {
  const rows = await prisma.promoSpecial.findMany();
  let specials = rows.map((r) => (r.data && typeof r.data === "object" ? r.data : {}));
  if (supplierId) {
    specials = specials.filter((s) => String(s.supplierId) === String(supplierId));
  }
  if (branchId) {
    const bid = String(branchId);
    specials = specials.filter((s) => String(s.branchId || s.supplierId || "") === bid);
  }
  if (category) {
    specials = specials.filter((s) => String(s.category).toLowerCase() === String(category).toLowerCase());
  }
  return specials;
}

module.exports = {
  listSpecials,
};
