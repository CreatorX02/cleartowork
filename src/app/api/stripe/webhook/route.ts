import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, syncSubscription } from "@/lib/billing";

/**
 * Stripe webhook — the only writer of billing state on Business.
 *
 * Unauthenticated by design: trust comes from the Stripe-Signature header,
 * verified against STRIPE_WEBHOOK_SECRET over the *raw* body. Never parse the
 * request as JSON before constructEvent(), or the signature will not match.
 *
 * Delivery is at-least-once and can be out of order, so every event ID is
 * recorded in stripe_events and replays are dropped.
 */

// Signature verification needs the Node crypto runtime, not Edge.
export const runtime = "nodejs";

const HANDLED = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
]);

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: { code: "not_configured", message: "Billing not configured" } },
      { status: 501 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: { code: "missing_signature", message: "Missing Stripe-Signature" } },
      { status: 400 },
    );
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(raw, signature, secret);
  } catch (err) {
    // Bad signature — could be a spoofed request. Log without the body.
    console.warn("[stripe] signature verification failed:", (err as Error).message);
    return NextResponse.json(
      { error: { code: "invalid_signature", message: "Invalid signature" } },
      { status: 400 },
    );
  }

  // Idempotency gate: first writer wins, everyone else is a replay.
  const { count } = await prisma.stripeEvent.createMany({
    data: [{ id: event.id, type: event.type }],
    skipDuplicates: true,
  });
  if (count === 0) return NextResponse.json({ received: true, replay: true });

  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true });

  try {
    await handle(event);
  } catch (err) {
    // Roll the marker back so Stripe's retry gets a real attempt.
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    console.error(`[stripe] failed to handle ${event.type} (${event.id}):`, err);
    return NextResponse.json(
      { error: { code: "handler_failed", message: "Handler failed" } },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.subscription) return;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
      // Re-fetch rather than trusting the (possibly expanded) session payload,
      // so we always sync the subscription's current state.
      const sub = await stripe().subscriptions.retrieve(subscriptionId);
      await syncSubscription(sub);
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscription(event.data.object);
      return;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      // Dunning transitions are already reflected on the subscription; re-read
      // it so `past_due` / `active` land through the one sync path.
      const invoice = event.data.object;
      const subscriptionId = subscriptionIdOf(invoice);
      if (!subscriptionId) return;
      const sub = await stripe().subscriptions.retrieve(subscriptionId);
      await syncSubscription(sub);
      return;
    }
  }
}

/**
 * Current API versions dropped the top-level `invoice.subscription`; the
 * subscription now hangs off `invoice.parent`.
 */
function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const ref = invoice.parent?.subscription_details?.subscription;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}
