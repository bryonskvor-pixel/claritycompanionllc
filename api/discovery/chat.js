// POST /api/discovery/chat — the C.C. proxy (Track A).
// The Anthropic API key lives ONLY here, server-side. The system prompt is
// injected server-side; nothing client-supplied is trusted beyond the visible
// conversation turns.

const { SYSTEM_PROMPT } = require('../_lib/cc-system-prompt');
const { sendEmail, OWNER_EMAIL } = require('../_lib/email');
const { allow, clientIp } = require('../_lib/ratelimit');
const store = require('../_lib/store');

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 1000;
const MAX_REQUESTS_PER_SESSION = 30;
const MAX_SESSIONS_PER_IP_HOUR = 5;
const MAX_USER_TURNS = 15;
const MAX_MSG_CHARS = 2000;

// Haiku 4.5 per-MTok pricing for the spend ceiling estimate.
const PRICE = { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.1 };

const LIMIT_MESSAGE = "You've put real time into this — let's not lose it to a long chat. Switch over to the walkthrough option; it covers the same ground step-by-step and takes just a few minutes.";
const DISABLED_MESSAGE = "I'm taking a short break, but the walkthrough option covers the exact same ground — step-by-step, just a few minutes. Head back and choose that path.";
const WRAP_UP_INSTRUCTION = 'SYSTEM NOTE: The conversation has reached its length limit. In your next message, briefly thank them, then emit the [BRIEF] token and the one-line JSON object exactly as your instructions describe, using everything gathered so far. Leave unknown fields as empty strings.';
const JSON_RETRY_INSTRUCTION = 'SYSTEM NOTE: Your previous message was meant to end with the [BRIEF] token followed by a valid one-line JSON object, but the JSON could not be parsed. Reply with ONLY the token [BRIEF] followed by the JSON object on one line — no other text.';

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const messages = [];
  for (const m of raw.slice(0, 80)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
    let content = m.content;
    if (m.role === 'user' && content.length > MAX_MSG_CHARS) content = content.slice(0, MAX_MSG_CHARS);
    messages.push({ role: m.role, content });
  }
  return messages;
}

function logAnomalies(messages, sessionId) {
  const last = messages[messages.length - 1];
  if (last && last.role === 'user' &&
      /ignore (all|your|previous)|system prompt|new instructions|you are now/i.test(last.content)) {
    console.warn('[discovery/chat] possible prompt-injection attempt', sessionId, last.content.slice(0, 200));
  }
}

async function callClaude(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Prompt caching: the system prompt is resent every turn, so cache it.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

function usageCost(usage) {
  if (!usage) return 0;
  return (
    (usage.input_tokens || 0) * PRICE.input +
    (usage.output_tokens || 0) * PRICE.output +
    (usage.cache_creation_input_tokens || 0) * PRICE.cacheWrite +
    (usage.cache_read_input_tokens || 0) * PRICE.cacheRead
  ) / 1e6;
}

function extractText(data) {
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
}

// Extract the first balanced JSON object after the [BRIEF] token. Models
// occasionally append trailer text after the JSON despite instructions, so
// parsing "everything after the token" is too brittle.
function extractJsonObject(s) {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

function tryParseBrief(reply) {
  if (!reply.includes('[BRIEF]')) return { hasToken: false };
  const jsonPart = extractJsonObject(reply.split('[BRIEF]')[1].replace(/```json|```/g, ''));
  try {
    const brief = JSON.parse(jsonPart);
    if (!brief || typeof brief !== 'object' || Array.isArray(brief)) throw new Error('not an object');
    return { hasToken: true, brief };
  } catch {
    return { hasToken: true, brief: null };
  }
}

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

function transcriptText(messages, finalReply) {
  const lines = messages.map(m => `${m.role === 'user' ? 'VISITOR' : 'C.C.'}: ${m.content}`);
  if (finalReply) lines.push(`C.C.: ${finalReply}`);
  return lines.join('\n\n');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[discovery/chat] ANTHROPIC_API_KEY not set');
    return res.status(200).json({ reply: DISABLED_MESSAGE, disabled: true });
  }

  const { sessionId, messages: rawMessages } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }
  const messages = sanitizeMessages(rawMessages);
  if (!messages || !messages.length) return res.status(400).json({ error: 'Invalid messages' });

  // Spend ceiling: auto-disable Track A with a graceful fallback.
  const ceiling = parseFloat(process.env.DAILY_SPEND_CEILING_USD || '5');
  const spent = await store.getSpend();
  if (spent >= ceiling) {
    return res.status(200).json({ reply: DISABLED_MESSAGE, disabled: true });
  }

  // Rate limits: per-session request cap + sessions-per-IP (in-memory always,
  // KV-backed when configured).
  const ip = clientIp(req);
  const sessionOk = allow(`chat:${sessionId}`, MAX_REQUESTS_PER_SESSION, 60 * 60 * 1000) &&
    (await store.kvAllow(`chat:${sessionId}`, MAX_REQUESTS_PER_SESSION, 3600));
  const ipOk = await store.kvAllowSession(ip, sessionId, MAX_SESSIONS_PER_IP_HOUR);
  if (!sessionOk || !ipOk) {
    return res.status(200).json({ reply: LIMIT_MESSAGE, limited: true });
  }

  logAnomalies(messages, sessionId);

  // Turn cap: force the brief once the visitor has spent 15 turns.
  const userTurns = messages.filter(m => m.role === 'user').length;
  const callMessages = messages.slice();
  if (userTurns >= MAX_USER_TURNS) {
    callMessages.push({ role: 'user', content: WRAP_UP_INSTRUCTION });
  }

  let data;
  try {
    data = await callClaude(callMessages);
  } catch (err) {
    console.error('[discovery/chat]', err.message);
    return res.status(502).json({ error: 'Upstream error' });
  }

  // Per-session token/cost observability + daily ceiling accounting.
  const cost = usageCost(data.usage);
  console.log('[discovery/chat] session', sessionId, 'usage', JSON.stringify(data.usage || {}), 'cost', cost.toFixed(5));
  const total = await store.addSpend(cost);
  if (total !== null && total >= ceiling && (await store.markSpendAlerted())) {
    await sendEmail({
      to: OWNER_EMAIL,
      subject: '[Discovery] Daily spend ceiling reached — Track A disabled',
      text: `Claude spend today reached $${total.toFixed(2)} (ceiling $${ceiling.toFixed(2)}).\nC.C. chat is disabled until tomorrow; visitors are pointed to the walkthrough.`,
    });
  }

  const reply = extractText(data);
  let parsed = tryParseBrief(reply);

  // Amendment: validate [BRIEF] JSON server-side; retry once instructing the
  // model to output only the JSON object.
  let retryReply = null;
  if (parsed.hasToken && !parsed.brief) {
    try {
      const retryData = await callClaude([
        ...callMessages,
        { role: 'assistant', content: reply },
        { role: 'user', content: JSON_RETRY_INSTRUCTION },
      ]);
      const retryCost = usageCost(retryData.usage);
      await store.addSpend(retryCost);
      retryReply = extractText(retryData);
      const reparsed = tryParseBrief(retryReply);
      if (reparsed.brief) parsed = reparsed;
    } catch (err) {
      console.error('[discovery/chat] brief retry failed', err.message);
    }
  }

  const visible = reply.split('[BRIEF]')[0].trim();

  // Persist the running transcript (partial-lead capture).
  await store.saveSession(sessionId, {
    via: 'conversation',
    transcript: transcriptText(messages, reply),
    userTurns,
    hasBrief: Boolean(parsed.hasToken),
  });

  if (parsed.hasToken && parsed.brief) {
    const record = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      via: 'conversation',
      json: parsed.brief,
      status: 'new',
    };
    await store.saveBrief(record);
    const who = parsed.brief.business || parsed.brief.name || 'Unknown';
    await sendEmail({
      to: OWNER_EMAIL,
      subject: `[Discovery] ${who} — rec: ${parsed.brief.recommendation || 'n/a'}`,
      text: `${briefText(parsed.brief)}\n\n--- FULL TRANSCRIPT ---\n\n${transcriptText(messages, reply)}`,
      replyTo: parsed.brief.email || undefined,
    });
    return res.status(200).json({ reply: visible, brief: parsed.brief, briefStatus: 'ok' });
  }

  if (parsed.hasToken && !parsed.brief) {
    // Failed twice: store the raw transcript, flag for owner review, and let
    // the visitor see the normal confirmation.
    await store.saveBrief({
      id: sessionId,
      timestamp: new Date().toISOString(),
      via: 'conversation',
      json: null,
      rawTranscript: transcriptText(messages, reply) + (retryReply ? `\n\nC.C. (retry): ${retryReply}` : ''),
      status: 'needs-review',
    });
    await sendEmail({
      to: OWNER_EMAIL,
      subject: '[Discovery — needs review] Brief JSON failed to parse',
      text: `C.C. finished a discovery conversation but the [BRIEF] JSON failed to parse twice.\nSession: ${sessionId}\n\n--- FULL TRANSCRIPT ---\n\n${transcriptText(messages, reply)}${retryReply ? `\n\nC.C. (retry): ${retryReply}` : ''}`,
    });
    return res.status(200).json({ reply: visible, briefStatus: 'needs-review' });
  }

  return res.status(200).json({ reply });
};
