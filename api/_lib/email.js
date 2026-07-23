// Shared email plumbing (Resend). Used by the services contact form and the
// discovery intake system. If RESEND_API_KEY is missing, sends become no-ops
// that log a warning, so the site never hard-fails on a config gap.

const OWNER_EMAIL = process.env.CONTACT_TO_EMAIL || 'bryon@claritycompanionllc.com';
// Resend requires a verified sending domain for arbitrary recipients.
// Until claritycompanionllc.com is verified in Resend, onboarding@resend.dev
// works for delivery to the Resend account owner's address only.
const FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || 'Clarity Companion <onboarding@resend.dev>';

async function sendEmail({ to, subject, text, replyTo }) {
  // Accept the dashboard's variable name as typed, too.
  const key = process.env.RESEND_API_KEY || process.env.Resend_Api_Key;
  if (!key) {
    console.warn('[email] RESEND_API_KEY not set — email NOT sent. Subject:', subject);
    return { sent: false, reason: 'missing-key' };
  }
  const payload = {
    from: FROM_EMAIL,
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
  };
  if (replyTo) payload.reply_to = replyTo;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[email] Resend error', res.status, detail);
    return { sent: false, reason: `resend-${res.status}` };
  }
  return { sent: true };
}

module.exports = { sendEmail, OWNER_EMAIL };
