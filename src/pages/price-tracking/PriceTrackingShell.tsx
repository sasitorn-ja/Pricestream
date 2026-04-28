import { type ReactNode, useEffect, useState } from "react";
import { LayoutGrid, Shield, TrendingUp, type LucideIcon } from "lucide-react";
import { PriceTrackingNavigation } from "./PriceTrackingNavigation";
import { type AuthUser } from "../../services/auth/authUser";
import { getAdminNotificationSummary, type AppMenuKey } from "../../services/auth/localAuth";

const SIDEBAR_MENU_META: Record<
  AppMenuKey,
  {
    label: string;
    section: "general" | "management";
    icon: LucideIcon;
  }
> = {
  "dashboard-cpac": {
    label: "Dashboard (CPAC)",
    section: "general",
    icon: LayoutGrid
  },
  "dashboard-qmix": {
    label: "Dashboard (QMIX)",
    section: "general",
    icon: TrendingUp
  },
  admin: {
    label: "Admin",
    section: "management",
    icon: Shield
  }
};

function getCompanyDisplayName(company?: string) {
  return company ?? "Workspace";
}

type PriceTrackingShellProps = {
  children: ReactNode;
  authUser: AuthUser;
  activeMenu: AppMenuKey;
  allowedMenus: AppMenuKey[];
  themeMode: "dark" | "light";
  onToggleTheme: () => void;
  onMenuChange: (menu: AppMenuKey) => void;
  onLogout: () => void;
  onOpenChangePassword: () => void;
  filterMenu?: ReactNode;
  hideSidebar?: boolean;
  hideUserActions?: boolean;
};

export function PriceTrackingShell({
  children,
  authUser,
  activeMenu,
  allowedMenus,
  themeMode,
  onToggleTheme,
  onMenuChange,
  onLogout,
  onOpenChangePassword,
  filterMenu,
  hideSidebar = false,
  hideUserActions = false
}: PriceTrackingShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return window.localStorage.getItem("pricing-monitor-sidebar") === "collapsed";
  });
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const companyDisplayName = getCompanyDisplayName(authUser.company);
  const sidebarMenus = allowedMenus.filter((menu) =>
    ["dashboard-cpac", "dashboard-qmix", "admin"].includes(menu)
  );
  const generalMenus = sidebarMenus.filter((menu) => SIDEBAR_MENU_META[menu].section === "general");
  const managementMenus = sidebarMenus.filter((menu) => SIDEBAR_MENU_META[menu].section === "management");

  useEffect(() => {
    window.localStorage.setItem(
      "pricing-monitor-sidebar",
      isSidebarCollapsed ? "collapsed" : "expanded"
    );
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (authUser.role !== "admin") {
      setPendingRequestCount(0);
      return;
    }

    let isCancelled = false;

    const loadNotificationSummary = async () => {
      try {
        const summary = await getAdminNotificationSummary();
        if (!isCancelled) {
          setPendingRequestCount(summary.pendingRequestCount);
        }
      } catch {
        if (!isCancelled) {
          setPendingRequestCount(0);
        }
      }
    };

    void loadNotificationSummary();
    const intervalId = window.setInterval(() => {
      void loadNotificationSummary();
    }, 30000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authUser.role]);

  return (
    <div
      className={`priceTrackingFrame${isSidebarCollapsed || hideSidebar ? " sidebarCollapsed" : ""}`}
    >
      {hideSidebar ? null : (
        <aside className="priceTrackingSidebar" aria-label="เมนูหลัก">
          <div className="sidebarBrand">
            <span className="sidebarBrandBadge">{companyDisplayName.slice(0, 1)}</span>
            <div className="sidebarBrandCopy">
              <strong>Dashboard</strong>
              <span>{companyDisplayName}</span>
            </div>
          </div>

          <nav className="sidebarNav">
            {generalMenus.length ? (
              <div className="sidebarSection">
                <p className="sidebarSectionLabel">General</p>
                <div className="sidebarSectionItems">
                  {generalMenus.map((menu) => {
                    const menuMeta = SIDEBAR_MENU_META[menu];
                    const Icon = menuMeta.icon;

                    return (
                      <button
                        key={menu}
                        type="button"
                        className={`sidebarNavItem${activeMenu === menu ? " active" : ""}`}
                        onClick={() => onMenuChange(menu)}
                        title={menuMeta.label}
                      >
                        <span className="sidebarNavInitial" aria-hidden="true">
                          <Icon />
                        </span>
                        <strong>{menuMeta.label}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {managementMenus.length ? (
              <div className="sidebarSection">
                <p className="sidebarSectionLabel">Management</p>
                <div className="sidebarSectionItems">
                  {managementMenus.map((menu) => {
                    const menuMeta = SIDEBAR_MENU_META[menu];
                    const Icon = menuMeta.icon;

                    return (
                      <button
                        key={menu}
                        type="button"
                        className={`sidebarNavItem${activeMenu === menu ? " active" : ""}`}
                        onClick={() => onMenuChange(menu)}
                        title={menuMeta.label}
                      >
                        <span className="sidebarNavInitial" aria-hidden="true">
                          <Icon />
                        </span>
                        <strong>{menuMeta.label}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </nav>
        </aside>
      )}

      <div className="priceTrackingMainColumn">
        <header className="priceTrackingHeader">
          <PriceTrackingNavigation
            authUser={authUser}
            themeMode={themeMode}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleTheme={onToggleTheme}
            onToggleSidebar={() => setIsSidebarCollapsed((current) => !current)}
            onLogout={onLogout}
            onOpenChangePassword={onOpenChangePassword}
            pendingRequestCount={pendingRequestCount}
            onOpenAdminNotifications={() => onMenuChange("admin")}
            filterMenu={filterMenu}
            showSidebarToggle={!hideSidebar}
            showUserActions={!hideUserActions}
          />
        </header>

        <main className="priceTrackingViewport">{children}</main>
      </div>
    </div>
  );
}
