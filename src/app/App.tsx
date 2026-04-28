import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, type ThemeMode } from "./theme";
import { PriceTrackingPage } from "../pages/price-tracking/PriceTrackingPage";
import { type AuthUser } from "../services/auth/authUser";
import { type AppMenuKey, type CompanyCode } from "../services/auth/localAuth";

const previewUser: AuthUser = {
  id: "preview",
  username: "preview",
  name: "Preview User",
  email: "preview@local",
  role: "user",
  company: "CPAC",
  menuPermissions: ["dashboard-cpac", "dashboard-qmix"]
};

export function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
  const [activeMenu, setActiveMenu] = useState<AppMenuKey>("dashboard-cpac");
  const dashboardDivision: CompanyCode = activeMenu === "dashboard-qmix" ? "QMIX" : "CPAC";

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  return (
    <PriceTrackingPage
      authUser={previewUser}
      activeMenu={activeMenu}
      allowedMenus={["dashboard-cpac", "dashboard-qmix"]}
      themeMode={themeMode}
      dashboardDivision={dashboardDivision}
      hideUserActions
      onToggleTheme={() => setThemeMode((mode) => (mode === "dark" ? "light" : "dark"))}
      onMenuChange={setActiveMenu}
      onLogout={() => undefined}
      onOpenChangePassword={() => undefined}
    />
  );
}
