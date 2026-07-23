// Brief/session persistence on Vercel KV / Upstash Redis (REST API, no SDK).
// Without KV_REST_API_URL/TOKEN everything degrades gracefully: briefs still
// email, but nothing persists and durable rate limits are skipped.
//
// The `brief:` records here are v0 of the built-in CRM described on the
// services page — shaped so a pipeline UI can sit on them later:
//   brief:{id} = { id, timestamp, via, json, status: new|contacted|booked|won|lost }

const URL_ = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

function kvEnabled() {
  return Boolean(URL_ && TOKEN);
}

// Run a single Redis command, e.g. cmd('SET', 'foo', 'bar'). Returns the
// command result, or null when KV is unconfigured or errors.
async function cmd(...args) {
  if (!kvEnabled()) return null;
  try {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args.map(String)),
    });
    if (!res.ok) {
      console.error('[store] KV error', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error('[store] KV request failed', err.message);
    return null;
  }
}

async function getJson(key) {
  const raw = await cmd('GET', key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function setJson(key, value) {
  return cmd('SET', key, JSON.stringify(value));
}

// --- sessions (partial-lead capture) ---

async function saveSession(sessionId, patch) {
  if (!kvEnabled()) return;
  const existing = (await getJson(`session:${sessionId}`)) || { id: sessionId };
  const merged = { ...existing, ...patch, lastActivity: Date.now() };
  await setJson(`session:${sessionId}`, merged);
  await cmd('SADD', 'sessions:index', sessionId);
  await cmd('EXPIRE', `session:${sessionId}`, String(7 * 24 * 3600));
}

async function getSession(sessionId) {
  return getJson(`session:${sessionId}`);
}

async function listSessionIds() {
  const ids = await cmd('SMEMBERS', 'sessions:index');
  return Array.isArray(ids) ? ids : [];
}

async function dropSessionFromIndex(sessionId) {
  await cmd('SREM', 'sessions:index', sessionId);
}

// --- briefs (CRM v0) ---

async function saveBrief(record) {
  if (!kvEnabled()) return;
  await setJson(`brief:${record.id}`, record);
  await cmd('SADD', 'briefs:index', record.id);
}

async function briefExists(sessionId) {
  const exists = await cmd('EXISTS', `brief:${sessionId}`);
  return exists === 1;
}

// --- spend tracking (Track A cost ceiling) ---

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function addSpend(usd) {
  const result = await cmd('INCRBYFLOAT', `spend:${todayKey()}`, String(usd));
  await cmd('EXPIRE', `spend:${todayKey()}`, String(3 * 24 * 3600));
  return result === null ? null : parseFloat(result);
}

async function getSpend() {
  const raw = await cmd('GET', `spend:${todayKey()}`);
  return raw ? parseFloat(raw) : 0;
}

// SETNX-style flag so the spend alert emails once per day, not per request.
async function markSpendAlerted() {
  const set = await cmd('SETNX', `spendalert:${todayKey()}`, '1');
  await cmd('EXPIRE', `spendalert:${todayKey()}`, String(3 * 24 * 3600));
  return set === 1;
}

// --- durable rate limiting (supplements the in-memory limiter) ---

// Returns false when the caller exceeded `max` within `windowSec`.
// Returns true when allowed OR when KV is unconfigured (fail open; the
// in-memory limiter still applies).
async function kvAllow(key, max, windowSec) {
  if (!kvEnabled()) return true;
  const count = await cmd('INCR', `rl:${key}`);
  if (count === null) return true;
  if (count === 1) await cmd('EXPIRE', `rl:${key}`, String(windowSec));
  return count <= max;
}

// Track distinct chat sessions per IP (max N new sessions per hour).
async function kvAllowSession(ip, sessionId, max) {
  if (!kvEnabled()) return true;
  await cmd('SADD', `ipsess:${ip}`, sessionId);
  await cmd('EXPIRE', `ipsess:${ip}`, '3600');
  const count = await cmd('SCARD', `ipsess:${ip}`);
  return count === null || count <= max;
}

module.exports = {
  kvEnabled, cmd, getJson, setJson,
  saveSession, getSession, listSessionIds, dropSessionFromIndex,
  saveBrief, briefExists,
  addSpend, getSpend, markSpendAlerted,
  kvAllow, kvAllowSession,
};
