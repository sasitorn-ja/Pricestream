import { type ReactNode, useEffect, useState } from "react";
import {
  AlertTriangle,
  Database,
  LayoutGrid,
  Shield,
  TrendingUp,
  X,
  type LucideIcon
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
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
const ADMIN_NOTIFICATIONS_REFRESH_EVENT = "admin-notifications-refresh";

function getCompanyDisplayName(company?: string) {
  return company ?? "ระบบกลาง";
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
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
  onAdminNotificationChange?: (summary: {
    pendingRequestCount: number;
    dataOceanTokenAlert: boolean;
    dataOceanDaysRemaining: number | null;
  }) => void;
};

export function PriceTrackingShell({
  children,
  authUser,
  activeMenu,
  allowedMenus,
  onMenuChange,
  onLogout,
  onOpenChangePassword,
  filterMenu,
  hideSidebar = false,
  hideUserActions = false,
  onAdminNotificationChange
}: PriceTrackingShellProps) {
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth <= 980);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [dataOceanTokenAlert, setDataOceanTokenAlert] = useState(false);
  const [dataOceanDaysRemaining, setDataOceanDaysRemaining] = useState<number | null>(null);
  const [dataOceanTokenStatus, setDataOceanTokenStatus] = useState<string | null>(null);
  const [dataOceanExpiresAt, setDataOceanExpiresAt] = useState<string | null>(null);
  const [isDataOceanExpiryNoticeOpen, setIsDataOceanExpiryNoticeOpen] = useState(false);
  const companyDisplayName = getCompanyDisplayName(authUser.company);
  const sidebarMenus = allowedMenus.filter((menu) =>
    ["dashboard-cpac", "dashboard-qmix", "admin"].includes(menu)
  );
  const generalMenus = sidebarMenus.filter((menu) => SIDEBAR_MENU_META[menu].section === "general");
  const managementMenus = sidebarMenus.filter((menu) => SIDEBAR_MENU_META[menu].section === "management");

  useEffect(() => {
    let timeoutId: number;

    function applyViewportState() {
      const isMobile = window.innerWidth <= 980;
      setIsMobileViewport(isMobile);
      setIsMobileSidebarOpen((current) => (isMobile ? current : false));
    }

    function handleResize() {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(applyViewportState, 80);
    }

    applyViewportState();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!isMobileViewport || !isMobileSidebarOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileViewport, isMobileSidebarOpen]);

  useEffect(() => {
    if (authUser.role !== "admin") {
      return;
    }

    let isCancelled = false;

    const loadNotificationSummary = async () => {
      try {
        const summary = await getAdminNotificationSummary();
        if (!isCancelled) {
          setDataOceanTokenAlert(summary.dataOceanTokenAlert);
          setDataOceanDaysRemaining(summary.dataOceanDaysRemaining);
          setDataOceanTokenStatus(summary.dataOceanTokenStatus);
          setDataOceanExpiresAt(summary.dataOceanExpiresAt);
          onAdminNotificationChange?.({
            pendingRequestCount: summary.pendingRequestCount,
            dataOceanTokenAlert: summary.dataOceanTokenAlert,
            dataOceanDaysRemaining: summary.dataOceanDaysRemaining
          });
        }
      } catch {
        if (!isCancelled) {
          setDataOceanTokenAlert(false);
          setDataOceanDaysRemaining(null);
          setDataOceanTokenStatus(null);
          setDataOceanExpiresAt(null);
          onAdminNotificationChange?.({
            pendingRequestCount: 0,
            dataOceanTokenAlert: false,
            dataOceanDaysRemaining: null
          });
        }
      }
    };

    void loadNotificationSummary();
    const intervalId = window.setInterval(() => {
      void loadNotificationSummary();
    }, 30000);
    const handleAdminNotificationsRefresh = () => {
      void loadNotificationSummary();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadNotificationSummary();
      }
    };
    window.addEventListener(ADMIN_NOTIFICATIONS_REFRESH_EVENT, handleAdminNotificationsRefresh);
    window.addEventListener("focus", handleAdminNotificationsRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener(ADMIN_NOTIFICATIONS_REFRESH_EVENT, handleAdminNotificationsRefresh);
      window.removeEventListener("focus", handleAdminNotificationsRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authUser.role, onAdminNotificationChange]);

  useEffect(() => {
    if (authUser.role !== "admin" || !dataOceanTokenAlert) {
      setIsDataOceanExpiryNoticeOpen(false);
      return;
    }

    const alertKey = `data-ocean-token-expiry-notice:${dataOceanExpiresAt ?? "unknown"}:${getTodayKey()}`;
    if (window.localStorage.getItem(alertKey) === "dismissed") {
      return;
    }

    setIsDataOceanExpiryNoticeOpen(true);
  }, [authUser.role, dataOceanExpiresAt, dataOceanTokenAlert]);

  const dismissDataOceanExpiryNotice = () => {
    const alertKey = `data-ocean-token-expiry-notice:${dataOceanExpiresAt ?? "unknown"}:${getTodayKey()}`;
    window.localStorage.setItem(alertKey, "dismissed");
    setIsDataOceanExpiryNoticeOpen(false);
  };

  const openDataOceanAdmin = () => {
    dismissDataOceanExpiryNotice();
    window.sessionStorage.setItem("admin-active-view", "data-ocean");
    window.dispatchEvent(new CustomEvent("admin-view-change", { detail: "data-ocean" }));
    onMenuChange("admin");
  };

  const dataOceanNoticeTitle =
    dataOceanTokenStatus === "expired" || (dataOceanDaysRemaining !== null && dataOceanDaysRemaining <= 0)
      ? "DataOcean Token หมดอายุแล้ว"
      : "DataOcean Token ใกล้หมดอายุ";
  const dataOceanNoticeDetail =
    dataOceanDaysRemaining !== null && dataOceanDaysRemaining <= 0
      ? "ระบบจะใช้ token เดิมต่อไป แต่การดึงข้อมูลใหม่จาก DataOcean อาจล้มเหลว ข้อมูลเดิมในระบบจะไม่ถูกลบและจะค้างอยู่จนกว่าจะบันทึก token ใหม่"
      : dataOceanDaysRemaining === 1
        ? "เหลือเวลาใช้งาน 1 วัน กรุณาบันทึก token ใหม่ก่อนหมดอายุ เพื่อให้การ refresh ข้อมูลทำงานต่อเนื่อง"
        : `เหลือเวลาใช้งาน ${dataOceanDaysRemaining ?? "-"} วัน กรุณาบันทึก token ใหม่ก่อนหมดอายุ เพื่อให้การ refresh ข้อมูลทำงานต่อเนื่อง`;

  const isDesktopSidebarVisible = !hideSidebar && !isMobileViewport && !isSidebarCollapsed;

  return (
    <div
      className={cn(
        "relative min-h-screen lg:grid",
        isDesktopSidebarVisible ? "lg:grid-cols-[272px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)]"
      )}
    >
      {!hideSidebar && isMobileViewport && isMobileSidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm"
          aria-label="ปิดเมนูหลัก"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      ) : null}

      {hideSidebar ? null : (
        <aside
          aria-label="เมนูหลัก"
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col gap-5 border-r border-[var(--border)] bg-[var(--shell-sidebar)] p-[20px_14px] shadow-[0_30px_90px_var(--shadow-color)] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
            isMobileViewport ? (isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full") : "",
            !isMobileViewport && isSidebarCollapsed && "hidden"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="grid flex-1 grid-cols-[auto_1fr] items-center gap-3 px-[6px] py-[2px]">
              <span className="flex size-[42px] items-center justify-center rounded-[14px] bg-[var(--surface-strong)] text-[1.05rem] font-black text-[var(--foreground)] shadow-[0_10px_24px_var(--shadow-color)]">
                {companyDisplayName.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-[0.96rem] font-black text-[var(--foreground)]">
                  CPAC Dashboard
                </strong>
                <span className="block truncate text-[0.8rem] font-extrabold text-[var(--accent-text)]">
                  {companyDisplayName}
                </span>
              </div>
            </div>
            {isMobileViewport ? (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="ปิดเมนูหลัก"
                onClick={() => setIsMobileSidebarOpen(false)}
              >
                <X className="size-5" />
              </Button>
            ) : null}
          </div>

          <nav className="flex flex-1 flex-col gap-6 overflow-auto">
            {generalMenus.length ? (
              <div className="space-y-2">
                <p className="px-[6px] text-[0.76rem] font-black uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                  เมนูหลัก
                </p>
                <div className="space-y-[6px]">
                  {generalMenus.map((menu) => {
                    const menuMeta = SIDEBAR_MENU_META[menu];
                    const Icon = menuMeta.icon;

                    return (
                      <button
                        key={menu}
                        type="button"
                        className={cn(
                          "grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[14px] border px-3 py-[10px] text-left transition",
                          activeMenu === menu
                            ? "border-[var(--border-strong)] bg-[var(--primary-soft)] text-[var(--foreground)] shadow-[inset_2px_0_0_var(--primary),0_10px_24px_var(--shadow-color)]"
                            : "border-transparent text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--shell-hover)] hover:text-[var(--foreground)] hover:translate-x-[2px]"
                        )}
                        onClick={() => {
                          onMenuChange(menu);
                          if (isMobileViewport) {
                            setIsMobileSidebarOpen(false);
                          }
                        }}
                        title={menuMeta.label}
                      >
                        <span className="flex size-7 items-center justify-center rounded-[9px] text-[var(--muted-foreground)]">
                          <Icon className="size-[18px]" />
                        </span>
                        <strong className="text-[0.94rem] font-extrabold text-[var(--foreground)]">{menuMeta.label}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {managementMenus.length ? (
              <div className="space-y-2">
                <p className="px-[6px] text-[0.76rem] font-black uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                  จัดการระบบ
                </p>
                <div className="space-y-[6px]">
                  {managementMenus.map((menu) => {
                    const menuMeta = SIDEBAR_MENU_META[menu];
                    const Icon = menuMeta.icon;

                    return (
                      <button
                        key={menu}
                        type="button"
                        className={cn(
                          "grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[14px] border px-3 py-[10px] text-left transition",
                          activeMenu === menu
                            ? "border-[var(--border-strong)] bg-[var(--primary-soft)] text-[var(--foreground)] shadow-[inset_2px_0_0_var(--primary),0_10px_24px_var(--shadow-color)]"
                            : "border-transparent text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--shell-hover)] hover:text-[var(--foreground)] hover:translate-x-[2px]"
                        )}
                        onClick={() => {
                          onMenuChange(menu);
                          if (isMobileViewport) {
                            setIsMobileSidebarOpen(false);
                          }
                        }}
                        title={menuMeta.label}
                      >
                        <span className="flex size-7 items-center justify-center rounded-[9px] text-[var(--muted-foreground)]">
                          <Icon className="size-[18px]" />
                        </span>
                        <strong className="text-[0.94rem] font-extrabold text-[var(--foreground)]">{menuMeta.label}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </nav>

        </aside>
      )}

      <div className={cn("flex min-w-0 flex-1 flex-col", isDesktopSidebarVisible && "lg:min-h-screen")}>
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--shell-header)] px-4 py-3 backdrop-blur-[18px] md:px-4">
          <PriceTrackingNavigation
            authUser={authUser}
            isSidebarCollapsed={isSidebarCollapsed}
            isMobileViewport={isMobileViewport}
            isMobileSidebarOpen={isMobileSidebarOpen}
            onToggleSidebar={() => {
              if (isMobileViewport) {
                setIsMobileSidebarOpen((current) => !current);
                return;
              }

              setIsSidebarCollapsed((current) => !current);
            }}
            onLogout={onLogout}
            onOpenChangePassword={onOpenChangePassword}
            filterMenu={filterMenu}
            showSidebarToggle={!hideSidebar}
            showUserActions={!hideUserActions}
          />
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {isDataOceanExpiryNoticeOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--overlay)] px-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-ocean-expiry-title"
            className="w-full max-w-lg rounded-[18px] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-[0_28px_90px_var(--shadow-color)]"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--primary-soft)] text-[var(--foreground)]">
                <AlertTriangle className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="data-ocean-expiry-title" className="text-lg font-black text-[var(--foreground)]">
                  {dataOceanNoticeTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{dataOceanNoticeDetail}</p>
                {dataOceanExpiresAt ? (
                  <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
                    วันหมดอายุ: {dataOceanExpiresAt}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={dismissDataOceanExpiryNotice}>
                ไปเมนูอื่นก่อน
              </Button>
              <Button onClick={openDataOceanAdmin}>
                <Database className="size-4" />
                เปลี่ยน token
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
