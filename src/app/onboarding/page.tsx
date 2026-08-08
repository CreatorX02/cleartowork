"use client";

import { useState } from "react";
import { createBusiness } from "./actions";

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function lookup() {
    if (!companyNumber) return;
    setLookupState("loading");
    try {
      const res = await fetch(`/api/companies-house/${encodeURIComponent(companyNumber)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.name) setName(data.name);
      if (data.address) setSiteAddress(data.address);
      setLookupState("done");
    } catch {
      setLookupState("error");
    }
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-1 text-2xl font-bold">Set up your business</h1>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        Takes under 5 minutes. You can change everything later.
      </p>
      <form action={createBusiness} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Company number (optional)</span>
          <div className="mt-1 flex gap-2">
            <input
              name="companyNumber"
              value={companyNumber}
              onChange={(e) => setCompanyNumber(e.target.value)}
              placeholder="e.g. SC123456"
              className="w-full rounded-lg border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              type="button"
              onClick={lookup}
              disabled={lookupState === "loading"}
              className="shrink-0 rounded-lg border border-gray-300 px-4 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              {lookupState === "loading" ? "Looking up…" : "Autofill"}
            </button>
          </div>
          {lookupState === "error" && (
            <p className="mt-1 text-xs text-amber-600">
              Lookup unavailable — enter details manually.
            </p>
          )}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Business name</span>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Sector</span>
          <select
            name="sector"
            required
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="hospitality">Hospitality</option>
            <option value="food_service">Food service</option>
            <option value="care">Care</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Main site name</span>
          <input
            name="siteName"
            required
            placeholder="e.g. Main restaurant"
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Site address (optional)</span>
          <input
            name="siteAddress"
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700"
        >
          Create business
        </button>
      </form>
    </main>
  );
}
