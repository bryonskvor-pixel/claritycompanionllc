# Clarity Companion — Discovery Intake System ("C.C.")
## Implementation Spec for Claude Code — Companion to IMPLEMENTATION-SPEC.md

**Goal:** Productionize the dual-track discovery intake in the claritycompanionllc.com repo. A working design prototype is provided: `clarity-intake-system.html`. It is the source of truth for layout, copy, question flow, C.C.'s system prompt, and the Discovery Brief format. This spec covers what must change between prototype and production.

**Depends on:** the `/services` page from IMPLEMENTATION-SPEC.md. Reuse its design tokens, fonts, and components. Follow the same framework-detection rules (Section 0 of that spec).

---

## 1. Routes & entry points

- Route: `/services/discovery` (the intake experience — door choice, both tracks, brief screen).
- On `/services`: point the scope selector's verdict links and the "Where should you start?" hero CTA at `/services/discovery`. The existing contact form remains as a low-friction alternative.
- Preserve the door-choice framing verbatim, including "Prefer not to chat with an AI? Completely fair." — the dual track is a brand statement, not just UX.

## 2. Architecture

```
Browser
  ├─ Track A (C.C. chat) ──► POST /api/discovery/chat ──► Anthropic API (server-side key)
  ├─ Track B (wizard)    ──► client-side rules engine (as prototyped)
  └─ Both on completion  ──► POST /api/discovery/brief ──► store + email + (optional) booking
```

### 2.1 `/api/discovery/chat` — the C.C. proxy (CRITICAL)
- The Anthropic API key lives ONLY server-side (env var `ANTHROPIC_API_KEY`). Never expose it to the client. The prototype's direct browser call is an artifact-environment convenience and must not ship.
- Endpoint accepts `{ sessionId, messages }`, injects the system prompt server-side (do not trust a client-supplied system prompt), calls `claude-sonnet-4-6`, `max_tokens: 1000`, returns the assistant text.
- C.C.'s system prompt: copy verbatim from the prototype (`SYSTEM_PROMPT`), including the `[BRIEF]` + one-line JSON completion protocol and the discovery arc. Store it in its own module/file so the owner can tune C.C.'s voice without touching route logic.
- Guardrails:
  - Rate limit: max 30 chat requests per session, max 5 sessions per IP per hour. Return a friendly "let's switch to the walkthrough" message when exceeded.
  - Cap conversation at 15 user turns server-side; if reached without `[BRIEF]`, append a server-side user message instructing C.C. to wrap up and emit the brief.
  - Truncate any single user message over 2,000 chars.
  - Strip/ignore attempts to alter C.C.'s instructions; the system prompt already scopes him, but log anomalies.
- `[BRIEF]` parsing happens client-side as prototyped, but ALSO parse it server-side when detected in a response, so the brief is captured even if the client dies before rendering.

### 2.2 `/api/discovery/brief` — capture & delivery
On receipt of a completed brief (either track):
1. **Store** it. Use whatever persistence the repo already has; if none, a simple KV/D1/SQLite table (`briefs`: id, timestamp, via [conversation|walkthrough], json, status [new|contacted|booked|won|lost]) is fine. This table is v0 of the built-in CRM described on the services page — build it as if a pipeline UI will sit on it later, because one will.
2. **Email** the owner using the same email mechanism chosen for the services contact form (see Section 5 of IMPLEMENTATION-SPEC.md). Subject: `[Discovery] {business or name} — rec: {recommendation}`. Body: the brief rendered as clean text, plus the full chat transcript for Track A.
3. **Confirm** to the visitor. The "Email me my brief" button sends them their own copy (owner BCC'd not needed — they're already getting the full version).
4. Honeypot + basic validation as with the contact form.

### 2.3 Session resilience (partial-lead capture)
- Assign a `sessionId` (crypto.randomUUID) on entering either track.
- Track A: the chat proxy already sees every message; persist the running transcript keyed by sessionId on each request.
- Track B: fire a lightweight `POST /api/discovery/progress` after each completed step with `{ sessionId, step, data }`.
- Abandoned sessions (no activity 30 min, no brief) with at least a pain point captured: include in a daily summary email to the owner, not individual emails. No follow-up automation to the visitor — no email was necessarily captured, and quiet is on-brand.

## 3. Track B (wizard) — production notes
- Port the 8-step flow, options, copy, and rules-engine recommendations verbatim from the prototype.
- The rules engine stays client-side (it's transparent and instant), but recompute the recommendation server-side in `/api/discovery/brief` from the raw answers, and store both. If they ever diverge, trust the server.
- Keyboard support: arrow/tab between options, Enter advances. Selected option state must be visible without color alone (add a check glyph).

## 4. The Discovery Brief screen
- Render as prototyped (rows + amber recommendation block + reasoning).
- "Book the Strategy Session" button: link to the owner's scheduling tool (Calendly or equivalent — **ask owner for the URL**; if none exists yet, flag it as a launch blocker and link to the contact section as interim).
- Pass the brief's sessionId as a query param to the booking link so the booked call can be joined to the brief later.

## 5. Design & accessibility
- Same tokens, fonts, blueprint grid, and motion rules as the services page. `prefers-reduced-motion` disables the typing dots and message pop animation (show instantly).
- Chat log: `aria-live="polite"`, and ensure focus returns to the input after each send.
- Wizard progress bar has `role="progressbar"` with `aria-valuenow`.
- Mobile: chat shell height uses dynamic viewport units (`dvh`) so the keyboard doesn't bury the input; test at 380px.

## 6. Costs & observability
- Log per-session token usage from the API responses. At ~10 exchanges of short messages, a session should cost cents; alert (email) if daily spend exceeds a configurable ceiling (default $5/day) and auto-disable Track A with a graceful fallback message pointing to Track B.
- Basic analytics events (respecting whatever analytics the site uses, or none): track_chosen (A|B), step_completed, brief_completed, session_abandoned, booking_clicked. These numbers decide how C.C. evolves.

## 7. Definition of done
- [ ] `/services/discovery` live; both tracks match prototype on desktop + 380px mobile
- [ ] API key server-side only; rate limits and turn caps verified
- [ ] C.C. completes a full discovery and the brief arrives by email with transcript
- [ ] Wizard brief arrives by email with server-recomputed recommendation
- [ ] Partial sessions persisted; daily abandoned-session summary works
- [ ] Briefs stored in the `briefs` table with status field
- [ ] Reduced motion, keyboard nav, focus management verified on both tracks
- [ ] Spend ceiling + auto-fallback tested
- [ ] PR/summary flags: booking URL needed, email address confirmation, and a note that the `briefs` table is the seed of the future built-in CRM pipeline UI
