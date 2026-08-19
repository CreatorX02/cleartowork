"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { requireBusiness } from "@/lib/tenant";
import { planLimits } from "@/lib/billing";

const schema = z
  .object({
    fullName: z.string().min(1).max(200),
    dateOfBirth: z.coerce.date(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(30).optional().or(z.literal("")),
    roleTitle: z.string().min(1).max(200),
    arrangementType: z.enum([
      "employee",
      "agency",
      "gig",
      "casual_zero_hours",
      "subcontractor",
      "other",
    ]),
    startDate: z.coerce.date(),
  })
  .refine((d) => d.email || d.phone, {
    message: "At least one of email or phone is required for check links",
  });

export async function addWorker(formData: FormData) {
  const { businessId, userId } = await requireBusiness();

  // Plan entitlement. Checked here rather than in the UI so it also covers the
  // CSV import path once that lands.
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { plan: true },
  });
  const { maxWorkers, name: planName } = planLimits(business.plan);
  const activeWorkers = await prisma.worker.count({
    where: { businessId, status: "active" },
  });
  if (activeWorkers >= maxWorkers) {
    throw new Error(
      `The ${planName} plan covers ${maxWorkers} workers. Upgrade in Billing to add more.`,
    );
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid worker details");
  }
  const input = parsed.data;

  // Duplicate detection: name + date of birth (01_PRD.md A2)
  const duplicate = await prisma.worker.findFirst({
    where: {
      businessId,
      fullName: { equals: input.fullName, mode: "insensitive" },
      dateOfBirth: input.dateOfBirth,
      status: { not: "deleted_pending" },
    },
  });
  if (duplicate) {
    throw new Error("A worker with this name and date of birth already exists");
  }

  const site = await prisma.site.findFirstOrThrow({
    where: { businessId },
    orderBy: { createdAt: "asc" },
  });

  await prisma.$transaction(async (tx) => {
    const worker = await tx.worker.create({
      data: {
        businessId,
        siteId: site.id,
        fullName: input.fullName,
        dateOfBirth: input.dateOfBirth,
        email: input.email || null,
        phone: input.phone || null,
        roleTitle: input.roleTitle,
        arrangementType: input.arrangementType,
        startDate: input.startDate,
      },
    });
    await logEvent(
      {
        businessId,
        actorUserId: userId,
        entityType: "worker",
        entityId: worker.id,
        action: "created",
        after: {
          fullName: worker.fullName,
          arrangementType: worker.arrangementType,
          startDate: worker.startDate,
        },
      },
      tx,
    );
  });

  redirect("/dashboard");
}
