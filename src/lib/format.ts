import { formatWithWorkspaceClock } from "./time";

function localeForCurrency(currency: string): string {
  switch (currency.trim().toUpperCase()) {
    case "MVR":
      return "en-MV";
    case "PKR":
      return "en-PK";
    case "AED":
      return "en-AE";
    case "SAR":
      return "ar-SA";
    default:
      return "en-US";
  }
}

export function formatDateTime(value: string): string {
  return formatWithWorkspaceClock(value, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(localeForCurrency(currency), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactNumber(value: number, currency = "MVR"): string {
  return new Intl.NumberFormat(localeForCurrency(currency), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
