/**
 * Run every tests/*.test.js in a child process.
 * This file is the CI backend suite — do not skip ACTIVE tests here.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith(".test.js"))
  .sort();

if (files.length === 0) {
  console.error("tests/run-all.js: no test files found");
  process.exitCode = 1;
} else {
  let failed = 0;
  for (const file of files) {
    const abs = path.join(dir, file);
    const result = spawnSync(process.execPath, [abs], {
      stdio: "inherit",
      env: process.env,
      cwd: path.join(dir, ".."),
    });
    const code = result.status == null ? 1 : result.status;
    if (code !== 0) {
      failed += 1;
      console.error(`\n[run-all] FAIL ${file} (exit ${code})\n`);
      process.exitCode = 1;
      break;
    }
  }
  if (!failed) {
    console.log(`\n[run-all] ${files.length} files passed\n`);
  }
}
