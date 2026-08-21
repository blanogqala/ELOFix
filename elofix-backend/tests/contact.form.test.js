/**
 * Public Contact form routing tests.
 * Run: node tests/contact.form.test.js
 */
require("dotenv").config();
const assert = require("assert");
const {
  getContactFormToEmail,
  DEFAULT_CONTACT_FORM_TO_EMAIL,
  submitContactForm,
} = require("../src/controllers/contact.controller");

function testDefaultDestination() {
  const previous = process.env.CONTACT_FORM_TO_EMAIL;
  delete process.env.CONTACT_FORM_TO_EMAIL;
  try {
    assert.strictEqual(getContactFormToEmail(), "info@litiholdings.co.za");
    assert.strictEqual(DEFAULT_CONTACT_FORM_TO_EMAIL, "info@litiholdings.co.za");
  } finally {
    if (previous === undefined) delete process.env.CONTACT_FORM_TO_EMAIL;
    else process.env.CONTACT_FORM_TO_EMAIL = previous;
  }
}

function testEnvOverride() {
  const previous = process.env.CONTACT_FORM_TO_EMAIL;
  process.env.CONTACT_FORM_TO_EMAIL = "  partnerships@elofix.co.za  ";
  try {
    assert.strictEqual(getContactFormToEmail(), "partnerships@elofix.co.za");
  } finally {
    if (previous === undefined) delete process.env.CONTACT_FORM_TO_EMAIL;
    else process.env.CONTACT_FORM_TO_EMAIL = previous;
  }
}

async function testSubmitUsesConfiguredDestination() {
  const emailService = require("../src/services/email.service");
  const previous = process.env.CONTACT_FORM_TO_EMAIL;
  delete process.env.CONTACT_FORM_TO_EMAIL;

  const originalSend = emailService.sendTransactionalEmail;
  let captured = null;
  emailService.sendTransactionalEmail = async (params) => {
    captured = params;
    return { skipped: true };
  };

  const req = {
    body: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      cellphone: "+27 82 123 4567",
      message: "Please help with my enquiry.",
    },
  };
  let statusCode = 200;
  let jsonBody = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return body;
    },
  };

  try {
    await submitContactForm(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(jsonBody?.success, true);
    assert.strictEqual(captured?.to, "info@litiholdings.co.za");
    assert.strictEqual(captured?.replyTo, "jane@example.com");
    assert.ok(!String(captured?.to || "").includes("support@elofix.co.za"));
    assert.ok(!String(captured?.to || "").includes("finance@litiholdings.co.za"));
  } finally {
    emailService.sendTransactionalEmail = originalSend;
    if (previous === undefined) delete process.env.CONTACT_FORM_TO_EMAIL;
    else process.env.CONTACT_FORM_TO_EMAIL = previous;
  }
}

async function main() {
  testDefaultDestination();
  testEnvOverride();
  await testSubmitUsesConfiguredDestination();
  console.log("contact.form.test.js: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
