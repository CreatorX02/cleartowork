"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { requireBusiness } from "@/lib/tenant";
import { baseUrl, priceIdForPlan, stripe } from "@/lib/billing";

/**
 * Checkout and Billing Portal entry points. Both derive the business from the
 * session (never the form) and are owner-only — managers can read the billing
 * page but cannot move money.
 *
 * Neither action writes plan/status: the resulting webhook does. That keeps a
 * single source of truth even when the owner subscribes from another device or
 * cancels straight from the portal.
 */

const planSchema = z.object({
  plan: z.enum(["solo", "standard", "multi_site"]),
});

async function requireOwner() {
  const ctx = await requireBusiness();
  if (ctx.role !== "owner") {
    throw new Error("Only the business owner can manage billing");
  }
  return ctx;
}

/**
 * Returns the business's Stripe customer, creating it on first use. The
 * customer ID is persisted so the portal and webhooks can find their way back
 * to the tenant.
 */
async function ensureCustomer(businessId: string, email: string) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { stripeCustomerId: true, name: true },
  });
  if (business.stripeCustomerId) return business.stripeCustomerId;

  const customer = await stripe().customers.create({
    email,
    name: business.name,
    metadata: { businessId },
  });
  await prisma.business.update({
    where: { id: businessId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export async function startCheckout(formData: FormData) {
  const { businessId, userId } = await requireOwner();

  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Unknown plan");

  const priceId = priceIdForPlan(parsed.data.plan);
  if (!priceId) {
    throw new Error(`No Stripe price configured for the ${parsed.data.plan} plan`);
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });
  const customerId = await ensureCustomer(businessId, user.email);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: businessId,
    // Metadata on the subscription is how the webhook resolves the tenant.
    subscription_data: { metadata: { businessId } },
    metadata: { businessId },
    allow_promotion_codes: true,
    success_url: `${baseUrl()}/billing?checkout=success`,
    cancel_url: `${baseUrl()}/billing?checkout=cancelled`,
  });

  await logEvent({
    businessId,
    actorUserId: userId,
    entityType: "business",
    entityId: businessId,
    action: "updated",
    after: { checkoutStarted: parsed.data.plan },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  redirect(session.url);
}

/** Sends the owner to Stripe's hosted portal to change plan, card or cancel. */
export async function openBillingPortal() {
  const { businessId } = await requireOwner();

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { stripeCustomerId: true },
  });
  if (!business.stripeCustomerId) {
    throw new Error("No billing account yet — choose a plan first");
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: business.stripeCustomerId,
    return_url: `${baseUrl()}/billing`,
  });
  redirect(session.url);
}
