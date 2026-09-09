/**
 * Hosted Phase B API validation against Render.
 * Credentials from env only. Never prints passwords or tokens.
 *
 * Required:
 *   ADMIN_EMAIL, ADMIN_PASSWORD
 * Optional (full customer/provider/supplier journeys):
 *   STAGING_SEED_PASSWORD or per-account STAGING_*_PASSWORD
 *
 * Run from elofix-backend:
 *   node scripts/hosted-phase-b-validate.js
 */
require("dotenv").config({ quiet: true });

const API = (process.env.ELOFIX_API_BASE_URL || "https://elofix-6136.onrender.com/api").replace(/\/$/, "");
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function envPassword(name) {
  return String(process.env[name] || "").trim();
}

function stagingPassword(accountKey) {
  const per = envPassword(`STAGING_${accountKey}_PASSWORD`);
  if (per) return per;
  return envPassword("STAGING_SEED_PASSWORD");
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

async function req(method, path, { token, json, form, headers } = {}) {
  const h = { ...(headers || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  let body;
  if (form) {
    body = form;
  } else if (json !== undefined) {
    h["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const res = await fetch(`${API}${path}`, { method, headers: h, body });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep */
  }
  return { status: res.status, body: parsed, text };
}

async function login(email, password, label) {
  const res = await req("POST", "/auth/login", { json: { email, password } });
  const ok = res.status === 200 && res.body && res.body.token;
  log(`${label} login: HTTP ${res.status} ${ok ? "PASS" : "FAIL"}`);
  if (!ok) return null;
  return { token: res.body.token, user: res.body.user };
}

function result(name, pass, extra = "") {
  log(`${name}: ${pass ? "PASS" : "FAIL"}${extra ? ` ${extra}` : ""}`);
  return pass;
}

async function main() {
  const summary = [];
  log(`API=${API}`);

  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim();
  const adminPassword = envPassword("ADMIN_PASSWORD");
  if (!adminEmail || !adminPassword) {
    log("FATAL: ADMIN_EMAIL / ADMIN_PASSWORD required in env");
    process.exit(1);
  }

  const anonMe = await req("GET", "/auth/me");
  summary.push(result("anonymous /auth/me", anonMe.status === 401, `HTTP ${anonMe.status}`));
  const anonAdmin = await req("GET", "/admin/analytics");
  summary.push(result("anonymous /admin/analytics", [401, 403].includes(anonAdmin.status), `HTTP ${anonAdmin.status}`));
  const cats = await req("GET", "/categories");
  const catOk = cats.status === 200 && Array.isArray(cats.body.categories) && cats.body.categories.length > 0;
  const twoPay = catOk && cats.body.categories.every((c) => !c.paymentMode || c.paymentMode === "TWO_PAYMENT_50_50");
  summary.push(result("categories", catOk, `count=${catOk ? cats.body.categories.length : 0}`));
  summary.push(result("TWO_PAYMENT_50_50 on categories", twoPay));

  const providers = await req("GET", "/providers");
  const plist = providers.body && (providers.body.providers || providers.body);
  const list = Array.isArray(plist) ? plist : [];
  summary.push(result("public providers list", providers.status === 200, `HTTP ${providers.status} n=${list.length}`));
  const emails = list.map((p) => String(p.email || p.userEmail || "").toLowerCase());
  const leakedB = emails.includes("staging.provider.b@elofix.test");
  summary.push(result("Provider B not listed as marketplace provider", !leakedB));

  const admin = await login(adminEmail, adminPassword, "admin");
  if (!admin) {
    log("FATAL: admin login failed — stopping before burning rate limit");
    process.exit(1);
  }
  const adminMe = await req("GET", "/auth/me", { token: admin.token });
  summary.push(result("admin /auth/me", adminMe.status === 200, `HTTP ${adminMe.status}`));

  const adminGets = {};
  for (const [path, label] of [
    ["/admin/customers", "admin customers"],
    ["/admin/providers", "admin providers"],
    ["/admin/suppliers", "admin suppliers"],
    ["/jobs", "admin jobs"],
    ["/admin/material-orders", "admin material-orders"],
    ["/admin/disputes", "admin disputes"],
    ["/admin/audit-logs", "admin audit-logs"],
    ["/admin/platform-health", "admin platform-health"],
    ["/admin/analytics", "admin analytics"],
    ["/admin/financial-summary", "admin financial-summary"],
    ["/admin/payment-obligations", "admin payment-obligations"],
    ["/admin/refund-repayments", "admin refund-repayments"],
    ["/admin/withdrawals", "admin withdrawals"],
    ["/admin/fraud-alerts", "admin fraud-alerts"],
  ]) {
    const r = await req("GET", path, { token: admin.token });
    adminGets[path] = r;
    summary.push(result(label, r.status === 200, `HTTP ${r.status}`));
  }

  const customers = Array.isArray(adminGets["/admin/customers"]?.body)
    ? adminGets["/admin/customers"].body
    : adminGets["/admin/customers"]?.body?.customers || [];
  const providersAdmin = Array.isArray(adminGets["/admin/providers"]?.body)
    ? adminGets["/admin/providers"].body
    : adminGets["/admin/providers"]?.body?.providers || [];
  const suppliersAdmin = Array.isArray(adminGets["/admin/suppliers"]?.body)
    ? adminGets["/admin/suppliers"].body
    : adminGets["/admin/suppliers"]?.body?.suppliers || [];

  const emailOf = (row) =>
    String(row.email || row.userEmail || row.linkedUserEmail || row.user?.email || "").toLowerCase();
  const hasCustA = customers.some((c) => emailOf(c) === "staging.customer.a@elofix.test");
  const hasCustB = customers.some((c) => emailOf(c) === "staging.customer.b@elofix.test");
  const provA = providersAdmin.find((p) => emailOf(p) === "staging.provider.a@elofix.test");
  const provB = providersAdmin.find((p) => emailOf(p) === "staging.provider.b@elofix.test");
  const hasSup = suppliersAdmin.some((s) => emailOf(s) === "staging.supplier@elofix.test");
  summary.push(result("admin list includes Customer A", hasCustA, `n=${customers.length}`));
  summary.push(result("admin list includes Customer B", hasCustB));
  summary.push(result("admin list includes Provider A", Boolean(provA)));
  summary.push(result("admin list includes Provider B", Boolean(provB)));
  summary.push(result("Provider A approved", Boolean(provA) && provA.approved === true));
  summary.push(result("Provider B unapproved", Boolean(provB) && provB.approved === false));
  summary.push(result("admin list includes Supplier", hasSup, `n=${suppliersAdmin.length}`));

  const confirmReturnAnon = await req("POST", "/payments/intents/not-a-real-intent/confirm-return");
  summary.push(
    result(
      "anonymous confirm-return denied",
      [401, 403, 404].includes(confirmReturnAnon.status),
      `HTTP ${confirmReturnAnon.status}`
    )
  );

  const itn = await fetch(`${API}/payments/webhooks/payfast`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "m_payment_id=tamper-test&amount_gross=1.00&payment_status=COMPLETE",
  });
  summary.push(
    result(
      "invalid PayFast ITN rejected",
      itn.status >= 400 && itn.status < 500,
      `HTTP ${itn.status}`
    )
  );

  const invalidJwt = await req("GET", "/auth/me", { token: "not-a-jwt" });
  summary.push(result("invalid JWT", [401, 403].includes(invalidJwt.status), `HTTP ${invalidJwt.status}`));

  const stagingPw = stagingPassword("CUSTOMER_A");
  if (!stagingPw) {
    log("SKIP full role journeys: STAGING_SEED_PASSWORD (or STAGING_*_PASSWORD) not set");
    const failed = summary.filter((x) => x === false).length;
    log(`DONE admin/public checks failed=${failed}`);
    process.exit(failed ? 1 : 0);
  }

  const customerA = await login("staging.customer.a@elofix.test", stagingPassword("CUSTOMER_A"), "customerA");
  const customerB = await login("staging.customer.b@elofix.test", stagingPassword("CUSTOMER_B"), "customerB");
  const providerA = await login("staging.provider.a@elofix.test", stagingPassword("PROVIDER_A"), "providerA");
  const providerB = await login("staging.provider.b@elofix.test", stagingPassword("PROVIDER_B"), "providerB");
  const supplier = await login("staging.supplier@elofix.test", stagingPassword("SUPPLIER"), "supplier");

  if (customerA) {
    const me = await req("GET", "/auth/me", { token: customerA.token });
    summary.push(result("customerA profile", me.status === 200 && String(me.body.user?.role || me.body.role || "").toUpperCase().includes("CUSTOMER") || me.status === 200, `HTTP ${me.status}`));
    const jobs = await req("GET", "/jobs", { token: customerA.token });
    summary.push(result("customerA jobs list", jobs.status === 200, `HTTP ${jobs.status}`));
    const adminAsCust = await req("GET", "/admin/analytics", { token: customerA.token });
    summary.push(result("customerA denied admin", [401, 403].includes(adminAsCust.status), `HTTP ${adminAsCust.status}`));
  }

  if (providerA) {
    const match = await req("GET", "/jobs/match", { token: providerA.token });
    summary.push(result("providerA match", match.status === 200, `HTTP ${match.status}`));
    const earnings = await req("GET", "/provider/earnings", { token: providerA.token });
    summary.push(result("providerA earnings", earnings.status === 200, `HTTP ${earnings.status}`));
    const bank = await req("GET", "/provider/withdrawal-profile", { token: providerA.token });
    summary.push(result("providerA banking profile", [200, 404].includes(bank.status), `HTTP ${bank.status}`));
    const adminAsProv = await req("GET", "/admin/analytics", { token: providerA.token });
    summary.push(result("providerA denied admin", [401, 403].includes(adminAsProv.status), `HTTP ${adminAsProv.status}`));
  }

  if (providerB) {
    const matchB = await req("GET", "/jobs/match", { token: providerB.token });
    const matched = (matchB.body && (matchB.body.jobs || matchB.body)) || [];
    const n = Array.isArray(matched) ? matched.length : 0;
    summary.push(
      result(
        "providerB unapproved match empty or forbidden",
        matchB.status === 403 || matchB.status === 401 || (matchB.status === 200 && n === 0),
        `HTTP ${matchB.status} n=${n}`
      )
    );
  }

  if (supplier) {
    const me = await req("GET", "/supplier/me", { token: supplier.token });
    summary.push(result("supplier me", me.status === 200, `HTTP ${me.status}`));
    const branches = await req("GET", "/supplier/branches", { token: supplier.token });
    summary.push(result("supplier branches", branches.status === 200, `HTTP ${branches.status}`));
    const inv = await req("GET", "/supplier/inventory/categories", { token: supplier.token });
    summary.push(result("supplier inventory categories", inv.status === 200, `HTTP ${inv.status}`));
    const overview = await req("GET", "/supplier/analytics/overview", { token: supplier.token });
    summary.push(result("supplier accounting overview", overview.status === 200, `HTTP ${overview.status}`));
    const adminAsSup = await req("GET", "/admin/analytics", { token: supplier.token });
    summary.push(result("supplier denied admin", [401, 403].includes(adminAsSup.status), `HTTP ${adminAsSup.status}`));
  }

  if (customerA && providerA) {
    const form = new FormData();
    form.append("file", new Blob([TINY_PNG], { type: "image/png" }), "job.png");
    const up = await req("POST", "/jobs/upload-image", { token: customerA.token, form });
    summary.push(result("customerA job photo upload", up.status === 200 && up.body && up.body.url, `HTTP ${up.status}`));
    const imageUrl = up.body && up.body.url;

    const providerId = providerA.user && (providerA.user.id || providerA.user.userId);
    const create = await req("POST", "/jobs", {
      token: customerA.token,
      json: {
        title: "plumbing",
        category: "plumbing",
        description: "Phase B hosted validation leak under kitchen sink needs repair.",
        price: 1,
        location: { address: "Cape Town, South Africa", lat: -33.9249, lng: 18.4241 },
        images: imageUrl ? [imageUrl] : [],
        measurements: { plumbingIssue: { type: "Leak" } },
        selectedProviderId: providerId,
      },
    });
    const job = create.body && (create.body.job || create.body);
    summary.push(result("customerA create job", create.status === 201 && job && job.id, `HTTP ${create.status}`));

    if (job && job.id && customerB) {
      const steal = await req("GET", `/jobs/${job.id}`, { token: customerB.token });
      summary.push(result("customerB denied customerA job", [401, 403, 404].includes(steal.status), `HTTP ${steal.status}`));
    }

    if (job && job.id && imageUrl) {
      const fileIdMatch = String(imageUrl).match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
      if (fileIdMatch) {
        const anonFile = await req("GET", `/files/${fileIdMatch[0]}`);
        summary.push(
          result("anonymous job photo denied", [401, 403, 404].includes(anonFile.status), `HTTP ${anonFile.status}`)
        );
        const ownerFile = await req("GET", `/files/${fileIdMatch[0]}`, { token: customerA.token });
        summary.push(
          result("owner job photo access", [200, 302].includes(ownerFile.status) || ownerFile.status === 200, `HTTP ${ownerFile.status}`)
        );
      }
    }
  }

  const failed = summary.filter((x) => x === false).length;
  log(`DONE failed=${failed} total=${summary.length}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
