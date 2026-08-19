import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireBusiness } from "@/lib/tenant";
import { PLANS, isBillingConfigured, planLimits } from "@/lib/billing";
import { openBillingPortal, startCheckout } from "./actions";

const STATUS_COPY: Record<string, { label: string; cls: string; note: string }> = {
  active: {
    label: "Active",
    cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    note: "Your subscription is up to date.",
  },
  past_due: {
    label: "Payment due",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    note: "We could not take the last payment. Update your card to keep alerts running.",
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    note: "Your register stays readable, but checks and alerts are paused.",
  },
};

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatLimit(n: number) {
  return Number.isFinite(n) ? String(n) : "Unlimited";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { businessId, role } = await requireBusiness();
  const { checkout } = await searchParams;

  const [business, workerCount] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    prisma.worker.count({ where: { businessId, status: "active" } }),
  ]);

  const limits = planLimits(business.plan);
  const status = STATUS_COPY[business.status];
  const configured = isBillingConfigured();
  const isOwner = role === "owner";

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Billing</h1>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        {business.name}
      </p>

      {checkout === "success" && (
        <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
          Payment received. Your plan updates here as soon as Stripe confirms it
          — usually within a few seconds.
        </p>
      )}
      {checkout === "cancelled" && (
        <p className="mb-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Checkout cancelled — nothing was charged.
        </p>
      )}
      {!configured && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Billing is not configured on this environment. Set{" "}
          <code>STRIPE_SECRET_KEY</code> and the plan price IDs to enable it.
        </p>
      )}

      <section className="mb-8 rounded-xl border border-gray-200 p-5 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Current plan
            </div>
            <div className="text-xl font-semibold">{limits.name}</div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.cls}`}>
            {status.label}
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{status.note}</p>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-gray-500">Workers</dt>
            <dd className="font-medium">
              {workerCount} / {formatLimit(limits.maxWorkers)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Sites</dt>
            <dd className="font-medium">{formatLimit(limits.maxSites)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">
              {business.cancelAtPeriodEnd ? "Ends" : "Renews"}
            </dt>
            <dd className="font-medium">
              {business.currentPeriodEnd
                ? formatDate(business.currentPeriodEnd)
                : "—"}
            </dd>
          </div>
        </dl>

        {business.stripeCustomerId && isOwner && configured && (
          <form action={openBillingPortal} className="mt-5">
            <button
              type="submit"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              Manage billing
            </button>
          </form>
        )}
      </section>

      <h2 className="mb-3 text-lg font-semibold">Plans</h2>
      {!isOwner && (
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
          Only the business owner can change the plan.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((p) => {
          const current = p.plan === business.plan && business.status !== "cancelled";
          return (
            <div
              key={p.plan}
              className={`flex flex-col rounded-xl border p-5 ${
                current
                  ? "border-blue-600 ring-1 ring-blue-600"
                  : "border-gray-200 dark:border-gray-800"
              }`}
            >
              <div className="font-semibold">{p.name}</div>
              <p className="mt-1 flex-1 text-sm text-gray-600 dark:text-gray-400">
                {p.blurb}
              </p>
              <p className="mt-3 text-xs text-gray-500">
                Up to {formatLimit(p.maxWorkers)} workers ·{" "}
                {formatLimit(p.maxSites)} site
                {p.maxSites === 1 ? "" : "s"}
              </p>
              {current ? (
                <p className="mt-4 text-sm font-medium text-blue-600">
                  Current plan
                </p>
              ) : (
                <form action={startCheckout} className="mt-4">
                  <input type="hidden" name="plan" value={p.plan} />
                  <button
                    type="submit"
                    disabled={!isOwner || !configured || !p.priceId}
                    className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {p.priceId ? "Choose plan" : "Not configured"}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
