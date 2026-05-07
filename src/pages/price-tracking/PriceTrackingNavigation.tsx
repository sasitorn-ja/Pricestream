import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { type AuthUser } from "../../services/auth/authUser";

const COMPACT_FILTER_BREAKPOINT = 1180;

function getRoleLabel(role: string) {
  return role === "admin" ? "ผู้ดูแลระบบ" : "ผู้ใช้งาน";
}

type PriceTrackingNavigationProps = {
  authUser: AuthUser;
  isSidebarCollapsed: boolean;
  isMobileViewport?: boolean;
  isMobileSidebarOpen?: boolean;
  onToggleSidebar: () => void;
  onLogout: () => void;
  onOpenChangePassword: () => void;
  filterMenu?: ReactNode;
  showSidebarToggle?: boolean;
  showUserActions?: boolean;
};

export function PriceTrackingNavigation({
  authUser,
  isSidebarCollapsed,
  isMobileViewport = false,
  isMobileSidebarOpen = false,
  onToggleSidebar,
  onLogout,
  onOpenChangePassword,
  filterMenu,
  showSidebarToggle = true,
  showUserActions = true
}: PriceTrackingNavigationProps) {
  const [isCompactFilterScreen, setIsCompactFilterScreen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const wasCompactFilterScreenRef = useRef(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const shouldShowInlineFilter = Boolean(filterMenu) && !isCompactFilterScreen;
  const shouldShowCompactFilterToggle = Boolean(filterMenu) && isCompactFilterScreen;
  const isSidebarVisible = isMobileViewport ? isMobileSidebarOpen : !isSidebarCollapsed;

  return (
    <div className="min-w-0">
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex h-11 items-center gap-2">
          {showSidebarToggle ? (
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-[15px] bg-[var(--surface)] shadow-none"
              onClick={onToggleSidebar}
              aria-label={isSidebarVisible ? "ซ่อนเมนูหลัก" : "แสดงเมนูหลัก"}
              title={isSidebarVisible ? "ซ่อนเมนูหลัก" : "แสดงเมนูหลัก"}
            >
              {isSidebarVisible ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
            </Button>
          ) : null}

          {shouldShowCompactFilterToggle ? (
            <Button
              variant="outline"
              className={cn("h-11 rounded-[15px] px-4 text-sm shadow-none", isFilterMenuOpen && "border-[var(--border-strong)]")}
              onClick={() => setIsFilterMenuOpen((current) => !current)}
              aria-expanded={isFilterMenuOpen}
              aria-label={isFilterMenuOpen ? "ซ่อนตัวกรอง" : "แสดงตัวกรอง"}
            >
              ตัวกรอง
              <ChevronDown className={cn("size-4 transition", isFilterMenuOpen && "rotate-180")} />
            </Button>
          ) : null}
        </div>

        {shouldShowInlineFilter ? (
          <div className="min-w-0">
            {filterMenu}
          </div>
        ) : (
          <div className="min-w-0" />
        )}

        <div className="flex max-w-full items-center justify-end gap-2">
          {showUserActions ? (
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                className="flex h-11 max-w-[min(15rem,calc(100vw-7.5rem))] items-center gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--shell-hover)] sm:px-3"
                aria-expanded={isUserMenuOpen}
                onClick={() => setIsUserMenuOpen((current) => !current)}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface-strong)] text-sm font-semibold text-[var(--foreground)] sm:size-8 sm:rounded-[12px]">
                  {(authUser.name || "U").slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-sm font-medium text-[var(--foreground)]">{authUser.name}</span>
                  <strong className="block truncate text-xs font-semibold text-[var(--muted-foreground)]">
                    {getRoleLabel(authUser.role)}
                  </strong>
                </span>
                <ChevronDown className={cn("size-4 text-[var(--muted-foreground)] transition", isUserMenuOpen && "rotate-180")} />
              </button>
              {isUserMenuOpen ? (
                <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[18px] border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-[0_24px_60px_var(--shadow-color)]">
                  <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--surface-strong)] text-base font-semibold text-[var(--foreground)]">
                        {(authUser.name || "U").slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-[var(--foreground)]">{authUser.name}</strong>
                        <span className="block truncate text-sm text-[var(--muted-foreground)]">{authUser.email}</span>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--muted-foreground)]">
                            {authUser.company ?? "ระบบกลาง"}
                          </span>
                          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--muted-foreground)]">
                            {getRoleLabel(authUser.role)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      variant="outline"
                      className="justify-start"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenChangePassword();
                      }}
                    >
                      เปลี่ยนรหัสผ่าน
                    </Button>
                    <Button
                      variant="destructive"
                      className="justify-start"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onLogout();
                      }}
                    >
                      ออกจากระบบ
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {shouldShowCompactFilterToggle && isFilterMenuOpen ? (
        <div className="mt-2 rounded-[18px] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] p-3">
          {filterMenu}
        </div>
      ) : null}
    </div>
  );
}
