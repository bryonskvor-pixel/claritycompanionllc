# Clarity Companion — "Work With Us" Services Page
## Implementation Spec for Claude Code

**Goal:** Add a B2B services page to the existing claritycompanionllc.com repo, integrate it into site navigation and the homepage, and wire a working contact form. A finished design prototype is provided: `clarity-services-page.html`. Match it closely — it is the design source of truth for layout, palette, type, copy, and interactions.

---

## 0. Before you write code

1. Detect the repo's framework and conventions (Next.js / Astro / plain HTML — whatever exists). Implement the page natively in that framework. Do NOT drop the prototype in as a static orphan file; convert it into the site's component/page idioms.
2. Identify how existing pages (`/stack`, `/prompts`, `/about`) are structured and follow the same pattern for the new route.
3. Identify how fonts are loaded. The prototype uses Google Fonts: Fraunces (display, incl. italics), Outfit (body), JetBrains Mono (labels). If the main site already loads its own serif/body fonts, ASK before substituting — type is core to this design.
4. Check how the site is deployed (Vercel or Cloudflare Pages). This determines the form endpoint approach (Section 5).

## 1. Route & meta

- Route: `/services` (canonical). Also add a redirect from `/work-with-us` → `/services`.
- Title: `Work With Us — Clarity Companion | Websites, Google Presence & AI Tools for Contractors`
- Meta description: `Websites, Google Business Profiles, AI intake agents, catalog experts, and built-in CRMs for contractors and home service businesses. Fixed scopes, fixed prices, built by Clarity Companion.`
- OG tags matching the above. Generate an OG image if the repo has a pattern for it; otherwise skip and note it.
- Add the page to the sitemap if one exists.

## 2. Page structure (from the prototype, in order)

1. **Hero** — eyebrow "For contractors & home service businesses"; H1 "Your customers are searching. Show up right."; lede; two CTAs (packages / selector). Blueprint annotation block ("SHEET A-101…") top-right, desktop only, `aria-hidden`.
2. **Problem** — three cards (FINDING 01–03): empty profile, dead-end website, missed follow-up.
3. **Scope selector** (signature interaction) — "Where's your business right now?" Four choice pills; selecting one reveals a verdict panel (`aria-live="polite"`) and applies a `.highlight` state to the matching package card, with an anchor link to it. Verdict copy is in the prototype's JS — preserve it verbatim.
4. **Packages** — three cards as PHASE 01/02/03:
   - The Foundation — **$400**
   - The Storefront — **$1,000–2,000** (badge: MOST POPULAR)
   - The Companion — **$2,000 setup + monthly** (monthly deliberately unspecified: "scoped to what you actually use")
   - Strategy bar below: Strategy Session, **$150**, 90 minutes, dashed-border treatment.
   Preserve all bullet copy from the prototype.
5. **Systems** ("Systems we build into your site") — three alternating rows, each: mono system label, headline, body copy, amber tag pill, and a mock-UI panel:
   - Field-to-Bid (ScopeWalk): animated voice waveform + bid line items. Waveform is pure CSS keyframes; must pause under `prefers-reduced-motion`.
   - Catalog Agent: chat Q/A with citation chip.
   - Built-in CRM: three-column pipeline (New Lead / Bid Sent / Won).
   Mock panels are static illustrations, not functional apps. Build them as components so they can later be replaced with live demos.
6. **Proof strip** — six linked cards: remodel.guide, Remodelry, michigancannabis.guide, Integrated Architectural (see ⚠️ below), Currently (currently.site), Nails by Marissa. External links: `target="_blank" rel="noopener"`.
7. **Contact** — two-column: pitch copy left, form right. Fields: name, business, email (required), "interested in" select mirroring the four offers + "Not sure yet", message textarea. Submit = "Send it".
8. **Footer** — match main site footer, add "SHEET A-101 · WORK WITH US" mono stamp.

⚠️ **IAS proof card:** implementation may proceed, but flag it in the PR/summary: owner needs to confirm this client/demo work can be publicly linked. Make it trivially easy to swap the card for an anonymized version ("Specialty architectural products dealer · Ohio", no link).

## 3. Design system

Use the prototype's tokens exactly (define as CSS variables or the repo's token system):

```
--ink:#0B1220  --surface:#101A2C  --surface-2:#15213A
--cyan:#6FD3E8  --cyan-dim:#3E93A8  --amber:#E8B15C
--text:#E9EEF5  --muted:#93A1B8
--line:rgba(111,211,232,.14)  --line-strong:rgba(111,211,232,.35)
```

- Blueprint grid background: fixed, 56px cells, radial mask fading below the fold, `aria-hidden`, `pointer-events:none`.
- Type roles: Fraunces = headings (weight 400, italics for emphasis); Outfit 300/400/500 = body/UI; JetBrains Mono = eyebrows, labels, annotations (uppercase, wide tracking).
- Motion: IntersectionObserver scroll reveals (fade + 26px rise), hover lifts on cards, waveform animation. All motion disabled under `prefers-reduced-motion: reduce`.
- Accessibility floor: visible `:focus-visible` outlines (cyan), semantic headings, form labels bound to inputs, verdict panel `aria-live`, color contrast at least AA for body text.

## 4. Site-wide integration

1. **Main nav** (all pages): add "Services" between Platforms and Stack → `Platforms · Services · Stack · Prompts · Our Story`.
2. **Homepage section**: insert a short section between "Our Platforms" and the closing quote:
   - Eyebrow: `For businesses`
   - Heading: `We build these for businesses, too.`
   - Body: `Websites, Google presence, AI intake agents, catalog experts, and built-in CRMs — for contractors and home service businesses that want to show up the way their work deserves.`
   - Link: `Work with us →` → `/services`
   - Style it in the homepage's existing visual language, not the services page's blueprint language. Keep it quiet; the consumer story stays the lead.
3. **Footer** (site-wide): add a "Work With Us" link and a contact email line (see Section 5 for address).

## 5. Contact form backend

Priority order — use the first that fits the repo:
1. If the repo already has a form/email mechanism, reuse it.
2. If Next.js on Vercel: API route + [Resend](https://resend.com) (needs `RESEND_API_KEY` env var — stub it and document setup in the PR).
3. If Cloudflare Pages: Pages Function + MailChannels or Resend.
4. Fallback: Formspree with a placeholder form ID, clearly documented.

Behavior:
- Client-side validation, disabled submit while sending, inline success state ("Sent. You'll hear from a real person within one business day."), inline error with retry — no alert() dialogs.
- Honeypot field + basic rate limiting for spam.
- Send-to address: `bryon@claritycompanionllc.com` — **confirm with owner**; if the domain has no mailbox, note that as a setup task.
- Include selected package in the email subject line, e.g. `[Services inquiry] The Storefront — {name}`.

## 6. ScopeWalk section (stub for a future task)

Create the route `/services/scopewalk` with a minimal placeholder page (same design language, "coming soon" is fine) and link the Field-to-Bid system row's tag/heading to it. A full ScopeWalk showcase (interactive demo of walkthrough → transcription → priced bid) is a separate upcoming task — structure the Systems mock panels as swappable components with that in mind.

## 7. Future: consultative intake system (do not build yet)

The scope selector is v1 of a consultative intake flow. Keep its logic isolated (its own component + a data object for choices/verdicts) so it can later grow into a multi-step, possibly Claude-API-powered intake without touching the rest of the page. Do not add API calls now.

## 8. Definition of done

- [ ] `/services` live, matching the prototype on desktop and mobile (≤380px clean)
- [ ] Nav + homepage section + footer updated site-wide
- [ ] Selector highlights correct package cards; verdicts verbatim
- [ ] Form sends real email (or documented one-step setup remaining)
- [ ] Reduced motion, keyboard nav, and focus states verified
- [ ] Lighthouse: 90+ performance/accessibility/SEO on the new page
- [ ] `/services/scopewalk` stub exists and is linked
- [ ] PR/summary flags: IAS proof-card approval, contact email confirmation, monthly Companion pricing still TBD
