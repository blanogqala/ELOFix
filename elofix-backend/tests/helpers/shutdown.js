const { disconnectPrismaAndPool } = require("../../src/config/prismaLifecycle");

/**
 * Close HTTP servers, Prisma, and the pg Pool so the Node process can exit cleanly.
 * Do not call process.exit(0) after this — let the event loop drain.
 */
async function shutdownTestResources(httpHandle) {
  if (httpHandle && typeof httpHandle.close === "function") {
    await httpHandle.close().catch(() => {});
  }
  await disconnectPrismaAndPool();
}

function runTestMain(fn) {
  Promise.resolve()
    .then(() => fn())
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await shutdownTestResources();
    });
}

module.exports = { shutdownTestResources, runTestMain };
