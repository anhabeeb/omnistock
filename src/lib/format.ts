import { formatWithWorkspaceClock } from "./time";

export function formatDateTime(value: string): string {
  return formatWithWorkspaceClock(value, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-PK", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
