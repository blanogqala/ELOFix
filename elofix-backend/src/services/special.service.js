const prisma = require("../config/prisma");

async function listSpecials({ supplierId, category } = {}) {
  const rows = await prisma.promoSpecial.findMany();
  let specials = rows.map((r) => (r.data && typeof r.data === "object" ? r.data : {}));
  if (supplierId) {
    specials = specials.filter((s) => String(s.supplierId) === String(supplierId));
  }
  if (category) {
    specials = specials.filter((s) => String(s.category).toLowerCase() === String(category).toLowerCase());
  }
  return specials;
}

module.exports = {
  listSpecials,
};
