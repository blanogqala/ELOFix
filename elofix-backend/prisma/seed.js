const bcrypt = require("bcryptjs");
require("dotenv").config();
const prisma = require("../src/config/prisma");

const categories = [
  {
    id: "plumbing",
    name: "Plumbing",
    icon: "🔧",
    description: "Pipe repairs, installations, and water systems",
    requiresMaterials: true,
    skills: ["plumbing", "pipe-repair", "installation", "drainage"],
    step3Type: "issue",
    issueTypes: ["Leak", "Blockage", "Installation", "Burst pipe", "Low pressure", "Other"],
    sortOrder: 1,
  },
  {
    id: "tiling",
    name: "Tiling",
    icon: "🏠",
    description: "Floor and wall tiling for all spaces",
    requiresMaterials: true,
    skills: ["tiling", "floor-tiling", "wall-tiling", "grouting"],
    step3Type: "measurements",
    sortOrder: 2,
  },
  {
    id: "electrical",
    name: "Electrical",
    icon: "⚡",
    description: "Wiring, installations, and electrical repairs",
    requiresMaterials: true,
    skills: ["electrical", "wiring", "installation", "repair"],
    step3Type: "issue",
    issueTypes: ["Faulty wiring", "Power outage", "Installation", "Circuit breaker", "Lighting", "Other"],
    sortOrder: 3,
  },
  {
    id: "moving",
    name: "Moving",
    icon: "📦",
    description: "Residential and commercial moving services",
    requiresMaterials: false,
    skills: ["moving", "residential", "commercial", "packing"],
    step3Type: "items",
    commonItems: [
      { id: "fridge", name: "Fridge", icon: "🧊", defaultWeight: 80 },
      { id: "sofa", name: "Sofa", icon: "🛋️", defaultWeight: 60 },
      { id: "bed", name: "Bed", icon: "🛏️", defaultWeight: 50 },
      { id: "tv", name: "TV", icon: "📺", defaultWeight: 15 },
    ],
    sortOrder: 4,
  },
];

function getAdminConfig() {
  return {
    email: (process.env.ADMIN_EMAIL || "admin@elofix.com").toLowerCase().trim(),
    password: process.env.ADMIN_PASSWORD || "Admin@123",
    name: (process.env.ADMIN_NAME || "ELOFix Admin").trim(),
  };
}

async function main() {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: category,
      create: category,
    });
  }

  const admin = getAdminConfig();
  const hashedPassword = await bcrypt.hash(admin.password, 12);

  await prisma.user.upsert({
    where: { email: admin.email },
    update: {
      name: admin.name,
      role: "ADMIN",
      password: hashedPassword,
    },
    create: {
      email: admin.email,
      name: admin.name,
      role: "ADMIN",
      password: hashedPassword,
    },
  });

  console.log(`Admin account ready: ${admin.email}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

