const path = require("path");
const assert = require("assert");
const { UPLOAD_ROOT, filePathToPublicUrl } = require("../src/middleware/upload.middleware");

const inside = path.join(UPLOAD_ROOT, "suppliers", "abc", "category-images", "x.jpg");
assert.strictEqual(filePathToPublicUrl(inside), "/uploads/suppliers/abc/category-images/x.jpg");
assert.strictEqual(filePathToPublicUrl(path.join(UPLOAD_ROOT, "..", "secret.jpg")), null);
assert.strictEqual(filePathToPublicUrl(""), null);
console.log("filePathToPublicUrl.test.js: ok");
