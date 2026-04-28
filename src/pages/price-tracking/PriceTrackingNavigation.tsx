import { type ReactNode, useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { PriceTrackingIcon } from "./PriceTrackingIcon";
import { type AuthUser } from "../../services/auth/authUser";

const COMPACT_FILTER_BREAKPOINT = 1200;

type PriceTrackingNavigationProps = {
  authUser: AuthUser;
  themeMode: "dark" | "light";
  isSidebarCollapsed: boolean;
  isMobileViewport?: boolean;
  isMobileSidebarOpen?: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onLogout: () => void;
  onOpenChangePassword: () => void;
  pendingRequestCount: number;
  onOpenAdminNotifications: () => void;
  filterMenu?: ReactNode;
  showSidebarToggle?: boolean;
  showUserActions?: boolean;
};

export function PriceTrackingNavigation({
  authUser,
  themeMode,
  isSidebarCollapsed,
  isMobileViewport = false,
  isMobileSidebarOpen = false,
  onToggleTheme,
  onToggleSidebar,
  onLogout,
  onOpenChangePassword,
  pendingRequestCount,
  onOpenAdminNotifications,
  filterMenu,
  showSidebarToggle = true,
  showUserActions = true
}: PriceTrackingNavigationProps) {
  const [isCompactFilterScreen, setIsCompactFilterScreen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const wasCompactFilterScreenRef = useRef(false);

  useEffect(() => {
    let timeoutId: number;

    function applyViewportState() {
      const compactScreen = window.innerWidth <= COMPACT_FILTER_BREAKPOINT;
      const wasCompactScreen = wasCompactFilterScreenRef.current;

      setIsCompactFilterScreen(compactScreen);
      if (!compactScreen || !wasCompactScreen) {
        setIsFilterMenuOpen(false);
      }
      wasCompactFilterScreenRef.current = compactScreen;
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

  const shouldShowInlineFilter = Boolean(filterMenu) && !isCompactFilterScreen;
  const shouldShowCompactFilterToggle = Boolean(filterMenu) && isCompactFilterScreen;
  const isSidebarVisible = isMobileViewport ? isMobileSidebarOpen : !isSidebarCollapsed;

  return (
    <>
      <div className="priceTrackingHeaderMain">
        {showSidebarToggle ? (
          <button
            type="button"
            className="topbarIconButton sidebarTopbarToggle"
            onClick={onToggleSidebar}
            aria-label={isSidebarVisible ? "ซ่อนเมนูหลัก" : "แสดงเมนูหลัก"}
            title={isSidebarVisible ? "ซ่อนเมนูหลัก" : "แสดงเมนูหลัก"}
          >
            {isSidebarVisible ? <PanelLeftClose /> : <PanelLeftOpen />}
          </button>
        ) : null}
      </div>

      {shouldShowInlineFilter ? <div className="topbarFilterSlot">{filterMenu}</div> : null}

      {shouldShowCompactFilterToggle ? (
        <div className="topbarCompactFilterSlot">
          <button
            type="button"
            className={`topbarCompactFilterToggle${isFilterMenuOpen ? " open" : ""}`}
            onClick={() => setIsFilterMenuOpen((current) => !current)}
            aria-expanded={isFilterMenuOpen}
            aria-label={isFilterMenuOpen ? "ซ่อนตัวกรอง" : "แสดงตัวกรอง"}
          >
            ตัวกรอง
            <PriceTrackingIcon name="chevron" />
          </button>
        </div>
      ) : null}

      <div className="topbarActions">
        {showUserActions && authUser.role === "admin" ? (
          <button
            type="button"
            className={`topbarIconButton topbarNotificationButton${pendingRequestCount > 0 ? " hasUnread" : ""}`}
            onClick={onOpenAdminNotifications}
            aria-label={
              pendingRequestCount > 0
                ? `มีคำขอสิทธิ์รออนุมัติ ${pendingRequestCount} รายการ`
                : "ยังไม่มีคำขอสิทธิ์ใหม่"
            }
            title={
              pendingRequestCount > 0
                ? `มีคำขอสิทธิ์รออนุมัติ ${pendingRequestCount} รายการ`
                : "ยังไม่มีคำขอสิทธิ์ใหม่"
            }
          >
            <PriceTrackingIcon name="bell" />
            {pendingRequestCount > 0 ? (
              <span className="topbarNotificationCount">
                {pendingRequestCount > 9 ? "9+" : pendingRequestCount}
              </span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          className="topbarIconButton"
          onClick={onToggleTheme}
          aria-label={themeMode === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
          title={themeMode === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
        >
          <PriceTrackingIcon name={themeMode === "dark" ? "sun" : "moon"} />
        </button>
        {showUserActions ? (
        <div className="topbarUserMenu">
          <button
            type="button"
            className="topbarUser"
            aria-expanded={isUserMenuOpen}
            onClick={() => setIsUserMenuOpen((current) => !current)}
          >
            <span className="topbarUserBadge" aria-hidden="true">
              {(authUser.name || "U").slice(0, 1).toUpperCase()}
            </span>
            <span className="topbarUserText">
              <span className="topbarUserName">{authUser.name}</span>
              <strong className="topbarUserRole">{authUser.role}</strong>
            </span>
            <PriceTrackingIcon name="chevron" />
          </button>
          {isUserMenuOpen ? (
            <div className="topbarUserDropdown">
              <div className="topbarUserDropdownHeader">
                <div className="topbarUserDropdownIdentity">
                  <span className="topbarUserDropdownBadge" aria-hidden="true">
                    {(authUser.name || "U").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="topbarUserDropdownCopy">
                    <strong>{authUser.name}</strong>
                    <span>{authUser.email}</span>
                  </div>
                </div>
                <div className="topbarUserDropdownMeta">
                  <span>{authUser.company ?? "Dashboard"}</span>
                  <strong>{authUser.role}</strong>
                </div>
              </div>
              <div className="topbarUserDropdownActions">
                <button
                  type="button"
                  className="topbarUserAction"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenChangePassword();
                  }}
                >
                  เปลี่ยนรหัสผ่าน
                </button>
              </div>
              <button
                type="button"
                className="topbarUserLogout"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onLogout();
                }}
              >
                ออกจากระบบ
              </button>
            </div>
          ) : null}
        </div>
        ) : null}
      </div>

      {shouldShowCompactFilterToggle && isFilterMenuOpen ? (
        <div className="topbarCompactFilterPanel">{filterMenu}</div>
      ) : null}
    </>
  );
}
