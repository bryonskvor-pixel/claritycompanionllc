// POST /api/discovery/brief — capture & delivery for both tracks.
// Track B (walkthrough): recomputes the recommendation server-side from raw
// answers and stores both; the server result is the one trusted.
// Track A (conversation): chat.js normally captures the brief server-side
// already, so this endpoint only fills in if that didn't happen, and handles
// "Email me my brief" visitor copies for both tracks.

const { sendEmail, OWNER_EMAIL } = require('../_lib/email');
const { allow, clientIp } = require('../_lib/ratelimit');
const { recommend } = require('../_lib/recommend');
const store = require('../_lib/store');

function briefText(brief) {
  const rows = [
    ['Name', brief.name], ['Business', brief.business], ['Email', brief.email],
    ['Trade', brief.trade], ['Territory', brief.area], ['Lead sources', brief.leadSources],
    ['Biggest leak', brief.painPoint], ['Current presence', brief.presence],
    ['Budget comfort', brief.budget], ['Timeline', brief.timeline],
  ].filter(r => r[1]).map(r => `${r[0]}: ${r[1]}`);
  rows.push('', `Recommendation: ${brief.recommendation || '—'}`, `Reasoning: ${brief.reasoning || '—'}`);
  return rows.join('\n');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { sessionId, via, website, sendCopy } = body;

  // Honeypot
  if (website) return res.status(200).json({ ok: true });

  if (!allow(`brief:${clientIp(req)}`, 10, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64 ||
      (via !== 'conversation' && via !== 'walkthrough')) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  let brief;
  if (via === 'walkthrough') {
    const answers = body.answers;
    if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Missing answers' });
    const clip = (v) => typeof v === 'string' ? v.slice(0, 500) : '';
    const clean = {};
    for (const k of ['name', 'business', 'email', 'trade', 'area', 'leadSources', 'painPoint', 'presence', 'budget', 'timeline']) {
      clean[k] = clip(answers[k]);
    }
    if (!clean.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean.email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    brief = recommend(clean); // server recompute — trusted over the client's
    brief.clientRecommendation = typeof body.clientRecommendation === 'string'
      ? body.clientRecommendation.slice(0, 100) : undefined;
    if (brief.clientRecommendation && brief.clientRecommendation !== brief.recommendation) {
      console.warn('[discovery/brief] client/server recommendation diverged', sessionId,
        brief.clientRecommendation, 'vs', brief.recommendation);
    }
  } else {
    brief = body.brief;
    if (!brief || typeof brief !== 'object') return res.status(400).json({ error: 'Missing brief' });
  }

  const alreadyCaptured = await store.briefExists(sessionId);
  if (!alreadyCaptured) {
    await store.saveBrief({
      id: sessionId,
      timestamp: new Date().toISOString(),
      via,
      json: brief,
      status: 'new',
    });
    const session = await store.getSession(sessionId);
    const transcript = via === 'conversation' && session && session.transcript
      ? `\n\n--- FULL TRANSCRIPT ---\n\n${session.transcript}` : '';
    const who = brief.business || brief.name || 'Unknown';
    await sendEmail({
      to: OWNER_EMAIL,
      subject: `[Discovery] ${who} — rec: ${brief.recommendation || 'n/a'}`,
      text: briefText(brief) + transcript,
      replyTo: brief.email || undefined,
    });
  }
  await store.saveSession(sessionId, { via, hasBrief: true });

  // "Email me my brief" — the visitor's own copy.
  if (sendCopy && brief.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(brief.email)) {
    await sendEmail({
      to: brief.email,
      subject: 'Your Discovery Brief — Clarity Companion',
      text: `Here's the brief from your discovery ${via === 'conversation' ? 'conversation' : 'walkthrough'}:\n\n${briefText(brief)}\n\nYou'll hear from a real person within one business day.\n\n— Clarity Companion LLC · claritycompanionllc.com/services`,
    });
  }

  return res.status(200).json({ ok: true, recommendation: brief.recommendation, reasoning: brief.reasoning });
};
