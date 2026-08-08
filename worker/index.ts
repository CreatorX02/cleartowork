import "dotenv/config";
import { PgBoss } from "pg-boss";
import { expiryScan } from "./jobs/expiry-scan";
import { sendAlert } from "./jobs/send-alert";

/**
 * ClearToWork worker service (Railway service #2).
 * pg-boss uses the same Postgres as the app — no extra queue infra.
 * Schedules live here (pg-boss cron), so no separate Railway cron service
 * is needed for Phase 1.
 */
async function main() {
  const boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: "pgboss",
  });
  boss.on("error", (err: Error) => console.error("[pg-boss]", err));
  await boss.start();

  for (const queue of ["expiry-scan", "send-alert"]) {
    await boss.createQueue(queue);
  }

  // Nightly 06:00 UK (01_PRD.md C2 / 04_API_SPEC.md §5)
  await boss.schedule("expiry-scan", "0 6 * * *", undefined, {
    tz: "Europe/London",
  });

  await boss.work("expiry-scan", async () => {
    await expiryScan(boss);
  });

  await boss.work<{ alertId: string }>("send-alert", async ([job]) => {
    await sendAlert(job.data.alertId);
  });

  console.log("[worker] started; queues: expiry-scan, send-alert");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
