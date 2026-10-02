/**
 * Development wrapper for the same idempotent marketplace fixture Playwright uses.
 * Does not run on server startup. Refuses production and non-local databases.
 *
 * Usage (from elofix-backend): node scripts/seed-marketplace-demo.js
 */
require("./seed-e2e-marketplace");
