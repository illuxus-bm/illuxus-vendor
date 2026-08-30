import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind-aware class name merger used by every shadcn primitive.
 * `cn("p-2 p-4")` → `"p-4"`, so later classes always win.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a decimal amount (e.g. 100.50) as a currency string using the
 * browser locale.
 */
export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a **minor-unit** amount (bigint cents / paise, as stored in
 * vendor_bookings.total, quotes.total, vendor_services.base_price, etc.)
 * as a currency string. Divides by 100 before formatting.
 *
 * Example: formatMoneyCents(150000, "INR") → "₹1,500"
 */
export function formatMoneyCents(
  minorUnits: number | string | null | undefined,
  currency = "USD",
) {
  const n = minorUnits == null ? 0 : Number(minorUnits);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n / 100);
}

/** Absolute URL back to the main illuxus app (env-configurable). */
export function illuxusOrigin(): string {
  const configured = import.meta.env.VITE_ILLUXUS_ORIGIN;
  if (configured && typeof configured === "string") return configured;
  return "https://illuxus.com";
}
