export type ThemeMode = "dark" | "light";

export const THEME_STORAGE_KEY = "pricing-monitor-theme";

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

export function applyTheme(themeMode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.body.dataset.theme = themeMode;
  document.documentElement.dataset.theme = themeMode;
  document.documentElement.style.colorScheme = themeMode;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }
}
