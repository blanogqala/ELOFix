require("dotenv").config();
const prisma = require("../src/config/prisma");

const BASE = "http://localhost:5000/api";

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${data.message || res.status}`);
  return data.token;
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const adminCfg = {
    email: (process.env.ADMIN_EMAIL || "admin@elofix.com").toLowerCase().trim(),
    password: process.env.ADMIN_PASSWORD || "Admin@123",
  };

  const customer = await prisma.user.findFirst({
    where: { role: "CUSTOMER" },
    select: { id: true, email: true, name: true },
  });
  if (!customer?.email) {
    throw new Error("No customer user found in database");
  }

  const branchUser = await prisma.branchUser.findFirst({
    select: { id: true, email: true },
  });

  console.log("Customer:", customer.name, customer.id);

  const adminToken = await login(adminCfg.email, adminCfg.password);

  const invalidReply = await api(adminToken, "POST", "/notifications/support/reply", {
    userId: customer.name,
    message: "test invalid name",
  });
  console.log("Invalid name reply:", invalidReply.status, invalidReply.data.message);

  const adminBefore = await api(adminToken, "GET", "/notifications");
  const adminSupportBefore = (adminBefore.data.notifications || []).filter((n) =>
    ["support_contact", "support_reply"].includes(n.type)
  ).length;

  const customerToken = await (async () => {
    for (const password of ["Password@123", "password", "Password123!", "Customer@123"]) {
      try {
        return await login(customer.email, password);
      } catch {
        /* try next */
      }
    }
    return null;
  })();

  if (customerToken) {
    const send = await api(customerToken, "POST", "/notifications/support", {
      message: "Automated support test message",
    });
    console.log("Customer send support:", send.status, send.data.message || "ok");

    const customerList = await api(customerToken, "GET", "/notifications");
    const customerSupport = (customerList.data.notifications || []).filter((n) =>
      ["support_contact", "support_reply"].includes(n.type)
    );
    console.log("Customer support notifications:", customerSupport.length);
    const hasEcho = customerSupport.some((n) => n.message.includes("Automated support test"));
    console.log("Customer echo present:", hasEcho);
  } else {
    console.log("Could not login as customer; testing admin reply directly");
  }

  const validReply = await api(adminToken, "POST", "/notifications/support/reply", {
    userId: customer.id,
    message: "Automated admin reply test",
  });
  console.log("Valid reply:", validReply.status, validReply.data.message || "ok");

  const customerListAfter = customerToken
    ? await api(customerToken, "GET", "/notifications")
    : null;
  if (customerListAfter) {
    const replies = (customerListAfter.data.notifications || []).filter((n) => n.type === "support_reply");
    console.log("Customer support_reply count:", replies.length);
  }

  const adminAfter = await api(adminToken, "GET", "/notifications");
  const adminSupport = (adminAfter.data.notifications || []).filter((n) =>
    ["support_contact", "support_reply"].includes(n.type)
  );
  console.log("Admin support notifications:", adminSupport.length, "(before thread msgs:", adminSupportBefore, ")");

  if (branchUser?.id) {
    console.log("Branch user id available for manual UI test:", branchUser.id);
  }

  const dedupeKey = `support-smoke:${Date.now()}`;
  const dedupe1 = await api(adminToken, "POST", "/notifications", {
    userId: customer.id,
    type: "job_completed",
    title: "Dedupe smoke 1",
    message: "First",
    dedupeKey,
  });
  const dedupe2 = await api(adminToken, "POST", "/notifications", {
    userId: customer.id,
    type: "job_completed",
    title: "Dedupe smoke 2",
    message: "Second",
    dedupeKey,
  });
  if (dedupe1.status === 201 && dedupe2.status === 201) {
    const sameId = dedupe1.data.notification?.id === dedupe2.data.notification?.id;
    console.log("Dedupe smoke (admin POST): same notification id on replay:", sameId);
  } else {
    console.log("Dedupe smoke skipped:", dedupe1.status, dedupe2.status);
  }

  await prisma.$disconnect();
  console.log("Notification support tests completed.");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
