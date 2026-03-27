import type { TimeSource } from "../../shared/types";
import { DEFAULT_TIME_SOURCE } from "../../shared/defaults";

const TIMEZONE_KEY = "omnistock:time-zone";
const TIME_SOURCE_KEY = "omnistock:time-source";
const CLOCK_OFFSET_KEY = "omnistock:clock-offset-ms";
const FALLBACK_SYSTEM_TIMEZONE = "UTC";

function localStorageRef(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredValue(key: string): string | null {
  return localStorageRef()?.getItem(key) ?? null;
}

function writeStoredValue(key: string, value: string) {
  try {
    localStorageRef()?.setItem(key, value);
  } catch {
    // Ignore blocked storage environments and continue with in-memory behavior.
  }
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function formatParts(
  value: Date | number | string,
  timeZone: string,
  fields: Array<"year" | "month" | "day" | "hour" | "minute" | "second">,
): Record<string, string> {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return {};
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: fields.includes("year") ? "numeric" : undefined,
    month: fields.includes("month") ? "2-digit" : undefined,
    day: fields.includes("day") ? "2-digit" : undefined,
    hour: fields.includes("hour") ? "2-digit" : undefined,
    minute: fields.includes("minute") ? "2-digit" : undefined,
    second: fields.includes("second") ? "2-digit" : undefined,
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((parts, part) => {
      if (part.type !== "literal") {
        parts[part.type] = part.value;
      }
      return parts;
    }, {});
}

export function rememberWorkspaceTimePreferences(options: {
  timeZone: string;
  timeSource: TimeSource;
  serverGeneratedAt?: string;
}) {
  const normalizedTimeZone = options.timeZone.trim();
  if (normalizedTimeZone && isValidTimeZone(normalizedTimeZone)) {
    writeStoredValue(TIMEZONE_KEY, normalizedTimeZone);
  }

  writeStoredValue(TIME_SOURCE_KEY, options.timeSource);

  if (options.serverGeneratedAt) {
    const serverMs = Date.parse(options.serverGeneratedAt);
    if (Number.isFinite(serverMs)) {
      writeStoredValue(CLOCK_OFFSET_KEY, String(serverMs - Date.now()));
    }
  }
}

export function getStoredTimeSource(): TimeSource {
  const value = readStoredValue(TIME_SOURCE_KEY);
  return value === "browser" ? "browser" : DEFAULT_TIME_SOURCE;
}

export function getStoredSystemTimeZone(): string {
  const stored = readStoredValue(TIMEZONE_KEY);
  if (stored && isValidTimeZone(stored)) {
    return stored;
  }

  return FALLBACK_SYSTEM_TIMEZONE;
}

export function getStoredClockOffsetMs(): number {
  const stored = Number(readStoredValue(CLOCK_OFFSET_KEY) ?? 0);
  return Number.isFinite(stored) ? stored : 0;
}

export function getCurrentTimeMs(): number {
  return getStoredTimeSource() === "system"
    ? Date.now() + getStoredClockOffsetMs()
    : Date.now();
}

export function getCurrentTimestampIso(): string {
  return new Date(getCurrentTimeMs()).toISOString();
}

export function getActiveTimeZone(): string | undefined {
  return getStoredTimeSource() === "system" ? getStoredSystemTimeZone() : undefined;
}

export function formatWithWorkspaceClock(
  value: Date | number | string,
  options: Intl.DateTimeFormatOptions,
  locale = "en-MV",
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const timeZone = getActiveTimeZone();
  try {
    return new Intl.DateTimeFormat(locale, timeZone ? { ...options, timeZone } : options).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}

export function getDateKeyForWorkspace(value: number | string | Date = getCurrentTimeMs()): string {
  if (typeof value === "string" && isDateKey(value)) {
    return value;
  }

  if (getStoredTimeSource() === "browser") {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "1970-01-01";
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  const parts = formatParts(value, getStoredSystemTimeZone(), ["year", "month", "day"]);
  return `${parts.year ?? "1970"}-${parts.month ?? "01"}-${parts.day ?? "01"}`;
}

export function getMonthKeyForWorkspace(value: number | string | Date = getCurrentTimeMs()): string {
  if (typeof value === "string" && isMonthKey(value)) {
    return value;
  }
  if (typeof value === "string" && isDateKey(value)) {
    return value.slice(0, 7);
  }

  if (getStoredTimeSource() === "browser") {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "1970-01";
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  const parts = formatParts(value, getStoredSystemTimeZone(), ["year", "month"]);
  return `${parts.year ?? "1970"}-${parts.month ?? "01"}`;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    return dateKey;
  }

  const [, yearValue, monthValue, dayValue] = match;
  const next = new Date(
    Date.UTC(Number(yearValue), Number(monthValue) - 1, Number(dayValue) + days),
  );
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function shiftMonthKey(monthKey: string, months: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return monthKey;
  }

  const [, yearValue, monthValue] = match;
  const next = new Date(Date.UTC(Number(yearValue), Number(monthValue) - 1 + months, 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`;
}

export function getDateInputValueForWorkspace(): string {
  return getDateKeyForWorkspace();
}

export function getFileDateStampForWorkspace(): string {
  return getDateKeyForWorkspace();
}
