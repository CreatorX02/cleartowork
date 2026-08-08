import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Synthetic demo data ONLY (02_TECHNICAL_ARCHITECTURE.md §8: real personal
 * data never leaves production). Seeds a demo business with workers whose
 * expiry dates exercise every alert offset and RAG state.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function main() {
  const business = await prisma.business.create({
    data: {
      name: "Demo Tandoori House",
      sector: "hospitality",
      sites: { create: { name: "Main restaurant", address: "1 Demo Street, Edinburgh" } },
    },
    include: { sites: true },
  });
  const siteId = business.sites[0].id;

  const workers = [
    { fullName: "Asha Demo", roleTitle: "Chef", arrangementType: "employee", rtwStatus: "passed", permissionExpiry: daysFromNow(90) },
    { fullName: "Bilal Demo", roleTitle: "Waiter", arrangementType: "casual_zero_hours", rtwStatus: "passed", permissionExpiry: daysFromNow(30) },
    { fullName: "Chidi Demo", roleTitle: "Kitchen porter", arrangementType: "agency", rtwStatus: "passed", followUpDate: daysFromNow(7) },
    { fullName: "Dana Demo", roleTitle: "Front of house", arrangementType: "employee", rtwStatus: "passed", permissionExpiry: daysFromNow(0) },
    { fullName: "Emeka Demo", roleTitle: "Delivery rider", arrangementType: "gig", rtwStatus: "not_checked" },
    { fullName: "Fatima Demo", roleTitle: "Cleaner", arrangementType: "subcontractor", rtwStatus: "passed", permissionExpiry: daysFromNow(200) },
  ] as const;

  for (const w of workers) {
    await prisma.worker.create({
      data: {
        businessId: business.id,
        siteId,
        fullName: w.fullName,
        dateOfBirth: new Date("1990-01-15"),
        email: `${w.fullName.split(" ")[0].toLowerCase()}@example.com`,
        roleTitle: w.roleTitle,
        arrangementType: w.arrangementType,
        startDate: daysFromNow(-120),
        rtwStatus: w.rtwStatus,
        permissionExpiry: "permissionExpiry" in w ? w.permissionExpiry : null,
        followUpDate: "followUpDate" in w ? w.followUpDate : null,
      },
    });
  }

  console.log(`Seeded business ${business.id} with ${workers.length} workers.`);
  console.log("Sign up in the app, then attach yourself as owner:");
  console.log(
    `  INSERT INTO memberships (id, user_id, business_id, role, site_ids, created_at, updated_at)` +
      ` VALUES (gen_random_uuid(), '<your-user-id>', '${business.id}', 'owner', '{}', now(), now());`,
  );
}

main().finally(() => prisma.$disconnect());
