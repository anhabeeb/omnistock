import {
  getCurrentTimeMs,
  getDateKeyForWorkspace,
  getMonthKeyForWorkspace,
  shiftDateKey,
  shiftMonthKey,
} from "./time";

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

function normalizeDateKey(value?: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  return value;
}

export function resolveDateFilterRange(
  filter: DateFilterState,
  referenceTime = getCurrentTimeMs(),
): { start: string | null; end: string | null } {
  const todayKey = getDateKeyForWorkspace(referenceTime);
  const currentMonthKey = getMonthKeyForWorkspace(referenceTime);
  const nextMonthFirstDate = `${shiftMonthKey(currentMonthKey, 1)}-01`;

  switch (filter.preset) {
    case "yesterday": {
      const yesterdayKey = shiftDateKey(todayKey, -1);
      return { start: yesterdayKey, end: yesterdayKey };
    }
    case "last-7-days": {
      return { start: shiftDateKey(todayKey, -6), end: todayKey };
    }
    case "this-month": {
      return {
        start: `${currentMonthKey}-01`,
        end: shiftDateKey(nextMonthFirstDate, -1),
      };
    }
    case "last-month": {
      const lastMonthKey = shiftMonthKey(currentMonthKey, -1);
      return {
        start: `${lastMonthKey}-01`,
        end: shiftDateKey(`${currentMonthKey}-01`, -1),
      };
    }
    case "last-6-months": {
      const startMonthKey = shiftMonthKey(currentMonthKey, -5);
      return {
        start: `${startMonthKey}-01`,
        end: shiftDateKey(nextMonthFirstDate, -1),
      };
    }
    case "custom": {
      const startDate = normalizeDateKey(filter.customStartDate);
      const endDate = normalizeDateKey(filter.customEndDate);
      return {
        start: startDate,
        end: endDate,
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
  referenceTime = getCurrentTimeMs(),
): boolean {
  if (filter.preset === "all") {
    return true;
  }

  if (!value) {
    return false;
  }

  const dateKey = getDateKeyForWorkspace(value);
  const { start, end } = resolveDateFilterRange(filter, referenceTime);
  if (start !== null && dateKey < start) {
    return false;
  }
  if (end !== null && dateKey > end) {
    return false;
  }
  return true;
}
