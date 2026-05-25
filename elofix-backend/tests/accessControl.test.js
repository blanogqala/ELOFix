const assert = require("assert");
const {
  assertJobCustomer,
  assertJobProvider,
  assertJobCustomerOrProvider,
  assertMaterialOrderCustomer,
  resolveScopedUserId,
} = require("../src/utils/accessControl.util");

function assertForbidden(fn) {
  assert.throws(fn, (error) => error && error.statusCode === 403);
}

const job = { customerId: "customer-1", providerId: "provider-1" };
const order = { userId: "customer-1" };

assert.strictEqual(resolveScopedUserId({ role: "CUSTOMER", userId: "customer-1" }, "customer-1"), "customer-1");
assertForbidden(() => resolveScopedUserId({ role: "CUSTOMER", userId: "customer-1" }, "customer-2"));
assert.strictEqual(resolveScopedUserId({ role: "ADMIN", userId: "admin-1" }, "customer-2"), "customer-2");

assert.doesNotThrow(() => assertJobCustomer(job, { role: "CUSTOMER", userId: "customer-1" }));
assertForbidden(() => assertJobCustomer(job, { role: "CUSTOMER", userId: "customer-2" }));
assertForbidden(() => assertJobCustomer(job, { role: "PROVIDER", userId: "provider-1" }));

assert.doesNotThrow(() => assertJobProvider(job, { role: "PROVIDER", userId: "provider-1" }));
assertForbidden(() => assertJobProvider(job, { role: "PROVIDER", userId: "provider-2" }));

assert.doesNotThrow(() => assertJobCustomerOrProvider(job, { role: "CUSTOMER", userId: "customer-1" }));
assert.doesNotThrow(() => assertJobCustomerOrProvider(job, { role: "PROVIDER", userId: "provider-1" }));
assertForbidden(() => assertJobCustomerOrProvider(job, { role: "PROVIDER", userId: "provider-2" }));

assert.doesNotThrow(() => assertMaterialOrderCustomer(order, { role: "CUSTOMER", userId: "customer-1" }));
assertForbidden(() => assertMaterialOrderCustomer(order, { role: "CUSTOMER", userId: "customer-2" }));
assertForbidden(() => assertMaterialOrderCustomer(order, { role: "PROVIDER", userId: "provider-1" }));

console.log("access-control tests passed");
