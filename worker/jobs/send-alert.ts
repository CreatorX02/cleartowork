import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { daysUntil } from "@/lib/expiry";

const LABELS: Record<string, string> = {
  expiry_90: "90 days",
  expiry_30: "30 days",
  expiry_14: "14 days",
  expiry_7: "7 days",
  expiry_today: "TODAY",
};

/** Sends one alert email to the business owner(s) and stamps sentAt. */
export async function sendAlert(alertId: string) {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { worker: true, business: true },
  });
  if (!alert || alert.sentAt) return; // already sent or gone — idempotent
  if (alert.snoozedUntil && alert.snoozedUntil > new Date()) return;

  const owners = await prisma.membership.findMany({
    where: { businessId: alert.businessId, role: "owner" },
    include: { user: true },
  });
  if (owners.length === 0) return;

  const worker = alert.worker;
  const when = LABELS[alert.alertType] ?? alert.alertType;
  const dueDate = worker?.followUpDate ?? worker?.permissionExpiry;
  const subject = worker
    ? `Right to work action needed in ${when}: ${worker.fullName}`
    : `ClearToWork compliance alert`;

  const html = `
    <p>Hello,</p>
    <p><strong>${worker?.fullName ?? "A worker"}</strong> at
    <strong>${alert.business.name}</strong> has a right to work
    ${worker?.followUpDate ? "follow-up check" : "permission expiry"} due
    ${dueDate ? `on <strong>${dueDate.toISOString().slice(0, 10)}</strong> (${when === "TODAY" ? "today" : `in ${dueDate ? daysUntil(dueDate) : "?"} days`})` : "soon"}.</p>
    <p>Open your dashboard to run or record the check before the date passes.</p>
    <p>— ClearToWork</p>`;

  for (const owner of owners) {
    await sendEmail({ to: owner.user.email, subject, html });
  }

  await prisma.alert.update({
    where: { id: alert.id },
    data: { sentAt: new Date() },
  });
  console.log(`[send-alert] sent ${alert.alertType} for alert ${alert.id}`);
}
