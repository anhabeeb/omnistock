import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "omnistock-theme";
const DARK_THEME_COLOR = "#081217";
const LIGHT_THEME_COLOR = "#f5fafb";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function resolveTheme(
  mode: ThemeMode,
  matcher?: Pick<MediaQueryList, "matches">,
): "light" | "dark" {
  if (mode === "light" || mode === "dark") {
    return mode;
  }

  return matcher?.matches ? "dark" : "light";
}

function applyThemeDocument(theme: "light" | "dark") {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}

function readStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function initializeThemePreference() {
  if (typeof window === "undefined") {
    return;
  }

  const matcher = window.matchMedia("(prefers-color-scheme: dark)");
  applyThemeDocument(resolveTheme(readStoredThemeMode(), matcher));
}

export function useThemePreference() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredThemeMode());

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const matcher = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      applyThemeDocument(resolveTheme(themeMode, matcher));
    };

    updateTheme();

    try {
      window.localStorage.setItem(STORAGE_KEY, themeMode);
    } catch {
      // Ignore storage failures and keep the current in-memory theme.
    }

    const handleSystemThemeChange = () => {
      if (themeMode === "system") {
        updateTheme();
      }
    };

    if (typeof matcher.addEventListener === "function") {
      matcher.addEventListener("change", handleSystemThemeChange);
      return () => matcher.removeEventListener("change", handleSystemThemeChange);
    }

    matcher.addListener(handleSystemThemeChange);
    return () => matcher.removeListener(handleSystemThemeChange);
  }, [themeMode]);

  return {
    themeMode,
    setThemeMode,
  };
}
