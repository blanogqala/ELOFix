const { Resend } = require("resend");

const GENERIC_FROM = "EloFix <noreply@elofix.com>";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return null;
  }
  return new Resend(String(apiKey).trim());
}

function getFromAddress() {
  return process.env.EMAIL_FROM || process.env.RESEND_FROM || GENERIC_FROM;
}

/**
 * @param {{ to: string, resetUrl: string }} params
 */
async function sendPasswordResetEmail({ to, resetUrl }) {
  const resend = getResendClient();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[email] RESEND_API_KEY not set; skipping password reset email to", to);
      console.warn("[email] Reset URL (dev only):", resetUrl);
    }
    return { skipped: true };
  }

  const subject = "Reset your EloFix password";
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:8px;padding:32px 24px;">
          <tr>
            <td style="color:#0a2540;font-size:22px;font-weight:bold;padding-bottom:12px;">Reset your password</td>
          </tr>
          <tr>
            <td style="color:#4a5568;font-size:15px;line-height:1.6;padding-bottom:24px;">
              We received a request to reset your EloFix password. This link expires in 15 minutes and can only be used once.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${resetUrl}" style="display:inline-block;background:#ff8c1a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:6px;">Reset password</a>
            </td>
          </tr>
          <tr>
            <td style="color:#718096;font-size:13px;line-height:1.5;">
              If you did not request this, you can safely ignore this email. Your password will not change.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const text = [
    "Reset your EloFix password",
    "",
    "We received a request to reset your password. This link expires in 15 minutes and can only be used once.",
    "",
    resetUrl,
    "",
    "If you did not request this, you can safely ignore this email.",
  ].join("\n");

  try {
    const result = await resend.emails.send({
      from: getFromAddress(),
      to: [to],
      subject,
      html,
      text,
    });
    if (result?.error) {
      console.error("[email] password reset send failed", result.error);
      return { error: true };
    }
    return { sent: true, id: result?.data?.id };
  } catch (err) {
    console.error("[email] password reset send failed", err?.message || err);
    return { error: true };
  }
}

/**
 * Generic transactional email (dispute alerts, support notifications).
 * @param {{ to: string, subject: string, body: string, html?: string, replyTo?: string }} params
 */
async function sendTransactionalEmail({ to, subject, body, html, replyTo }) {
  const recipient = String(to || "").trim();
  if (!recipient) {
    return { error: true, errorMessage: "Missing recipient" };
  }

  const resend = getResendClient();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[email] RESEND_API_KEY not set; skipping email to", recipient);
      console.warn("[email] Subject:", subject);
      console.warn("[email] Body preview:", String(body || "").slice(0, 200));
    }
    return { skipped: true };
  }

  const safeSubject = String(subject || "EloFix notification");
  const text = String(body || "");
  const htmlBody =
    html ||
    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:24px;"><p>${text.replace(/\n/g, "<br/>")}</p></body></html>`;

  try {
    const result = await resend.emails.send({
      from: getFromAddress(),
      to: [recipient],
      ...(replyTo ? { replyTo } : {}),
      subject: safeSubject,
      html: htmlBody,
      text,
    });
    if (result?.error) {
      console.error("[email] transactional send failed", result.error);
      return { error: true, errorMessage: String(result.error?.message || result.error) };
    }
    return { sent: true, id: result?.data?.id };
  } catch (err) {
    console.error("[email] transactional send failed", err?.message || err);
    return { error: true, errorMessage: String(err?.message || err) };
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendTransactionalEmail,
  getFromAddress,
};
