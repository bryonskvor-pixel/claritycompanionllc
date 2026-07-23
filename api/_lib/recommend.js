// Track B rules engine — server-side recompute of the wizard recommendation.
// Logic and copy ported verbatim from the clarity-intake-system prototype's
// recommend(); the client runs the same rules for instant feedback, but if
// they ever diverge, this result is the one stored and trusted.
//
// The option strings the wizard sends contain typographic apostrophes
// (U+2019), so the matchers below use them too.

function recommend(d) {
  let rec, why;
  const p = d.painPoint || '', pres = d.presence || '';
  if (p.includes('can’t find') || pres.includes('Nothing') || pres.includes('never touch')) {
    rec = 'The Foundation ($400)';
    why = 'Before anything else, you need to exist where people search. The Foundation rebuilds your Google presence and shows you exactly what changed — the highest-leverage $400 in this business.';
  } else if (pres.includes('not proud') || p.includes('don’t call')) {
    rec = 'The Storefront ($1,000–2,000)';
    why = 'People are finding you and bouncing — that’s a website problem, not a marketing problem. The Storefront closes the loop, with Foundation work included.';
  } else if (p.includes('follow up') || p.includes('bids take')) {
    rec = 'The Companion ($2,000 + monthly)';
    why = 'Your presence works; your follow-up is the leak. An AI intake and follow-up system answers in seconds — even while you’re on the job — and a field-to-bid tool gets your numbers out faster.';
  } else {
    rec = 'Strategy Session ($150)';
    why = 'Your situation has more than one honest answer, and guessing would be a disservice. Ninety minutes, straight talk, and a written plan you keep either way.';
  }
  return { ...d, recommendation: rec, reasoning: why };
}

module.exports = { recommend };
