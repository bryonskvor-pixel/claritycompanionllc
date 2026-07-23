# claritycompanionllc
Clarity Companion LLC AI-powered guidance platforms connecting consumers with clarity before consequential decisions.

Static HTML site deployed on Vercel. Each page is a self-contained HTML file; nested routes use `directory/index.html` (e.g. `/services` → `services/index.html`). Serverless functions live in `api/`.

## B2B services & discovery intake

- `/services` — Work With Us page (packages, scope selector, systems, contact form)
- `/services/scopewalk` — Field-to-Bid stub (full showcase is a future task)
- `/services/discovery` — dual-track discovery intake: C.C. chat (Track A) or step-by-step walkthrough (Track B), both ending in a Discovery Brief emailed to the owner
- `/work-with-us` — redirects to `/services`

### Server setup (Vercel → Settings → Environment Variables)

See `.env.example` for the full list. Summary:

| Variable | Required for | Notes |
|---|---|---|
| `RESEND_API_KEY` | contact form + brief emails | Without it, sends become logged no-ops (site still works) |
| `CONTACT_TO_EMAIL` | delivery address | Defaults to `bryon@claritycompanionllc.com` — confirm this mailbox exists |
| `CONTACT_FROM_EMAIL` | branded sending | Needs the domain verified in Resend; leave unset to use `onboarding@resend.dev` (delivers only to the Resend account owner) |
| `ANTHROPIC_API_KEY` | C.C. chat (Track A) | Server-side only, never in client code. Missing → Track A gracefully points visitors to Track B |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | brief/session storage | Vercel KV or Upstash Redis REST. Optional: without it briefs still email but aren't persisted, and durable rate limits are skipped |
| `DAILY_SPEND_CEILING_USD` | spend guard | Default `5`; Track A auto-disables past it and emails the owner once |
| `CRON_SECRET` | daily-summary cron auth | Vercel sends it automatically as a Bearer token when set |

The C.C. proxy (`api/discovery/chat.js`) uses `claude-haiku-4-5` with prompt caching on the system prompt (`api/_lib/cc-system-prompt.js` — edit that file to tune C.C.'s voice). The `brief:*` records in KV are v0 of the built-in CRM: `{ id, timestamp, via, json, status: new|contacted|booked|won|lost }`, shaped for a future pipeline UI.

The abandoned-session digest runs daily at 12:00 UTC via Vercel Cron (`vercel.json` → `crons`).
