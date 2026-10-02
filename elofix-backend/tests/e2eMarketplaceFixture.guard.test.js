/**
 * The marketplace Playwright fixture must refuse production and remote databases.
 */
const assert = require("assert");
const { assertSafeE2eDatabase } = require("../scripts/e2eMarketplaceFixtureGuard");

function throws(env, pattern) {
  assert.throws(() => assertSafeE2eDatabase(env), pattern);
}

function main() {
  assertSafeE2eDatabase({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://elofix:elofix@localhost:5432/elofix_ci?schema=public",
  });
  assertSafeE2eDatabase({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://elofix:elofix@127.0.0.1:5432/elofix",
  });
  throws(
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://elofix:elofix@localhost:5432/elofix",
    },
    /NODE_ENV=production/
  );
  throws(
    {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://elofix:elofix@dpg-production.render.com:5432/elofix",
    },
    /non-local database host/
  );
  throws(
    {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://elofix:elofix@localhost:5432/elofix_production",
    },
    /database "elofix_production"/
  );
  throws({ NODE_ENV: "test", DATABASE_URL: "" }, /without DATABASE_URL/);
  console.log("e2eMarketplaceFixture.guard.test.js: all passed");
}

main();
