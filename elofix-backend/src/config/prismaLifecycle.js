/**
 * Test/process shutdown: Prisma $disconnect does not close the pg Pool used by the adapter.
 * Ending the pool lets Node exit without a libuv UV_HANDLE_CLOSING assertion.
 */
async function disconnectPrismaAndPool() {
  const g = globalThis;
  if (g.prisma && typeof g.prisma.$disconnect === "function") {
    await g.prisma.$disconnect().catch(() => {});
  }
  if (g.__elofixPgPool && typeof g.__elofixPgPool.end === "function") {
    await g.__elofixPgPool.end().catch(() => {});
  }
  g.prisma = undefined;
  g.__elofixPgPool = undefined;
  g.prismaClientGeneration = undefined;
}

module.exports = { disconnectPrismaAndPool };
