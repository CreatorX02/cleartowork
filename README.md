# ClearToWork

Right to work and employment compliance platform for small UK hospitality,
food and care businesses. See `../files/07_MVP_PHASED_PRD.md` for the phased
PRD this codebase implements — this repo is **Phase 1: Compliance Register**.

## Stack

- **Next.js 15** (App Router, TypeScript, Tailwind) — web service
- **Railway Postgres** (EU region) via **Prisma 7** (`@prisma/adapter-pg`)
- **Better Auth** — email/password + optional Google, sessions in Postgres
- **pg-boss** worker service — nightly expiry scan + alert emails (Resend)
- **Cloudflare R2 / S3** (EU) — evidence files, presigned URLs ≤24h
- **Stripe** — subscription billing (Checkout + hosted Billing Portal)

## Local development

Requires Node 22+ and a local Postgres.

```bash
cp .env.example .env       # fill in DATABASE_URL and BETTER_AUTH_SECRET
npm install
npx prisma migrate dev     # applies migrations (includes event_log triggers)
npm run db:seed            # optional: synthetic demo data
npm run dev                # web app on :3000
npm run worker             # in a second terminal: job runner
```

Without `RESEND_API_KEY`, alert emails are logged to the console instead of
sent. Without `COMPANIES_HOUSE_API_KEY`, onboarding autofill degrades to
manual entry. Without `STRIPE_SECRET_KEY`, the billing page renders in a
"not configured" state and the webhook returns 501 — everything else works.

To exercise billing locally you need the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# copy the printed whsec_... into STRIPE_WEBHOOK_SECRET, then in another shell
stripe trigger customer.subscription.updated
```

## Deploying on Railway

One project, three components, all in an **EU region** (data residency
requirement — see `../files/05_COMPLIANCE_SECURITY.md`):

1. **Postgres plugin** — add to the project; `DATABASE_URL` is injected.
2. **web service** — deploy from this repo. Uses `railway.json`
   (build `npm run build`, start `npx prisma migrate deploy && npm run start`).
   Set env vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (the Railway
   domain), storage + Resend + Companies House keys.
3. **worker service** — second service from the same repo. In the service
   settings, point the config file at `railway.worker.json`
   (start `npm run worker`). Needs `DATABASE_URL` and `RESEND_API_KEY`.
   Scheduling is inside pg-boss (nightly 06:00 UK) — no Railway cron needed.

Then add a Stripe webhook endpoint pointing at
`https://<railway-domain>/api/stripe/webhook`, subscribing to
`checkout.session.completed`, `customer.subscription.*`, `invoice.paid` and
`invoice.payment_failed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`
on the **web** service, along with `STRIPE_SECRET_KEY` and the three
`STRIPE_PRICE_*` IDs.

## Architecture notes

- **Tenant isolation** — every tenant table carries `business_id`; all
  reads/writes derive scope from the session membership via
  `src/lib/tenant.ts` (`requireBusiness()`), never from request input.
- **Event log** — `event_log` is append-only; the initial migration installs
  triggers that reject `UPDATE`/`DELETE` at the database level. Every state
  change on compliance-critical entities must call `logEvent()` inside the
  same transaction.
- **Evidence storage** — private bucket only; access via presigned URLs
  hard-capped at 24h (`src/lib/storage.ts`).
- **Billing** — the `businesses` row is a read-model of Stripe. Only the
  webhook (`src/app/api/stripe/webhook/route.ts` → `syncSubscription()` in
  `src/lib/billing.ts`) writes plan/status, so Checkout, the Billing Portal
  and dunning all converge on one path. Every Stripe event ID is recorded in
  `stripe_events` for idempotency.
- **Prisma client** — generated into `src/generated/prisma` (gitignored);
  `npm run build` regenerates it.

See `CLAUDE.md` for the full conventions and directory map.

## Phase 1 remaining work (tracked in the PRD §4)

- [ ] CSV worker import with per-row validation
- [ ] Manual / share-code check recording with evidence upload
- [ ] Fail/Refer guided next-steps page (DRAFT-watermarked until solicitor sign-off)
- [ ] Email verification + alert emails via Resend (wired, needs key + domain)
- [ ] Confirm the plan price points and entitlement caps in `src/lib/billing.ts`
      (`PLANS` currently carries placeholder worker/site limits)
- [ ] Cross-tenant access tests in CI (launch gate #11)
- [ ] Sentry + BetterStack status page

## Known advisories

- `npm audit` reports a `sharp` advisory transitively via Next 15.5; the fix
  is the Next 16 major. Revisit at the Phase 2 dependency pass.
