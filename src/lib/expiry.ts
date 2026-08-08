import type { AlertType } from "@/generated/prisma/enums";

/**
 * Shared expiry maths used by the dashboard and the nightly expiry_scan job.
 * All comparisons are date-only in UTC (worker dates are @db.Date).
 */

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function daysUntil(date: Date, from: Date = todayUtc()): number {
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((target - from.getTime()) / 86_400_000);
}

/** Maps an alert-schedule offset (days before expiry) to its alert type. */
export function alertTypeForOffset(offset: number): AlertType | null {
  switch (offset) {
    case 90: return "expiry_90";
    case 30: return "expiry_30";
    case 14: return "expiry_14";
    case 7: return "expiry_7";
    case 0: return "expiry_today";
    default: return null;
  }
}

export type RagStatus = "red" | "amber" | "green";

/**
 * Red/amber/green per worker (01_PRD.md C1). Deterministic:
 *  red    — failed/refer/expired, past-due follow-up or expiry, or never checked
 *  amber  — expiry or follow-up within 30 days, or check in progress
 *  green  — checked and nothing due within 30 days
 */
export function workerRag(worker: {
  rtwStatus: string;
  permissionExpiry: Date | null;
  followUpDate: Date | null;
}): RagStatus {
  const { rtwStatus, permissionExpiry, followUpDate } = worker;
  if (["failed", "refer", "expired", "not_checked"].includes(rtwStatus)) return "red";
  const soonest = [permissionExpiry, followUpDate]
    .filter((d): d is Date => d !== null)
    .map((d) => daysUntil(d))
    .sort((a, b) => a - b)[0];
  if (soonest !== undefined && soonest < 0) return "red";
  if (soonest !== undefined && soonest <= 30) return "amber";
  if (rtwStatus === "in_progress") return "amber";
  return "green";
}
