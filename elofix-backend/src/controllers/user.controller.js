const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");

async function getUserById(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });
  if (!user) throw new AppError("User not found", 404);
  res.json({
    success: true,
    user: {
      ...user,
      role: user.role === "CUSTOMER" ? "user" : user.role.toLowerCase(),
    },
  });
}

module.exports = {
  getUserById,
};
