require("dotenv/config");
const { defineConfig } = require("prisma/config");
const { resolveDatabaseUrl } = require("./src/config/databaseUrl");

module.exports = defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
