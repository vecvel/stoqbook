import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isInstalled } from "@/lib/services/business";

import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up StoqBook" };

// Whether the installation has been set up is runtime state, so this page must
// never be prerendered — doing so would both bake in a stale answer and require
// a database at build time.
export const dynamic = "force-dynamic";

const COUNTRIES = [
  { value: "IN", label: "India" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "GB", label: "United Kingdom" },
  { value: "US", label: "United States" },
  { value: "SG", label: "Singapore" },
  { value: "AU", label: "Australia" },
  { value: "CA", label: "Canada" },
  { value: "ZA", label: "South Africa" },
];

const CURRENCIES = [
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "GBP", label: "GBP — Pound Sterling" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "SGD", label: "SGD — Singapore Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "ZAR", label: "ZAR — South African Rand" },
];

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Africa/Johannesburg",
  "UTC",
];

export default async function SetupPage() {
  // Once a business exists this route is permanently closed.
  if (await isInstalled()) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up StoqBook
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This installation belongs to one business. Tell us about it once and
          you are ready to trade.
        </p>
      </header>

      <SetupForm
        countries={COUNTRIES}
        currencies={CURRENCIES}
        timezones={TIMEZONES}
      />
    </div>
  );
}
