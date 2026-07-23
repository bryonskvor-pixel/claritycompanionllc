// GET /api/discovery/daily-summary — Vercel Cron (see vercel.json).
// Emails the owner one digest of abandoned discovery sessions: no brief,
// idle 30+ minutes, with at least a pain point (walkthrough) or a real
// conversation started (3+ turns). No follow-up automation to visitors —
// quiet is on-brand.

const { sendEmail, OWNER_EMAIL } = require('../_lib/email');
const store = require('../_lib/store');

const IDLE_MS = 30 * 60 * 1000;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!store.kvEnabled()) {
    return res.status(200).json({ ok: true, note: 'KV not configured — nothing to summarize' });
  }

  const now = Date.now();
  const ids = await store.listSessionIds();
  const abandoned = [];

  for (const id of ids) {
    const s = await store.getSession(id);
    if (!s) { await store.dropSessionFromIndex(id); continue; }
    const idle = now - (s.lastActivity || 0);
    if (s.hasBrief || idle > STALE_MS) { await store.dropSessionFromIndex(id); continue; }
    if (idle < IDLE_MS) continue; // may still be active — check next run
    const painCaptured = (s.answers && s.answers.painPoint) || (s.userTurns || 0) >= 3;
    if (painCaptured) abandoned.push(s);
    await store.dropSessionFromIndex(id); // reported (or below threshold) — don't re-report
  }

  if (abandoned.length) {
    const blocks = abandoned.map(s => {
      const when = s.lastActivity ? new Date(s.lastActivity).toISOString() : 'unknown';
      if (s.via === 'walkthrough') {
        const a = s.answers || {};
        const rows = Object.entries(a).map(([k, v]) => `  ${k}: ${v}`).join('\n');
        return `Walkthrough · last active ${when} · reached step ${(s.step ?? 0) + 1}\n${rows}`;
      }
      return `Conversation · last active ${when} · ${s.userTurns || 0} visitor turns\n\n${s.transcript || '(no transcript)'}`;
    });
    await sendEmail({
      to: OWNER_EMAIL,
      subject: `[Discovery] Daily summary — ${abandoned.length} abandoned session${abandoned.length === 1 ? '' : 's'}`,
      text: `Sessions that started discovery but never finished (no brief, idle 30+ min):\n\n${blocks.join('\n\n' + '─'.repeat(40) + '\n\n')}`,
    });
  }

  return res.status(200).json({ ok: true, abandoned: abandoned.length });
};
