import "server-only";
import Stripe from "stripe";
import type { BusinessStatus, Plan } from "@/generated/prisma/enums";
import { prisma } from "./db";
import { logEvent } from "./events";

/**
 * Stripe subscription billing. One Stripe customer + one subscription per
 * Business; the Business row is a read-model of Stripe, never the source of
 * truth. Everything that mutates plan/status flows through the webhook
 * (src/app/api/stripe/webhook/route.ts) so Checkout, the Billing Portal and
 * dunning all converge on the same code path.
 */

let client: Stripe | null = null;

/** Lazy so `npm run build` works without Stripe keys in the environment. */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) client = new Stripe(key);
  return client;
}

/** Billing UI degrades to "not configured" instead of throwing when unset. */
export function isBillingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export type PlanDefinition = {
  plan: Plan;
  name: string;
  blurb: string;
  /** Stripe Price ID, from env so test/live keys stay out of the repo. */
  priceId: string | undefined;
  /** Entitlements — see planLimits(). */
  maxWorkers: number;
  maxSites: number;
};

/**
 * Plan catalog. Prices live in Stripe; this table only maps a Price ID onto
 * the `Plan` enum and the entitlements we enforce in-app.
 *
 * NOTE: the worker/site caps below are placeholders — replace them with the
 * pricing table in the PRD (files/07_MVP_PHASED_PRD.md) once it is settled.
 * `Infinity` means uncapped.
 */
export const PLANS: PlanDefinition[] = [
  {
    plan: "solo",
    name: "Solo",
    blurb: "One site, for owner-operators running a single venue.",
    priceId: process.env.STRIPE_PRICE_SOLO,
    maxWorkers: 10,
    maxSites: 1,
  },
  {
    plan: "standard",
    name: "Standard",
    blurb: "One site with a full team and unlimited right to work checks.",
    priceId: process.env.STRIPE_PRICE_STANDARD,
    maxWorkers: 50,
    maxSites: 1,
  },
  {
    plan: "multi_site",
    name: "Multi-site",
    blurb: "Every site under one compliance register, with no caps.",
    priceId: process.env.STRIPE_PRICE_MULTI_SITE,
    maxWorkers: Infinity,
    maxSites: Infinity,
  },
];

export function planLimits(plan: Plan): PlanDefinition {
  const found = PLANS.find((p) => p.plan === plan);
  if (!found) throw new Error(`Unknown plan: ${plan}`);
  return found;
}

/** Reverse lookup used by the webhook to turn a Stripe Price into a Plan. */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  return PLANS.find((p) => p.priceId && p.priceId === priceId)?.plan ?? null;
}

export function priceIdForPlan(plan: Plan): string | null {
  return planLimits(plan).priceId ?? null;
}

/**
 * Absolute URL for Checkout/Portal redirects. BETTER_AUTH_URL is already the
 * canonical public origin (Railway domain in production), so reuse it rather
 * than trusting a Host header.
 */
export function baseUrl(): string {
  const url = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("BETTER_AUTH_URL is not set");
  return url.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Stripe -> Business sync
// ---------------------------------------------------------------------------

/**
 * Maps a Stripe subscription status onto our BusinessStatus. `past_due` keeps
 * the account readable but flags it in the UI; `cancelled` is terminal until
 * the owner subscribes again.
 */
export function businessStatusFor(status: Stripe.Subscription.Status): BusinessStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return "past_due";
  }
}

/**
 * As of API version 2026-07-29 the billing period lives on the subscription
 * *item*, not the subscription. Take the latest period end across items.
 */
export function currentPeriodEnd(sub: Stripe.Subscription): Date | null {
  const ends = sub.items.data
    .map((item) => item.current_period_end)
    .filter((n): n is number => typeof n === "number");
  if (ends.length === 0) return null;
  return new Date(Math.max(...ends) * 1000);
}

/**
 * Applies a Stripe subscription to its Business row and writes an event_log
 * entry when anything actually changed. Idempotent — replaying the same
 * webhook is a no-op.
 */
export async function syncSubscription(sub: Stripe.Subscription) {
  const businessId = await resolveBusinessId(sub);
  if (!businessId) {
    console.warn(`[stripe] subscription ${sub.id} has no matching business`);
    return;
  }

  const before = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      plan: true,
      status: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      cancelAtPeriodEnd: true,
    },
  });
  if (!before) {
    console.warn(`[stripe] business ${businessId} no longer exists`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = planForPriceId(priceId);
  const status = businessStatusFor(sub.status);

  const after = {
    // An unrecognised price must not silently downgrade the tenant; keep the
    // plan we already had and let the price mismatch show up in the logs.
    plan: plan ?? before.plan,
    status,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
  if (priceId && !plan) {
    console.warn(`[stripe] price ${priceId} maps to no plan; keeping ${before.plan}`);
  }

  const unchanged =
    before.plan === after.plan &&
    before.status === after.status &&
    before.stripeSubscriptionId === after.stripeSubscriptionId &&
    before.stripePriceId === after.stripePriceId &&
    before.cancelAtPeriodEnd === after.cancelAtPeriodEnd;

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id: businessId },
      data: {
        ...after,
        stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        currentPeriodEnd: currentPeriodEnd(sub),
      },
    });
    if (unchanged) return;
    await logEvent(
      {
        businessId,
        actorUserId: null, // Stripe webhook — system actor
        entityType: "business",
        entityId: businessId,
        action: "status_changed",
        before,
        after,
      },
      tx,
    );
  });
}

/**
 * Finds the Business behind a subscription. Metadata is set at Checkout time
 * and is the reliable path; the customer lookup covers subscriptions created
 * from the Stripe dashboard.
 */
async function resolveBusinessId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.businessId;
  if (fromMetadata) return fromMetadata;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const business = await prisma.business.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return business?.id ?? null;
}
