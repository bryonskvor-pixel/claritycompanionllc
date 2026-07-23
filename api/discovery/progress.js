// POST /api/discovery/progress — lightweight Track B partial-lead capture.
// Fired after each completed wizard step so an abandoned session still shows
// up in the owner's daily summary.

const { allow, clientIp } = require('../_lib/ratelimit');
const store = require('../_lib/store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allow(`progress:${clientIp(req)}`, 60, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { sessionId, step, data } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64 ||
      typeof step !== 'number' || !data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const answers = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string' && k.length <= 40) answers[k] = v.slice(0, 500);
  }
  const session = (await store.getSession(sessionId)) || {};
  await store.saveSession(sessionId, {
    via: 'walkthrough',
    step,
    answers: { ...(session.answers || {}), ...answers },
  });
  return res.status(200).json({ ok: true });
};
