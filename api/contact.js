// POST /api/contact — services page contact form.
// Validates, honeypots, rate limits, and emails the owner via Resend.

const { sendEmail, OWNER_EMAIL } = require('./_lib/email');
const { allow, clientIp } = require('./_lib/ratelimit');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { name, business, email, interest, message, website } = body;

  // Honeypot: bots fill the hidden "website" field. Pretend success.
  if (website) return res.status(200).json({ ok: true });

  if (!allow(`contact:${clientIp(req)}`, 5, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (!name || typeof name !== 'string' || !email || typeof email !== 'string' ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Name and a valid email are required' });
  }

  const clip = (s, n) => String(s || '').slice(0, n);
  const subject = `[Services inquiry] ${clip(interest, 60) || 'Not sure yet'} — ${clip(name, 80)}`;
  const text = [
    `Name: ${clip(name, 200)}`,
    `Business: ${clip(business, 200) || '—'}`,
    `Email: ${clip(email, 200)}`,
    `Interested in: ${clip(interest, 100) || '—'}`,
    '',
    'Message:',
    clip(message, 5000) || '—',
  ].join('\n');

  const result = await sendEmail({ to: OWNER_EMAIL, subject, text, replyTo: email });
  if (!result.sent && result.reason !== 'missing-key') {
    return res.status(502).json({ error: 'Email delivery failed' });
  }
  // missing-key still returns ok so the visitor isn't punished for a config
  // gap; the warning is in the function logs.
  return res.status(200).json({ ok: true });
};
