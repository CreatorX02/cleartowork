import { NextResponse } from "next/server";
import { requireUser } from "@/lib/tenant";

/**
 * Companies House autofill proxy (read-only, free API).
 * Set COMPANIES_HOUSE_API_KEY in env; without it the route degrades to 501
 * and the onboarding form simply stays manual.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  await requireUser();
  const { number } = await params;

  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Companies House lookup not configured" } },
      { status: 501 },
    );
  }
  if (!/^[A-Za-z0-9]{6,8}$/.test(number)) {
    return NextResponse.json(
      { error: { code: "invalid_number", message: "Invalid company number" } },
      { status: 400 },
    );
  }

  const res = await fetch(
    `https://api.company-information.service.gov.uk/company/${encodeURIComponent(number)}`,
    {
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
      next: { revalidate: 3600 },
    },
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Company not found" } },
      { status: res.status === 404 ? 404 : 502 },
    );
  }
  const data = await res.json();
  const address = data.registered_office_address;
  return NextResponse.json({
    name: data.company_name as string,
    companyNumber: data.company_number as string,
    address: address
      ? [address.address_line_1, address.address_line_2, address.locality, address.postal_code]
          .filter(Boolean)
          .join(", ")
      : null,
  });
}
