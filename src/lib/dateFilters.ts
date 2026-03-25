export type DateFilterPreset =
  | "all"
  | "yesterday"
  | "last-7-days"
  | "this-month"
  | "last-month"
  | "last-6-months"
  | "custom";

export interface DateFilterState {
  preset: DateFilterPreset;
  customStartDate?: string;
  customEndDate?: string;
}

export const DATE_FILTER_OPTIONS: Array<{ value: DateFilterPreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last-7-days", label: "Last 7 days" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-6-months", label: "6 months" },
  { value: "custom", label: "Custom date" },
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function parseDateOnly(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function resolveDateFilterRange(
  filter: DateFilterState,
  referenceDate = new Date(),
): { start: number | null; end: number | null } {
  const todayStart = startOfDay(referenceDate);

  switch (filter.preset) {
    case "yesterday": {
      const start = addDays(todayStart, -1);
      return { start: start.getTime(), end: todayStart.getTime() };
    }
    case "last-7-days": {
      const start = addDays(todayStart, -6);
      const end = addDays(todayStart, 1);
      return { start: start.getTime(), end: end.getTime() };
    }
    case "this-month": {
      const start = startOfMonth(referenceDate);
      const end = addMonths(start, 1);
      return { start: start.getTime(), end: end.getTime() };
    }
    case "last-month": {
      const end = startOfMonth(referenceDate);
      const start = addMonths(end, -1);
      return { start: start.getTime(), end: end.getTime() };
    }
    case "last-6-months": {
      const currentMonthStart = startOfMonth(referenceDate);
      const start = addMonths(currentMonthStart, -5);
      const end = addMonths(currentMonthStart, 1);
      return { start: start.getTime(), end: end.getTime() };
    }
    case "custom": {
      const startDate = parseDateOnly(filter.customStartDate);
      const endDate = parseDateOnly(filter.customEndDate);
      return {
        start: startDate ? startDate.getTime() : null,
        end: endDate ? addDays(endDate, 1).getTime() : null,
      };
    }
    case "all":
    default:
      return { start: null, end: null };
  }
}

export function matchesDateFilter(
  value: string | undefined,
  filter: DateFilterState,
  referenceDate = new Date(),
): boolean {
  if (filter.preset === "all") {
    return true;
  }

  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const { start, end } = resolveDateFilterRange(filter, referenceDate);
  if (start !== null && timestamp < start) {
    return false;
  }
  if (end !== null && timestamp >= end) {
    return false;
  }
  return true;
}
