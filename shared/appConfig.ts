export const APP_BRAND_NAME = "CPAC Dashboard";
export const GENERAL_USER_EMAIL_DOMAIN = "@scg.com";
export const AUTH_SESSION_COOKIE_NAME = "cpac_dashboard_session";
export const AUTH_SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const THEME_STORAGE_KEY = "cpac-dashboard-theme";
export const LEGACY_THEME_STORAGE_KEY = "pricing-monitor-theme";
export const THEME_SESSION_STORAGE_KEY = "cpac-dashboard-session-theme";
export const ACTIVE_MENU_SESSION_STORAGE_KEY = "cpac-dashboard-session-active-menu";
export const SIDEBAR_STORAGE_KEY = "cpac-dashboard-sidebar";
export const LEGACY_SIDEBAR_STORAGE_KEY = "pricing-monitor-sidebar";
export const LEGACY_AUTH_TOKEN_STORAGE_KEY = "pricing-monitor-auth-token";
export const DATAOCEAN_CONFIG_SECRET_LABEL = "cpac-dashboard-dataocean-config";
export const PERSISTED_CACHE_FILENAME = "cpac-dashboard-records.json";
export const PERSISTED_ANALYTICS_SNAPSHOT_FILENAME = "cpac-dashboard-snapshot.json";

export const ALL_APP_MENU_KEYS = ["dashboard-cpac", "dashboard-qmix", "admin"] as const;

export const COMPANY_DASHBOARD_DIVISIONS = {
  CPAC: [
    "CPAC East",
    "CPAC Metro",
    "CPAC North",
    "CPAC Northeast",
    "CPAC West",
    "RMC - South Chain"
  ],
  QMIX: [
    "QMix Bangkok",
    "QMix Central",
    "QMix East",
    "QMix North",
    "QMix Northeast",
    "QMix South"
  ]
} as const;
