import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./db";

/**
 * Tenant isolation happens here and only here. Every server action, route
 * handler and page that touches tenant data must obtain its business scope
 * through requireBusiness() — never trust a business_id from the request
 * body or URL (04_API_SPEC.md §"business_id derived from the session
 * membership, never from the request body").
 */

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}

export type TenantContext = {
  userId: string;
  businessId: string;
  role: "owner" | "manager";
  siteIds: string[]; // empty = all sites
};

/**
 * Resolves the caller's business from their membership. Redirects to
 * onboarding when the user has no business yet.
 */
export async function requireBusiness(): Promise<TenantContext> {
  const user = await requireUser();
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
  });
  if (!membership) redirect("/onboarding");
  return {
    userId: user.id,
    businessId: membership.businessId,
    role: membership.role,
    siteIds: membership.siteIds,
  };
}
