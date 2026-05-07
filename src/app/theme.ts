import {
  LEGACY_SIDEBAR_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  SIDEBAR_STORAGE_KEY,
  THEME_SESSION_STORAGE_KEY,
  THEME_STORAGE_KEY
} from "../../shared/appConfig";

export type ThemeMode = "dark" | "light";

export function getStoredTheme(): ThemeMode {
  clearStoredPreferences();
  if (typeof window === "undefined") {
    return "light";
  }

  return window.sessionStorage.getItem(THEME_SESSION_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(themeMode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.body.dataset.theme = themeMode;
  document.documentElement.dataset.theme = themeMode;
  document.documentElement.style.colorScheme = themeMode;

  clearStoredPreferences();
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(THEME_SESSION_STORAGE_KEY, themeMode);
  }
}

function clearStoredPreferences() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(THEME_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  window.localStorage.removeItem(SIDEBAR_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_SIDEBAR_STORAGE_KEY);
}
