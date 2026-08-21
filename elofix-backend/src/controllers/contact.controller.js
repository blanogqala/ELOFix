const AppError = require("../utils/AppError");
const emailService = require("../services/email.service");

const DEFAULT_CONTACT_FORM_TO_EMAIL = "info@litiholdings.co.za";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CELLPHONE_RE = /^[0-9+\-\s()]{7,20}$/;

function getContactFormToEmail() {
  return String(process.env.CONTACT_FORM_TO_EMAIL || "").trim() || DEFAULT_CONTACT_FORM_TO_EMAIL;
}

function readTrimmed(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function submitContactForm(req, res) {
  const firstName = readTrimmed(req.body?.firstName);
  const lastName = readTrimmed(req.body?.lastName);
  const email = readTrimmed(req.body?.email).toLowerCase();
  const cellphone = readTrimmed(req.body?.cellphone);
  const message = readTrimmed(req.body?.message);

  if (!firstName || firstName.length > 100) {
    throw new AppError("A valid first name is required", 400);
  }
  if (!lastName || lastName.length > 100) {
    throw new AppError("A valid surname is required", 400);
  }
  if (!EMAIL_RE.test(email)) {
    throw new AppError("A valid email address is required", 400);
  }
  if (!CELLPHONE_RE.test(cellphone)) {
    throw new AppError("A valid cellphone number is required", 400);
  }
  if (message.length < 10 || message.length > 2000) {
    throw new AppError("How can we help you? must be between 10 and 2000 characters", 400);
  }

  const fullName = `${firstName} ${lastName}`;
  const subject = `EloFix contact form - ${fullName}`;
  const body = [
    "A new contact form enquiry was submitted.",
    "",
    `Name: ${fullName}`,
    `Email: ${email}`,
    `Cellphone: ${cellphone}`,
    "",
    "How can we help you?",
    message,
  ].join("\n");
  const html = `
<!DOCTYPE html>
<html>
  <body style="font-family:Arial,Helvetica,sans-serif;padding:24px;color:#1f2937;">
    <h2 style="margin:0 0 16px;">New EloFix contact enquiry</h2>
    <p style="margin:0 0 8px;"><strong>Name:</strong> ${escapeHtml(fullName)}</p>
    <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p style="margin:0 0 16px;"><strong>Cellphone:</strong> ${escapeHtml(cellphone)}</p>
    <p style="margin:0 0 8px;"><strong>How can we help you?</strong></p>
    <p style="margin:0;white-space:pre-wrap;">${escapeHtml(message)}</p>
  </body>
</html>`.trim();

  const to = getContactFormToEmail();
  const result = await emailService.sendTransactionalEmail({
    to,
    replyTo: email,
    subject,
    body,
    html,
  });

  if (result?.error) {
    throw new AppError("We could not send your message right now. Please try again later.", 503);
  }

  if (result?.skipped && process.env.NODE_ENV !== "production") {
    console.warn("[contact] RESEND_API_KEY not set; contact email skipped");
    console.warn("[contact] Destination:", to);
    console.warn("[contact] Payload:", { firstName, lastName, email, cellphone, message });
  }

  res.json({
    success: true,
    message: "Your message has been sent. We will get back to you soon.",
  });
}

module.exports = {
  submitContactForm,
  getContactFormToEmail,
  DEFAULT_CONTACT_FORM_TO_EMAIL,
};
