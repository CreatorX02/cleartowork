import "server-only";
import { headers } from "next/headers";
import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";

type EventInput = {
  businessId?: string | null;
  actorUserId?: string | null;
  entityType: "worker" | "check" | "classification" | "business" | "site" | "membership" | "alert";
  entityId: string;
  action: "created" | "updated" | "status_changed" | "exported" | "deleted" | "ended";
  before?: unknown;
  after?: unknown;
};

/**
 * Append-only audit trail (02_TECHNICAL_ARCHITECTURE.md §4.6). The table has
 * DB triggers blocking UPDATE/DELETE. Accepts an optional transaction client
 * so state change + event land atomically.
 */
export async function logEvent(
  input: EventInput,
  tx: Prisma.TransactionClient = prisma,
) {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = h.get("user-agent");
  } catch {
    // No request context (worker/job) — system event.
  }

  await tx.eventLog.create({
    data: {
      businessId: input.businessId ?? null,
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: input.before === undefined ? undefined : (input.before as Prisma.InputJsonValue),
      after: input.after === undefined ? undefined : (input.after as Prisma.InputJsonValue),
      ip,
      userAgent,
    },
  });
}
