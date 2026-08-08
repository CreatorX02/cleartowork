"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { requireUser } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(1).max(200),
  companyNumber: z.string().max(20).optional().or(z.literal("")),
  sector: z.enum(["hospitality", "food_service", "care", "other"]),
  siteName: z.string().min(1).max(200),
  siteAddress: z.string().max(500).optional().or(z.literal("")),
});

export async function createBusiness(formData: FormData) {
  const user = await requireUser();

  const existing = await prisma.membership.findFirst({
    where: { userId: user.id },
  });
  if (existing) redirect("/dashboard");

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid business details");
  }
  const input = parsed.data;

  const business = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: input.name,
        companyNumber: input.companyNumber || null,
        sector: input.sector,
      },
    });
    await tx.site.create({
      data: {
        businessId: business.id,
        name: input.siteName,
        address: input.siteAddress || null,
      },
    });
    await tx.membership.create({
      data: { userId: user.id, businessId: business.id, role: "owner", siteIds: [] },
    });
    await logEvent(
      {
        businessId: business.id,
        actorUserId: user.id,
        entityType: "business",
        entityId: business.id,
        action: "created",
        after: { name: business.name, sector: business.sector },
      },
      tx,
    );
    return business;
  });

  redirect(`/dashboard?welcome=${business.id}`);
}
