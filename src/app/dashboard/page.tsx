import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireBusiness } from "@/lib/tenant";
import { daysUntil, workerRag } from "@/lib/expiry";

const RAG_STYLES: Record<string, string> = {
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

export default async function DashboardPage() {
  const { businessId } = await requireBusiness();

  const [business, workers] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    prisma.worker.findMany({
      where: { businessId, status: "active" },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const checked = workers.filter((w) =>
    ["passed", "follow_up_due", "expired"].includes(w.rtwStatus),
  ).length;
  const outstanding = workers.filter((w) =>
    ["not_checked", "in_progress", "failed", "refer"].includes(w.rtwStatus),
  ).length;

  const expiringWithin = (days: number) =>
    workers.filter((w) => {
      const dates = [w.permissionExpiry, w.followUpDate].filter(
        (d): d is Date => d !== null,
      );
      return dates.some((d) => {
        const n = daysUntil(d);
        return n >= 0 && n <= days;
      });
    }).length;

  const stats = [
    { label: "Workers", value: workers.length },
    { label: "Checked", value: checked },
    { label: "Outstanding", value: outstanding },
    { label: "Expiring ≤90d", value: expiringWithin(90) },
    { label: "Expiring ≤30d", value: expiringWithin(30) },
    { label: "Expiring ≤7d", value: expiringWithin(7) },
  ];

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{business.name}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Compliance dashboard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/billing"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            Billing
          </Link>
          <Link
            href="/workers/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add worker
          </Link>
        </div>
      </div>

      {business.status !== "active" && (
        <p className="mb-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          {business.status === "past_due"
            ? "We could not take your last payment."
            : "Your subscription is cancelled."}{" "}
          <Link href="/billing" className="font-medium underline">
            Go to billing
          </Link>{" "}
          to keep expiry alerts running.
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
          >
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Workers</h2>
      {workers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700">
          No workers yet.{" "}
          <Link href="/workers/new" className="text-blue-600 hover:underline">
            Add your first worker
          </Link>{" "}
          to get started.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {workers.map((w) => {
            const rag = workerRag(w);
            return (
              <li key={w.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{w.fullName}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {w.roleTitle} · {w.arrangementType.replaceAll("_", " ")} ·{" "}
                    {w.rtwStatus.replaceAll("_", " ")}
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${RAG_STYLES[rag]}`}
                >
                  {rag.toUpperCase()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
