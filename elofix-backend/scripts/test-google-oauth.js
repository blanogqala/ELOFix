require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { OAuth2Client } = require("google-auth-library");
const prisma = require("../src/config/prisma");

async function main() {
  console.log("GOOGLE_CLIENT_ID set:", Boolean(process.env.GOOGLE_CLIENT_ID));
  console.log("GOOGLE_CLIENT_SECRET set:", Boolean(process.env.GOOGLE_CLIENT_SECRET));
  console.log("GOOGLE_CALLBACK_URL:", process.env.GOOGLE_CALLBACK_URL);

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );

  try {
    await client.getToken("invalid-test-code");
  } catch (err) {
    console.log("\nGoogle token exchange probe (expected failure):");
    console.log("message:", err.message);
    if (err.response?.data) {
      console.log("data:", JSON.stringify(err.response.data, null, 2));
    }
  }

  try {
    const email = `google-test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Google Test",
        authProvider: "GOOGLE",
        googleId: `gid-${Date.now()}`,
        role: "CUSTOMER",
      },
      select: { id: true, email: true, authProvider: true },
    });
    console.log("\nPrisma Google user create: OK", user);
    await prisma.user.delete({ where: { id: user.id } });
  } catch (err) {
    console.log("\nPrisma Google user create: FAIL", err.message);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
