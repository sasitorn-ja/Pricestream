import { useEffect, useState } from "react";
import { AdminPanel } from "./AdminPanel";
import { AuthGate } from "./AuthGate";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { applyTheme, getStoredTheme, type ThemeMode } from "./theme";
import { PriceTrackingShell } from "../pages/price-tracking/PriceTrackingShell";
import { PriceTrackingPage } from "../pages/price-tracking/PriceTrackingPage";
import { type AuthUser } from "../services/auth/authUser";
import { type AppMenuKey, type CompanyCode } from "../services/auth/localAuth";
import { ACTIVE_MENU_SESSION_STORAGE_KEY } from "../../shared/appConfig";

const FALLBACK_MENU: AppMenuKey = "dashboard-cpac";
const ALL_MENU_KEYS: AppMenuKey[] = ["dashboard-cpac", "dashboard-qmix", "admin"];

function isAppMenuKey(value: string): value is AppMenuKey {
  return ALL_MENU_KEYS.includes(value as AppMenuKey);
}

function resolveAllowedMenus(authUser: AuthUser) {
  const requestedMenus = Array.isArray(authUser.menuPermissions)
    ? authUser.menuPermissions.filter(isAppMenuKey)
    : [];

  if (authUser.role === "admin") {
    return ALL_MENU_KEYS;
  }

  return requestedMenus.length > 0 ? requestedMenus : [FALLBACK_MENU];
}

function getSessionActiveMenu(): AppMenuKey {
  if (typeof window === "undefined") {
    return FALLBACK_MENU;
  }

  const storedMenu = window.sessionStorage.getItem(ACTIVE_MENU_SESSION_STORAGE_KEY);
  return storedMenu && isAppMenuKey(storedMenu) ? storedMenu : FALLBACK_MENU;
}

function storeSessionActiveMenu(menu: AppMenuKey) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(ACTIVE_MENU_SESSION_STORAGE_KEY, menu);
}

type AuthenticatedAppContentProps = {
  authUser: AuthUser;
  onLogout: () => void;
  authActions: {
    openChangePassword: () => void;
    closeChangePassword: () => void;
    markPasswordChanged: () => void;
    isChangePasswordOpen: boolean;
    isChangePasswordRequired: boolean;
  };
  themeMode: ThemeMode;
  onToggleTheme: () => void;
};

function AuthenticatedAppContent({
  authUser,
  onLogout,
  authActions,
  themeMode,
  onToggleTheme
}: AuthenticatedAppContentProps) {
  const [activeMenu, setActiveMenu] = useState<AppMenuKey>(() => getSessionActiveMenu());
  const allowedMenus = resolveAllowedMenus(authUser);
  const resolvedActiveMenu = allowedMenus.includes(activeMenu) ? activeMenu : allowedMenus[0] ?? FALLBACK_MENU;
  const dashboardDivision: CompanyCode = resolvedActiveMenu === "dashboard-qmix" ? "QMIX" : "CPAC";

  useEffect(() => {
    if (!allowedMenus.includes(activeMenu)) {
      setActiveMenu(allowedMenus[0] ?? FALLBACK_MENU);
    }
  }, [activeMenu, allowedMenus]);

  useEffect(() => {
    storeSessionActiveMenu(resolvedActiveMenu);
  }, [resolvedActiveMenu]);

  return (
    <>
      {resolvedActiveMenu === "admin" ? (
        <PriceTrackingShell
          authUser={authUser}
          activeMenu={resolvedActiveMenu}
          allowedMenus={allowedMenus}
          themeMode={themeMode}
          onToggleTheme={onToggleTheme}
          onMenuChange={setActiveMenu}
          onLogout={onLogout}
          onOpenChangePassword={authActions.openChangePassword}
        >
          <AdminPanel authUser={authUser} />
        </PriceTrackingShell>
      ) : (
        <PriceTrackingPage
          key={dashboardDivision}
          authUser={authUser}
          activeMenu={resolvedActiveMenu}
          allowedMenus={allowedMenus}
          themeMode={themeMode}
          dashboardDivision={dashboardDivision}
          onToggleTheme={onToggleTheme}
          onMenuChange={setActiveMenu}
          onLogout={onLogout}
          onOpenChangePassword={authActions.openChangePassword}
        />
      )}
      <ChangePasswordModal
        isOpen={authActions.isChangePasswordOpen}
        onClose={authActions.closeChangePassword}
        onChanged={authActions.markPasswordChanged}
        isRequired={authActions.isChangePasswordRequired}
      />
    </>
  );
}

export function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  return (
    <AuthGate>
      {(authUser, onLogout, authActions) => (
        <AuthenticatedAppContent
          authUser={authUser}
          onLogout={onLogout}
          authActions={authActions}
          themeMode={themeMode}
          onToggleTheme={() => setThemeMode((mode) => (mode === "dark" ? "light" : "dark"))}
        />
      )}
    </AuthGate>
  );
}
