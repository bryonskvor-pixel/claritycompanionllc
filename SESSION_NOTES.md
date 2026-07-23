# Session Notes

## 2026-07-22 — B2B services page + discovery intake system

### Accomplished
- **Phase 1 (implementationspec.md)**: `/services` built natively as `services/index.html` (static self-contained page, matching the `clarityservicespage` prototype exactly — tokens, copy, selector verdicts, mock panels). `/services/scopewalk` stub. `/work-with-us` → `/services` redirect. Contact form wired to `api/contact.js` (Resend, honeypot, rate limit, `[Services inquiry]` subjects). Services nav link, homepage "We build these for businesses, too." strip, and Work With Us + email in every footer.
- **Phase 2 (intakespec.md + amendments)**: `/services/discovery` dual-track intake. `api/discovery/chat.js` proxies C.C. on **claude-haiku-4-5** with **prompt caching**, rate limits (30 req/session, 5 sessions/IP/hr), 15-turn cap with forced wrap-up, 2,000-char truncation, server-side `[BRIEF]` parse with one-retry → needs-review email fallback. `api/discovery/brief.js` (store + owner email + server-recomputed wizard rec + visitor copy), `progress.js` (partial leads), `daily-summary.js` (Vercel Cron 12:00 UTC digest of abandoned sessions). KV store (`api/_lib/store.js`) degrades gracefully when unconfigured. Daily spend ceiling auto-disables Track A + alerts owner.
- **Testing**: 3 rounds × 5 simulated full discoveries. Round 1 exposed question-bundling → appended discipline rules to `api/_lib/cc-system-prompt.js`. Round 2 exposed trailer text after the brief JSON → balanced-brace extractor in chat.js. Final round: 5/5 clean briefs, correct recommendations, one-ask-per-message held.

### State
- All code committed on `main`, **not pushed, not deployed** (owner deploys).
- `ANTHROPIC_API_KEY` is in local `.env` (gitignored). Owner pasted it into `.env.example` mid-session; it was moved out before any commit — never entered git history.
- No KV/Resend configured yet; everything degrades gracefully until env vars are set in Vercel.

### Next steps
1. Owner: push + deploy; set env vars per README table (Resend key, KV, ANTHROPIC_API_KEY, CRON_SECRET).
2. Owner decisions resolved 2026-07-22: mailbox `bryon@claritycompanionllc.com` CONFIRMED; IAS proof card swapped to anonymized version (no link); Companion monthly pricing stays as-is. Still open: booking URL — owner will add Calendly later (`BOOKING_URL` const in `services/discovery/index.html`, currently falls back to `/services#contact`).
3. Post-deploy: verify a real brief email end-to-end, Lighthouse pass on `/services`, test cron fires.
4. Future tasks per specs: pipeline UI on the `brief:*` KV records (CRM v0). ScopeWalk page now has a scripted interactive demo (2026-07-22); the "full showcase" (real voice → real pricing) remains future work.
5. Polish added 2026-07-22: OG image (`services/og.png`, rendered headless-Edge from blueprint-styled HTML), plotter-style typing animation on hero sheet annotations, scroll-triggered Field-to-Bid mock sequence, interactive ScopeWalk demo with replay.

### Context
- Repo is plain static HTML on Vercel; nested routes = `dir/index.html`; root pages use rewrites in `vercel.json`.
- Specs live in repo as `implementationspec.md` / `intakespec.md`; prototypes as `clarityservicespage/index.html` / `clarityintakesystem/index.html` (keep — they're the design source of truth).
- C.C.'s voice lives in `api/_lib/cc-system-prompt.js`; discipline rules at the bottom were added from test evidence — don't remove them casually.
- Test harness + transcripts: session scratchpad (`test-cc.js`, `transcript-*.txt`) — temp files, not in repo.
