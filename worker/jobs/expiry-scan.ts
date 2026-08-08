import type { PgBoss } from "pg-boss";
import { prisma } from "@/lib/db";
import { alertTypeForOffset, daysUntil, todayUtc } from "@/lib/expiry";

/**
 * Nightly scan (06:00 UK). Idempotent: safe to rerun — an alert of the same
 * type already created today for a worker is never duplicated.
 *
 * 1. Flags overdue workers (rtw_status → expired / follow_up_due)
 * 2. Creates Alert rows for every (worker, offset) hit in the business's
 *    alert schedule and enqueues a send-alert job per row
 */
export async function expiryScan(boss: PgBoss) {
  const today = todayUtc();

  // 1. Status flags for past-due dates
  await prisma.worker.updateMany({
    where: { status: "active", rtwStatus: "passed", permissionExpiry: { lt: today } },
    data: { rtwStatus: "expired" },
  });
  await prisma.worker.updateMany({
    where: { status: "active", rtwStatus: "passed", followUpDate: { lt: today } },
    data: { rtwStatus: "follow_up_due" },
  });

  // 2. Alert creation
  const businesses = await prisma.business.findMany({
    where: { status: "active" },
    select: { id: true, alertSchedule: true },
  });

  let created = 0;
  for (const business of businesses) {
    const offsets = Array.isArray(business.alertSchedule)
      ? (business.alertSchedule as number[])
      : [90, 30, 14, 7, 0];

    const workers = await prisma.worker.findMany({
      where: {
        businessId: business.id,
        status: "active",
        OR: [{ permissionExpiry: { not: null } }, { followUpDate: { not: null } }],
      },
      select: { id: true, permissionExpiry: true, followUpDate: true },
    });

    for (const worker of workers) {
      const dates = [worker.permissionExpiry, worker.followUpDate].filter(
        (d): d is Date => d !== null,
      );
      for (const date of dates) {
        const days = daysUntil(date, today);
        if (!offsets.includes(days)) continue;
        const alertType = alertTypeForOffset(days);
        if (!alertType) continue;

        // Idempotency: one alert of this type per worker per day
        const existing = await prisma.alert.findFirst({
          where: {
            workerId: worker.id,
            alertType,
            createdAt: { gte: today },
          },
        });
        if (existing) continue;

        const alert = await prisma.alert.create({
          data: {
            businessId: business.id,
            workerId: worker.id,
            alertType,
            channel: "email",
          },
        });
        await boss.send("send-alert", { alertId: alert.id });
        created++;
      }
    }
  }
  console.log(`[expiry-scan] created ${created} alerts`);
}
