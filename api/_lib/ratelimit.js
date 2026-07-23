// Basic in-memory rate limiting. Serverless instances don't share memory, so
// this is best-effort spam protection, not a hard guarantee — acceptable for
// the traffic profile of a small-business contact/intake form. When KV is
// configured (see store.js), the discovery endpoints add durable limits on top.

const buckets = new Map();

// Returns true if the caller identified by `key` is within `max` hits per
// `windowMs`; false if they should be rejected.
function allow(key, max, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : (fwd || '')).split(',')[0].trim() || 'unknown';
}

module.exports = { allow, clientIp };
