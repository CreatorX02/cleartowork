# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**ClearToWork** — a right-to-work and employment compliance platform for small
UK hospitality, food and care businesses. A business owner registers their
workers, records right-to-work checks against them, and gets alerted before
any permission or follow-up date expires.

This repo implements **Phase 1: Compliance Register** of a phased product
plan. The PRD and design documents live *outside* this repository (referenced
in code comments as `01_PRD.md`, `02_TECHNICAL_ARCHITECTURE.md`,
`04_API_SPEC.md`, `05_COMPLIANCE_SECURITY.md`, `07_MVP_PHASED_PRD.md`, under a
sibling `files/` directory). **You will not be able to read them.** When a
comment cites one, treat the comment itself as the requirement and do not
invent details from the filename — ask instead.

This is a compliance product handling personal data about real workers. Two
things follow from that and are treated as non-negotiable below: tenant
isolation and the append-only audit trail.

## Commands

```bash
npm install
npm run dev          # Next.js dev server (turbopack) on :3000
npm run worker       # pg-boss job runner — second process, same database
npm run build        # prisma generate && next build
npm run start        # production server
npm run lint         # eslint (next/core-web-vitals + next/typescript)
npm run typecheck    # tsc --noEmit
npm run db:migrate   # prisma migrate dev  (interactive)
npm run db:deploy    # prisma migrate deploy (CI/production)
npm run db:seed      # synthetic demo data
npm run db:studio    # prisma studio
```

Requires Node 22+ and a Postgres reachable at `DATABASE_URL`.

There is **no test runner in this repo yet.** "Verified" here means
`npm run typecheck && npm run lint && npm run build` all pass, plus whatever
manual exercise the change warrants. Do not claim a change is tested because
those pass. If you add a test framework, add it to CI at the same time.

Before pushing anything, run the same gates CI runs (`.github/workflows/ci.yml`):

```bash
npx prisma validate && npx prisma generate && npx prisma migrate deploy
npx tsc --noEmit && npm run lint && npm run build
```

## Architecture

Two runtimes, one Postgres, one bucket:

```
┌─────────────────┐        ┌──────────────────┐
│  web (Next.js)  │        │  worker (tsx)    │
│  App Router     │        │  pg-boss cron    │
│  RSC + actions  │        │  expiry-scan     │
│                 │        │  send-alert      │
└────────┬────────┘        └─────────┬────────┘
         │      ┌────────────────┐   │
         └──────┤ Postgres (EU)  ├───┘
                │ app + pgboss   │
                └────────────────┘
   R2/S3 (EU, private)      Stripe        Resend    Companies House
```

- **web** — Next.js 15 App Router, React 19, Tailwind v4. Server Components by
  default; mutations are Server Actions. Deployed from `railway.json`.
- **worker** — a plain Node process (`tsx worker/index.ts`) running pg-boss.
  Schedules live *in* pg-boss (`boss.schedule`), so no external cron service
  is needed. Deployed from `railway.worker.json`.
- Both processes import from `src/lib/` — the worker uses the `@/*` path alias
  too, so shared logic goes in `src/lib/`, never duplicated into `worker/`.
- Everything must sit in an **EU region**: data residency is a compliance
  requirement, not a preference.

### Directory map

```
src/
  app/
    (auth)/sign-in, sign-up      client components, Better Auth
    api/auth/[...all]/           Better Auth catch-all handler
    api/companies-house/[number] onboarding autofill proxy
    api/stripe/webhook/          Stripe webhook — see Billing below
    billing/                     plan/subscription UI + checkout actions
    dashboard/                   RAG worker list + compliance stats
    onboarding/                  first-run business + site creation
    workers/new/                 add-worker form + action
  lib/
    auth.ts        Better Auth server config
    auth-client.ts Better Auth React client ("use client")
    billing.ts     Stripe client, plan catalog, subscription sync
    db.ts          Prisma singleton (globalThis-cached in dev)
    email.ts       Resend wrapper; dry-run logs without a key
    events.ts      logEvent() — the append-only audit trail
    expiry.ts      date maths + RAG status (pure, no I/O)
    storage.ts     R2/S3 evidence storage + presigned URLs
    tenant.ts      requireUser / requireBusiness — tenant isolation
  generated/prisma/              Prisma client output — GITIGNORED
worker/
  index.ts                       pg-boss bootstrap, queues, schedules
  jobs/expiry-scan.ts            nightly 06:00 Europe/London
  jobs/send-alert.ts             one alert email per Alert row
prisma/
  schema.prisma                  single source of truth for the data model
  migrations/                    SQL migrations, applied in order
  seed.ts                        synthetic demo data only
```

## Non-negotiable conventions

These are the rules that protect tenant data and the audit trail. Breaking one
is a defect even if the code compiles and the feature works.

### 1. Tenant isolation goes through `requireBusiness()`

Every page, server action and route handler that touches tenant data derives
its `businessId` from `src/lib/tenant.ts`:

```ts
const { businessId, userId, role } = await requireBusiness();
```

**Never** read a `businessId` (or `siteId`, or any tenant key) from a form
field, request body, query string or URL segment. The session membership is
the only source of scope. Every tenant table carries `business_id`, and every
query must filter on the derived value.

`requireBusiness()` redirects to `/onboarding` when the user has no
membership; `requireUser()` redirects to `/sign-in` when there is no session.

Owner-only operations (billing, anything that moves money or changes the
tenant's shape) additionally check `role === "owner"`.

### 2. `event_log` is append-only, and state changes must log

`event_log` has database triggers that reject `UPDATE` and `DELETE`
(`prisma/migrations/000000000000_init/migration.sql`). Do not attempt to
mutate it, and do not remove those triggers.

Every state change on a compliance-critical entity calls `logEvent()` **inside
the same transaction** as the change, so the record and its audit entry land
atomically:

```ts
await prisma.$transaction(async (tx) => {
  const worker = await tx.worker.create({ data: { ... } });
  await logEvent({ businessId, actorUserId: userId, entityType: "worker",
                   entityId: worker.id, action: "created", after: {...} }, tx);
});
```

`logEvent()` captures IP and user-agent from the request when there is one and
degrades silently to a system event in the worker. Pass `actorUserId: null`
for system actors (jobs, webhooks).

### 3. Evidence files never become public

Private bucket only. All reads go through `presignedDownloadUrl()` in
`src/lib/storage.ts`, which hard-caps TTL at 24 hours regardless of what the
caller asks for. Keys are namespaced by business (`evidence/{businessId}/…`)
so a leaked key cannot cross tenants. Every uploaded file gets a SHA-256
recorded alongside it.

### 4. Personal data stays out of the repo and out of dev

`prisma/seed.ts` is synthetic data only. Never copy production rows into a
seed, a fixture, a test, a log line or a commit message. Worker names, dates
of birth and share codes are the sensitive fields.

### 5. Prisma client is generated, not committed

`prisma/schema.prisma` generates into `src/generated/prisma`, which is
**gitignored**. Import types from there via the alias:

```ts
import { PrismaClient } from "@/generated/prisma/client";
import type { Plan, AlertType } from "@/generated/prisma/enums";
```

After changing the schema, run `npx prisma generate`. A fresh clone has no
client until `npm run build` or `prisma generate` runs — a "module not found:
@/generated/prisma" error means exactly that, not a broken import.

### 6. Server-only modules say so

Modules that must never reach the browser start with `import "server-only";`
(`tenant.ts`, `events.ts`, `storage.ts`, `billing.ts`). Keep that line when
editing them, and add it to new server-only modules.

### 7. Validate at the boundary with Zod

Every server action parses its `FormData` through a Zod schema before touching
the database. Use `safeParse` and throw a message the UI can show:

```ts
const parsed = schema.safeParse(Object.fromEntries(formData));
if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "…");
```

### 8. Dates are date-only and UTC

Worker dates (`startDate`, `endDate`, `permissionExpiry`, `followUpDate`,
`dateOfBirth`) are `@db.Date`. All comparison and offset maths goes through
`src/lib/expiry.ts` (`todayUtc()`, `daysUntil()`), which is pure and shared by
the dashboard and the nightly job. Do not hand-roll date arithmetic — an
off-by-one here is a missed statutory deadline.

`workerRag()` is the single definition of red/amber/green. Change it in one
place if the rules change.

### 9. Schema naming

Prisma models are `PascalCase` with `camelCase` fields; every table and column
is `@map`ped to `snake_case`. Follow that for new fields — the SQL side is
consistently snake_case and migrations are reviewed as SQL.

### 10. Graceful degradation without third-party keys

The app runs locally with no external credentials at all:

| Missing var | Behaviour |
|---|---|
| `RESEND_API_KEY` | alert emails logged, not sent |
| `COMPANIES_HOUSE_API_KEY` | lookup route returns 501, onboarding stays manual |
| `STRIPE_SECRET_KEY` | billing page shows "not configured"; webhook returns 501 |
| `GOOGLE_CLIENT_ID`/`SECRET` | Google sign-in provider omitted |

Keep this property when adding an integration: construct clients lazily inside
a function, never at module top level, so `next build` succeeds without
secrets.

## Database and migrations

`prisma/schema.prisma` is the source of truth. Configuration lives in
`prisma.config.ts` (Prisma 7 style — the datasource URL is read there, not
from a `url =` line in the schema).

To change the schema:

1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate` (i.e. `prisma migrate dev`) against a local Postgres.
3. Review the generated SQL — it is the artifact that runs in production.
4. Commit schema + migration together. Migrations are immutable once pushed.

`prisma migrate dev` is interactive and refuses to run in a non-interactive
shell. When a schema change adds a unique constraint (or anything else that
prompts), generate the SQL non-interactively instead:

```bash
npx prisma migrate diff --from-config-datasource \
  --to-schema prisma/schema.prisma --script \
  > prisma/migrations/<timestamp>_<name>/migration.sql
npx prisma migrate deploy
```

Production applies migrations on boot: `railway.json` starts the web service
with `npx prisma migrate deploy && npm run start`.

Two behaviours are enforced in SQL rather than application code, and must
survive any migration: the `event_log` no-update/no-delete triggers, and the
`businesses.stripe_customer_id` / `stripe_subscription_id` unique indexes.

## The worker service

`worker/index.ts` starts pg-boss against the same database in the `pgboss`
schema, creates its queues, registers the nightly schedule, and binds
handlers.

- **`expiry-scan`** — nightly 06:00 `Europe/London`. Flags overdue workers
  (`passed` → `expired` / `follow_up_due`), then creates `Alert` rows for each
  (worker, offset) hit against the business's `alertSchedule` and enqueues a
  `send-alert` job for each.
- **`send-alert`** — sends one email per alert to the business owners and
  stamps `sentAt`.

**Both jobs must stay idempotent.** They are retried and can be run manually.
`expiry-scan` dedupes on "one alert of this type per worker per day";
`send-alert` returns early when `sentAt` is set. Preserve those guards when
editing.

Adding a job: create `worker/jobs/<name>.ts`, register the queue in the
`createQueue` loop, and bind it with `boss.work`. Shared logic belongs in
`src/lib/`.

## Billing (Stripe)

Subscriptions with Stripe Checkout and the hosted Billing Portal. One Stripe
customer and one subscription per `Business`.

**The `Business` row is a read-model of Stripe, never the source of truth.**
The only writer of `plan`, `status`, `stripeSubscriptionId`, `stripePriceId`,
`currentPeriodEnd` and `cancelAtPeriodEnd` is
`src/app/api/stripe/webhook/route.ts`, via `syncSubscription()` in
`src/lib/billing.ts`. Checkout and portal actions redirect the user to Stripe
and write nothing about the subscription — that way a plan change made on
another device, or a cancellation made directly in the portal, converges on
the same code path.

If you add a billing feature, extend `syncSubscription()`; do not write plan
or status from a server action.

Webhook rules:

- **Verify the signature over the raw body.** `await req.text()` first, then
  `constructEventAsync()`. Parsing JSON before verifying breaks the signature.
- **Idempotency.** Every event ID is inserted into `stripe_events` first;
  duplicates return early. Delivery is at-least-once and can be out of order.
- The handler deletes its `stripe_events` marker and returns 500 if processing
  throws, so Stripe's retry gets a real attempt.
- An unrecognised Stripe Price maps to no plan and **keeps the existing plan**
  rather than silently downgrading the tenant.
- `runtime = "nodejs"` — signature verification needs Node crypto.

API-version notes for the pinned SDK (Stripe `22.x`, API `2026-07-29.dahlia`):
`current_period_end` lives on **subscription items**, not the subscription,
and an invoice's subscription is at `invoice.parent.subscription_details`, not
`invoice.subscription`. Both moved in recent API versions; older examples on
the web are wrong for this SDK.

Plans map Stripe Price IDs (from env) onto the `Plan` enum in the `PLANS`
table in `src/lib/billing.ts`. That table also carries the entitlement caps
enforced in `src/app/workers/new/actions.ts`. **The worker/site caps there are
placeholders** — replace them with the real pricing table from the PRD.

Local testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe trigger customer.subscription.updated
```

## Environment variables

See `.env.example` for the full annotated list. Required in production:
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. `BETTER_AUTH_URL` is
the canonical public origin and is reused for Stripe redirect URLs — never
build a redirect from a `Host` header.

The worker service needs `DATABASE_URL` and `RESEND_API_KEY`.

`.env*` is gitignored. Never commit real secrets, and never paste one into a
comment, log line or commit message.

## Deployment

Railway, one project, three components, all EU region:

1. **Postgres plugin** — injects `DATABASE_URL`.
2. **web service** — uses `railway.json`; migrates then starts.
3. **worker service** — same repo, config file pointed at
   `railway.worker.json`; starts `npm run worker`.

Add the Stripe webhook endpoint at `https://<domain>/api/stripe/webhook` and
put its signing secret in `STRIPE_WEBHOOK_SECRET` on the **web** service.

## Style

Match the surrounding code rather than importing outside conventions.

- Double quotes, semicolons, 2-space indent, trailing commas.
- Tailwind utility classes inline; no CSS modules. Dark mode via `dark:`
  variants on every surface — check both.
- Comments explain *why*, and cite the requirement they implement (existing
  code cites PRD sections). Do not add narrating comments.
- Server Components by default. `"use client"` only where interactivity
  demands it — currently the auth forms and the onboarding autofill.
- Errors thrown from server actions surface to the user, so make the message
  something a small-business owner can act on.

## Known state and gotchas

- **No tests.** Cross-tenant access tests are a launch gate in the PRD and do
  not exist yet. This is the biggest gap in the repo.
- `npm audit` reports a `sharp` advisory transitively via Next 15.5; the fix
  is the Next 16 major, deferred to the Phase 2 dependency pass.
- `Membership.siteIds` is `[]` (meaning "all sites") for every owner; the
  manager role and per-site scoping arrive in a later phase. `requireBusiness`
  returns `siteIds` but nothing filters on it yet.
- `src/app/workers/new/actions.ts` attaches every worker to the business's
  oldest site — there is no site picker yet.
- `.copilot/mcpServers.json` and `scripts/mcp_verify.sh` configure a Railway
  MCP server for local tooling; see `docs/MCP.md`. Unrelated to the app.
- Phase 1 work still outstanding: CSV worker import, manual/share-code check
  recording with evidence upload, the Fail/Refer guided next-steps page, email
  verification, cross-tenant tests, Sentry + status page.
