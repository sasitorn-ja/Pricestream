import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  Database,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from "../components/ui/pagination";
import {
  appShellClass,
  emptyStateClass,
  fieldGroupClass,
  formLabelClass,
  helperTextClass,
  sectionClass,
  selectClass,
  summaryCardClass,
  tableBaseClass,
  tableWrapClass
} from "../components/ui/styles";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/utils";
import { type AuthUser } from "../services/auth/authUser";
import {
  type AuthAuditLog,
  APP_MENU_LABELS,
  approveAccessRequest,
  createLocalUser,
  type DataOceanTokenStatus,
  deleteAccessRequest,
  deleteLocalUser,
  type EmailDeliveryResult,
  getAdminState,
  getOnlineUsers,
  type OnlineUserRecord,
  updateDataOceanToken,
  updateLocalUser,
  type AdminState,
  type AppMenuKey,
  type CompanyCode
} from "../services/auth/localAuth";

type AdminPanelProps = {
  authUser: AuthUser;
};

const menuOptions: AppMenuKey[] = ["dashboard-cpac", "dashboard-qmix", "admin"];
const DEFAULT_ADMIN_EMAIL = "devcpacadmin@gmail.com";
const ADMIN_TABLE_PAGE_SIZE = 15;
const ALL_MENU_OPTIONS: AppMenuKey[] = [...menuOptions];
const DEFAULT_VALIDITY_DAYS = 360;
const ADMIN_ACTIVE_VIEW_SESSION_KEY = "admin-active-view";
const ADMIN_NOTIFICATIONS_REFRESH_EVENT = "admin-notifications-refresh";
type AdminActiveView = "users" | "online" | "data-ocean";
const EMPTY_DATAOCEAN_STATUS: DataOceanTokenStatus = {
  source: "missing",
  maskedToken: null,
  savedAt: null,
  validityDays: null,
  expiresAt: null,
  daysUsed: null,
  daysRemaining: null,
  status: "missing",
  updatedAt: null,
  updatedBy: null,
  message: "ยังไม่มี DataOcean token ในระบบ กรุณาบันทึกจากหน้า Admin"
};

function toggleMenu(current: AppMenuKey[], menu: AppMenuKey) {
  return current.includes(menu) ? current.filter((item) => item !== menu) : [...current, menu];
}

function getMenuPermissionsForRole(
  role: "admin" | "user",
  current: AppMenuKey[],
  fallback: AppMenuKey
) {
  if (role === "admin") {
    return ALL_MENU_OPTIONS;
  }

  return current.length > 0 ? current : [fallback];
}

function getDefaultMenuForCompany(company: CompanyCode): AppMenuKey {
  return company === "QMIX" ? "dashboard-qmix" : "dashboard-cpac";
}

function isAdminActiveView(value: unknown): value is AdminActiveView {
  return value === "users" || value === "online" || value === "data-ocean";
}

function getStoredAdminActiveView(): AdminActiveView {
  if (typeof window === "undefined") {
    return "users";
  }

  const storedView = window.sessionStorage.getItem(ADMIN_ACTIVE_VIEW_SESSION_KEY);
  return isAdminActiveView(storedView) ? storedView : "users";
}

function notifyAdminSummaryChanged() {
  window.dispatchEvent(new CustomEvent(ADMIN_NOTIFICATIONS_REFRESH_EVENT));
}

function formatAdminDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatAdminDateOnly(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function formatDataOceanSavedAt(value: string, source: DataOceanTokenStatus["source"]) {
  if (source === "env" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatAdminDateOnly(value);
  }

  return formatAdminDate(value);
}

function formatDataOceanStatusLabel(status: DataOceanTokenStatus["status"]) {
  if (status === "healthy") {
    return "พร้อมใช้งาน";
  }
  if (status === "expiring") {
    return "ใกล้หมดอายุ";
  }
  if (status === "expired") {
    return "หมดอายุแล้ว";
  }
  if (status === "invalid") {
    return "ข้อมูล token ใช้งานไม่ได้";
  }
  return "ยังไม่ตั้งค่า";
}

function formatDataOceanSourceLabel(source: DataOceanTokenStatus["source"]) {
  if (source === "db") {
    return "DB กลางของระบบ";
  }
  if (source === "env") {
    return "กำลังใช้ค่าจาก environment";
  }
  return "ยังไม่มี token";
}

function formatMetricDays(value: number | null) {
  return value === null ? "-" : `${value} วัน`;
}

function formatOnlineAge(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) {
    return "เมื่อสักครู่";
  }
  if (seconds < 60) {
    return `${seconds} วินาทีที่แล้ว`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} นาทีที่แล้ว`;
}

function formatCredentialDeliveryMessage(result: EmailDeliveryResult, mode: "approve" | "create") {
  const prefix = mode === "approve" ? "อนุมัติผู้ใช้แล้ว" : "สร้างบัญชีผู้ใช้แล้ว";

  if (result.delivered) {
    return `${prefix} และส่งอีเมลรหัสผ่านให้ผู้ใช้แล้ว`;
  }

  if (result.queued) {
    return `${prefix} และระบบกำลังคิวส่งอีเมลรหัสผ่านให้ผู้ใช้`;
  }

  if (result.provider === "none") {
    return `${prefix} แต่ระบบยังไม่มี email provider`;
  }

  return `${prefix} แต่ส่งอีเมลไม่สำเร็จ${result.reason ? `: ${result.reason}` : ""}`;
}

function formatAuditEventLabel(eventType: AuthAuditLog["eventType"]) {
  if (eventType === "login_success") {
    return "Login สำเร็จ";
  }
  if (eventType === "login_failed") {
    return "Login ไม่สำเร็จ";
  }
  return "Logout";
}

function getAuditEventVariant(eventType: AuthAuditLog["eventType"]) {
  if (eventType === "login_success") {
    return "success" as const;
  }
  if (eventType === "login_failed") {
    return "destructive" as const;
  }
  return "outline" as const;
}

function isPositiveEmailDeliveryResult(result: EmailDeliveryResult) {
  return result.delivered || result.queued;
}

function getAdminPaginationItems(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right)
    .flatMap((page, index, sortedPages) => {
      const previousPage = sortedPages[index - 1];
      return previousPage && page - previousPage > 1 ? ["ellipsis", page] : [page];
    });
}

function SectionIntro({
  eyebrow,
  title,
  description,
  right
}: {
  eyebrow: string;
  title: string;
  description: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-1">
        <p className="sectionEyebrow text-xs font-semibold uppercase tracking-[0.22em]">{eyebrow}</p>
        <h2 className="text-xl font-semibold text-[var(--foreground)]">{title}</h2>
        <p className={helperTextClass}>{description}</p>
      </div>
      {right}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <article className={cn(summaryCardClass, "flex items-center gap-3 p-3")}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--foreground)]">
        {icon}
      </div>
      <div className="min-w-0">
        <span className="block truncate text-xs text-[var(--muted-foreground)]">{label}</span>
        <strong className="mt-0.5 block truncate text-xl font-semibold text-[var(--foreground)]">{value}</strong>
      </div>
    </article>
  );
}

function MenuCheckboxes({
  menus,
  disabled,
  onToggle
}: {
  menus: AppMenuKey[];
  disabled: boolean;
  onToggle: (menu: AppMenuKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {menuOptions.map((menu) => (
        <label
          key={menu}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
            menus.includes(menu)
              ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          <input
            type="checkbox"
            checked={menus.includes(menu)}
            disabled={disabled}
            onChange={() => onToggle(menu)}
            className="size-4 accent-[var(--primary)]"
          />
          <span>{APP_MENU_LABELS[menu]}</span>
        </label>
      ))}
    </div>
  );
}

export function AdminPanel({ authUser }: AdminPanelProps) {
  const [adminState, setAdminState] = useState<AdminState>({
    users: [],
    requests: [],
    authAuditLogs: [],
    dataOceanConfig: EMPTY_DATAOCEAN_STATUS
  });
  const [isLoadingAdminState, setIsLoadingAdminState] = useState(true);
  const [approvalRoleById, setApprovalRoleById] = useState<Record<string, "admin" | "user">>({});
  const [approvalMenusById, setApprovalMenusById] = useState<Record<string, AppMenuKey[]>>({});
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [tokenInput, setTokenInput] = useState("");
  const [validityDaysInput, setValidityDaysInput] = useState(String(DEFAULT_VALIDITY_DAYS));
  const [isSubmittingDataOceanToken, setIsSubmittingDataOceanToken] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createCompany, setCreateCompany] = useState<CompanyCode>("CPAC");
  const [createRole, setCreateRole] = useState<"admin" | "user">("user");
  const [createMenus, setCreateMenus] = useState<AppMenuKey[]>([]);
  const [isSubmittingCreateUser, setIsSubmittingCreateUser] = useState(false);
  const [currentRequestPage, setCurrentRequestPage] = useState(1);
  const [currentUserPage, setCurrentUserPage] = useState(1);
  const [submittingRequestId, setSubmittingRequestId] = useState("");
  const [deletingRequestId, setDeletingRequestId] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState("");
  const [deletingUserId, setDeletingUserId] = useState("");
  const [activeAdminView, setActiveAdminView] = useState<AdminActiveView>(() => getStoredAdminActiveView());
  const [onlineUsers, setOnlineUsers] = useState<OnlineUserRecord[]>([]);
  const [onlineWindowSeconds, setOnlineWindowSeconds] = useState(90);
  const [isLoadingOnlineUsers, setIsLoadingOnlineUsers] = useState(false);
  const [onlineRefreshedAt, setOnlineRefreshedAt] = useState<string | null>(null);

  const requests = adminState.requests;
  const users = adminState.users;
  const authAuditLogs = adminState.authAuditLogs;
  const dataOceanConfig = adminState.dataOceanConfig;
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const adminCount = users.filter((user) => user.role === "admin").length;
  const requestTotalPages = Math.max(1, Math.ceil(pendingRequests.length / ADMIN_TABLE_PAGE_SIZE));
  const resolvedRequestPage = Math.min(currentRequestPage, requestTotalPages);
  const firstRequestIndex =
    pendingRequests.length === 0 ? 0 : (resolvedRequestPage - 1) * ADMIN_TABLE_PAGE_SIZE + 1;
  const lastRequestIndex = Math.min(resolvedRequestPage * ADMIN_TABLE_PAGE_SIZE, pendingRequests.length);
  const visibleRequests = pendingRequests.slice(firstRequestIndex - 1, lastRequestIndex);
  const requestPaginationItems = getAdminPaginationItems(resolvedRequestPage, requestTotalPages);
  const userTotalPages = Math.max(1, Math.ceil(users.length / ADMIN_TABLE_PAGE_SIZE));
  const resolvedUserPage = Math.min(currentUserPage, userTotalPages);
  const firstUserIndex = users.length === 0 ? 0 : (resolvedUserPage - 1) * ADMIN_TABLE_PAGE_SIZE + 1;
  const lastUserIndex = Math.min(resolvedUserPage * ADMIN_TABLE_PAGE_SIZE, users.length);
  const visibleUsers = users.slice(firstUserIndex - 1, lastUserIndex);
  const userPaginationItems = getAdminPaginationItems(resolvedUserPage, userTotalPages);
  const createDefaultMenu = getDefaultMenuForCompany(createCompany);
  const createSelectedMenus = useMemo(
    () => getMenuPermissionsForRole(createRole, createMenus, createDefaultMenu),
    [createDefaultMenu, createMenus, createRole]
  );
  const latestOnlineUser = onlineUsers[0] ?? null;

  const forceRefresh = async () => {
    setIsLoadingAdminState(true);
    try {
      const nextState = await getAdminState();
      setAdminState(nextState);
      setValidityDaysInput(String(nextState.dataOceanConfig.validityDays ?? DEFAULT_VALIDITY_DAYS));
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "โหลดข้อมูล admin ไม่สำเร็จ");
    } finally {
      setIsLoadingAdminState(false);
    }
  };

  useEffect(() => {
    void forceRefresh();
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(ADMIN_ACTIVE_VIEW_SESSION_KEY, activeAdminView);
  }, [activeAdminView]);

  useEffect(() => {
    function handleAdminViewChange(event: Event) {
      const nextView = (event as CustomEvent<unknown>).detail;
      if (isAdminActiveView(nextView)) {
        setActiveAdminView(nextView);
      }
    }

    window.addEventListener("admin-view-change", handleAdminViewChange);
    return () => window.removeEventListener("admin-view-change", handleAdminViewChange);
  }, []);

  useEffect(() => {
    if (activeAdminView !== "online") {
      return;
    }

    let isCancelled = false;
    let hasLoaded = false;

    const loadOnlineUsers = async () => {
      if (!hasLoaded) {
        setIsLoadingOnlineUsers(true);
      }

      try {
        const response = await getOnlineUsers();
        if (!isCancelled) {
          setOnlineUsers(response.users);
          setOnlineWindowSeconds(response.onlineWindowSeconds);
          setOnlineRefreshedAt(new Date().toISOString());
          hasLoaded = true;
        }
      } catch (error) {
        if (!isCancelled) {
          setMessageTone("error");
          setMessage(error instanceof Error ? error.message : "โหลดรายชื่อผู้ใช้ออนไลน์ไม่สำเร็จ");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingOnlineUsers(false);
        }
      }
    };

    void loadOnlineUsers();
    const intervalId = window.setInterval(() => {
      void loadOnlineUsers();
    }, 10_000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeAdminView]);

  const handleApprove = async (requestId: string, company: CompanyCode) => {
    const defaultMenu = getDefaultMenuForCompany(company);
    const selectedRole = approvalRoleById[requestId] ?? "user";
    const menuPermissions = getMenuPermissionsForRole(
      selectedRole,
      approvalMenusById[requestId] ?? [],
      defaultMenu
    );

    setSubmittingRequestId(requestId);
    try {
      const result = await approveAccessRequest(requestId, {
        role: selectedRole,
        menuPermissions
      });

      setAdminState((current) => ({
        ...current,
        users: current.users.some((user) => user.id === result.user.id)
          ? current.users.map((user) => (user.id === result.user.id ? result.user : user))
          : [...current.users, result.user],
        requests: current.requests.filter((request) => request.id !== requestId)
      }));
      setMessageTone(isPositiveEmailDeliveryResult(result.emailDelivery) ? "success" : "error");
      setMessage(formatCredentialDeliveryMessage(result.emailDelivery, "approve"));
      notifyAdminSummaryChanged();
      await forceRefresh();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "อนุมัติผู้ใช้งานไม่สำเร็จ");
    } finally {
      setSubmittingRequestId("");
    }
  };

  const handleDeleteRequest = async (requestId: string, email: string) => {
    if (deletingRequestId === requestId || submittingRequestId === requestId) {
      return;
    }

    const shouldDelete = window.confirm(`ยืนยันการลบคำขอของ ${email}?`);
    if (!shouldDelete) {
      return;
    }

    setDeletingRequestId(requestId);
    try {
      await deleteAccessRequest(requestId);
      setAdminState((current) => ({
        ...current,
        requests: current.requests.filter((request) => request.id !== requestId)
      }));
      setMessageTone("success");
      setMessage(`ลบคำขอของ ${email} แล้ว`);
      notifyAdminSummaryChanged();
      await forceRefresh();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "ลบคำขอไม่สำเร็จ");
    } finally {
      setDeletingRequestId("");
    }
  };

  const handleUserRoleChange = async (userId: string, role: "admin" | "user") => {
    const user = users.find((candidate) => candidate.id === userId);
    if (!user || updatingUserId === userId) {
      return;
    }

    setUpdatingUserId(userId);
    try {
      const updatedUser = await updateLocalUser(userId, {
        role,
        menuPermissions: role === "admin" ? ALL_MENU_OPTIONS : user.menuPermissions
      });
      setAdminState((current) => ({
        ...current,
        users: current.users.map((candidate) => (candidate.id === userId ? updatedUser : candidate))
      }));
      setMessageTone("success");
      setMessage("อัปเดต role แล้ว");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "อัปเดต role ไม่สำเร็จ");
    } finally {
      setUpdatingUserId("");
    }
  };

  const handleUserMenuToggle = async (userId: string, menu: AppMenuKey) => {
    const user = users.find((candidate) => candidate.id === userId);
    if (!user || updatingUserId === userId) {
      return;
    }

    setUpdatingUserId(userId);
    try {
      const updatedUser = await updateLocalUser(userId, {
        role: user.role,
        menuPermissions: toggleMenu(user.menuPermissions, menu)
      });
      setAdminState((current) => ({
        ...current,
        users: current.users.map((candidate) => (candidate.id === userId ? updatedUser : candidate))
      }));
      setMessageTone("success");
      setMessage("อัปเดตเมนูที่ user เห็นได้แล้ว");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "อัปเดตเมนูไม่สำเร็จ");
    } finally {
      setUpdatingUserId("");
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (deletingUserId === userId) {
      return;
    }

    const shouldDelete = window.confirm(`ยืนยันการลบผู้ใช้ ${email} ออกจากระบบ?`);
    if (!shouldDelete) {
      return;
    }

    setDeletingUserId(userId);
    try {
      await deleteLocalUser(userId);
      setAdminState((current) => ({
        ...current,
        users: current.users.filter((user) => user.id !== userId),
        requests: current.requests.filter((request) => request.email !== email)
      }));
      setMessageTone("success");
      setMessage(`ลบผู้ใช้ ${email} ออกจากระบบแล้ว`);
      void forceRefresh();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "ลบผู้ใช้ไม่สำเร็จ");
    } finally {
      setDeletingUserId("");
    }
  };

  const handleDataOceanTokenSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingDataOceanToken) {
      return;
    }

    const nextValidityDays = Number(validityDaysInput);
    setIsSubmittingDataOceanToken(true);
    try {
      const nextStatus = await updateDataOceanToken({
        token: tokenInput,
        validityDays: nextValidityDays
      });
      setAdminState((current) => ({
        ...current,
        dataOceanConfig: nextStatus
      }));
      setValidityDaysInput(String(nextStatus.validityDays ?? DEFAULT_VALIDITY_DAYS));
      setTokenInput("");
      setMessageTone("success");
      setMessage("บันทึก DataOcean token ใหม่แล้ว");
      void forceRefresh();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "บันทึก token ไม่สำเร็จ");
    } finally {
      setIsSubmittingDataOceanToken(false);
    }
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingCreateUser) {
      return;
    }

    setIsSubmittingCreateUser(true);
    try {
      const result = await createLocalUser({
        email: createEmail.trim().toLowerCase(),
        name: createName.trim(),
        company: createCompany,
        role: createRole,
        menuPermissions: getMenuPermissionsForRole(createRole, createMenus, createDefaultMenu)
      });
      setAdminState((current) => ({
        ...current,
        users: current.users.some((user) => user.id === result.user.id)
          ? current.users.map((user) => (user.id === result.user.id ? result.user : user))
          : [...current.users, result.user]
      }));
      setCreateEmail("");
      setCreateName("");
      setCreateRole("user");
      setCreateCompany("CPAC");
      setCreateMenus([]);
      setMessageTone(isPositiveEmailDeliveryResult(result.emailDelivery) ? "success" : "error");
      setMessage(formatCredentialDeliveryMessage(result.emailDelivery, "create"));
      notifyAdminSummaryChanged();
      void forceRefresh();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "สร้างบัญชีไม่สำเร็จ");
    } finally {
      setIsSubmittingCreateUser(false);
    }
  };

  const messageClass =
    messageTone === "error"
      ? "border-[var(--alert-error-border)] bg-[var(--alert-error-bg)] text-[var(--alert-error-text)]"
      : "border-[var(--alert-success-border)] bg-[var(--alert-success-bg)] text-[var(--alert-success-text)]";
  const dataOceanStatusVariant =
    dataOceanConfig.status === "healthy"
      ? "success"
      : dataOceanConfig.status === "expiring"
        ? "warning"
        : dataOceanConfig.status === "expired" || dataOceanConfig.status === "invalid"
          ? "destructive"
          : "outline";

  if (isLoadingAdminState && users.length === 0 && requests.length === 0) {
    return (
      <div className={cn(appShellClass, "adminControl")}>
        <section className={sectionClass}>
          <div className={cn(emptyStateClass, "min-h-[300px]")}>
            <div className="size-12 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" />
            <strong className="mt-4 text-lg text-[var(--foreground)]">กำลังโหลดข้อมูลจากฐานข้อมูล...</strong>
            <span className="mt-2 text-sm text-[var(--muted-foreground)]">ระบบกำลังเตรียมหน้าจัดการผู้ใช้และสิทธิ์</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={cn(appShellClass, "adminControl")}>
      <section className={sectionClass}>
        <SectionIntro
          eyebrow="CPAC Dashboard"
          title="Admin Control Center"
          description={`ดูแลระบบในฐานะ ${authUser.name} จัดการ token, สิทธิ์ผู้ใช้ และคำขอเข้าใช้งานจากหน้าเดียว`}
          right={
            <Badge variant="outline" className="self-start">
              {pendingRequests.length} คำขอรออนุมัติ
            </Badge>
          }
        />

        {message ? <div className={cn("rounded-2xl border px-4 py-3 text-sm", messageClass)}>{message}</div> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant={activeAdminView === "users" ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setActiveAdminView("users")}
          >
            <Users className="size-4" />
            ผู้ใช้และคำขอ
          </Button>
          <Button
            variant={activeAdminView === "online" ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setActiveAdminView("online")}
          >
            <Activity className="size-4" />
            ออนไลน์ตอนนี้
          </Button>
          <Button
            variant={activeAdminView === "data-ocean" ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setActiveAdminView("data-ocean")}
          >
            <Database className="size-4" />
            DataOcean Token
          </Button>
        </div>

        {activeAdminView === "users" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <StatCard icon={<Mail className="size-5" />} label="คำขอรออนุมัติ" value={pendingRequests.length} />
            <StatCard icon={<Users className="size-5" />} label="ผู้ใช้งานทั้งหมด" value={users.length} />
            <StatCard icon={<ShieldCheck className="size-5" />} label="ผู้ดูแลระบบ" value={adminCount} />
          </div>
        ) : null}

        {activeAdminView === "online" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <StatCard icon={<Activity className="size-5" />} label="ออนไลน์ตอนนี้" value={onlineUsers.length} />
            <StatCard icon={<Users className="size-5" />} label="จากผู้ใช้ทั้งหมด" value={users.length} />
            <StatCard
              icon={<RefreshCw className="size-5" />}
              label="อัปเดตล่าสุด"
              value={onlineRefreshedAt ? formatOnlineAge(onlineRefreshedAt) : "-"}
            />
          </div>
        ) : null}

        {isLoadingAdminState ? (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">กำลังโหลดข้อมูลจากฐานข้อมูล...</p>
        ) : null}
      </section>

      {activeAdminView === "online" ? (
      <section className={sectionClass}>
        <SectionIntro
          eyebrow="Realtime Presence"
          title="ผู้ใช้ออนไลน์ตอนนี้"
          description={`นับจาก heartbeat ล่าสุดภายใน ${onlineWindowSeconds} วินาที เห็นเฉพาะผู้ดูแลระบบเท่านั้น`}
          right={
            <Button
              variant="outline"
              size="sm"
              disabled={isLoadingOnlineUsers}
              onClick={async () => {
                setIsLoadingOnlineUsers(true);
                try {
                  const response = await getOnlineUsers();
                  setOnlineUsers(response.users);
                  setOnlineWindowSeconds(response.onlineWindowSeconds);
                  setOnlineRefreshedAt(new Date().toISOString());
                } catch (error) {
                  setMessageTone("error");
                  setMessage(error instanceof Error ? error.message : "โหลดรายชื่อผู้ใช้ออนไลน์ไม่สำเร็จ");
                } finally {
                  setIsLoadingOnlineUsers(false);
                }
              }}
            >
              <RefreshCw className={cn("size-4", isLoadingOnlineUsers && "animate-spin")} />
              รีเฟรช
            </Button>
          }
        />

        {latestOnlineUser ? (
          <div className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)]">
                <Activity className="size-5 text-[var(--foreground)]" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  ล่าสุด: {latestOnlineUser.name} ({latestOnlineUser.email})
                </p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  เห็นเมื่อ {formatOnlineAge(latestOnlineUser.lastSeenAt)}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {isLoadingOnlineUsers && onlineUsers.length === 0 ? (
          <div className={cn(emptyStateClass, "min-h-[10rem] py-6")}>
            <div className="size-10 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" />
            <strong className="mt-3 text-base text-[var(--foreground)]">กำลังโหลดรายชื่อออนไลน์...</strong>
          </div>
        ) : onlineUsers.length === 0 ? (
          <div className={cn(emptyStateClass, "min-h-[10rem] py-6")}>
            <strong className="text-base text-[var(--foreground)]">ยังไม่มีผู้ใช้ออนไลน์</strong>
            <span className="mt-1 text-sm text-[var(--muted-foreground)]">
              ผู้ใช้จะปรากฏเมื่อเปิดหน้า dashboard หรือ admin อยู่ในช่วงเวลาล่าสุด
            </span>
          </div>
        ) : (
          <div className={tableWrapClass}>
            <div className="overflow-x-auto">
              <table className={tableBaseClass}>
                <thead className="bg-[var(--surface-strong)] text-left">
                  <tr className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                    <th className="px-3 py-3">ผู้ใช้งาน</th>
                    <th className="px-3 py-3">บริษัท</th>
                    <th className="px-3 py-3">สิทธิ์</th>
                    <th className="px-3 py-3">เห็นล่าสุด</th>
                    <th className="px-3 py-3">IP</th>
                    <th className="px-3 py-3">อุปกรณ์</th>
                  </tr>
                </thead>
                <tbody>
                  {onlineUsers.map((user) => (
                    <tr key={user.id} className="border-t border-[var(--border)] align-top">
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] font-semibold text-[var(--foreground)]">
                            {user.company === "QMIX" ? "Q" : "C"}
                          </div>
                          <div className="space-y-1">
                            <strong className="block text-sm text-[var(--foreground)]">{user.name}</strong>
                            <span className="block text-sm text-[var(--muted-foreground)]">{user.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="secondary">{user.company}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={user.role === "admin" ? "success" : "outline"}>
                          {user.role === "admin" ? "Admin" : "User"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-sm text-[var(--muted-foreground)]">
                        <span className="block text-[var(--foreground)]">{formatOnlineAge(user.lastSeenAt)}</span>
                        <span className="block text-xs">{formatAdminDate(user.lastSeenAt)}</span>
                      </td>
                      <td className="px-3 py-3 text-sm text-[var(--muted-foreground)]">
                        {user.ipAddress ?? "-"}
                      </td>
                      <td className="px-3 py-3 text-sm text-[var(--muted-foreground)]">
                        <span className="block max-w-[420px] truncate">{user.userAgent ?? "-"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      ) : null}

      {activeAdminView === "data-ocean" ? (
      <section className={sectionClass}>
        <SectionIntro
          eyebrow="ตั้งค่าระบบ"
          title="DataOcean Token"
          description="จัดการ token กลางสำหรับทุกคนในระบบ พร้อมติดตามอายุการใช้งานและวันหมดอายุ"
          right={
            <Badge variant={dataOceanStatusVariant} className="self-start">
              {formatDataOceanStatusLabel(dataOceanConfig.status)}
            </Badge>
          }
        />

        <div className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)]">
              <Database className="size-5 text-[var(--foreground)]" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--foreground)]">{dataOceanConfig.message}</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                แหล่งข้อมูลที่กำลังใช้งาน: {formatDataOceanSourceLabel(dataOceanConfig.source)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-6">
          <article className={cn(summaryCardClass, "p-3")}>
            <span className="text-sm text-[var(--muted-foreground)]">Token ปัจจุบัน</span>
            <strong className="mt-1 block text-base font-semibold text-[var(--foreground)]">
              {dataOceanConfig.maskedToken ?? "-"}
            </strong>
          </article>
          <article className={cn(summaryCardClass, "p-3")}>
            <span className="text-sm text-[var(--muted-foreground)]">เริ่มใช้งานล่าสุด</span>
            <strong className="mt-1 block text-base font-semibold text-[var(--foreground)]">
              {dataOceanConfig.savedAt
                ? formatDataOceanSavedAt(dataOceanConfig.savedAt, dataOceanConfig.source)
                : "-"}
            </strong>
          </article>
          <article className={cn(summaryCardClass, "p-3")}>
            <span className="text-sm text-[var(--muted-foreground)]">วันหมดอายุ</span>
            <strong className="mt-1 block text-base font-semibold text-[var(--foreground)]">
              {dataOceanConfig.expiresAt ? formatAdminDateOnly(dataOceanConfig.expiresAt) : "-"}
            </strong>
          </article>
          <article className={cn(summaryCardClass, "p-3")}>
            <span className="text-sm text-[var(--muted-foreground)]">ใช้ไปแล้ว</span>
            <strong className="mt-1 block text-base font-semibold text-[var(--foreground)]">
              {formatMetricDays(dataOceanConfig.daysUsed)}
            </strong>
          </article>
          <article className={cn(summaryCardClass, "p-3")}>
            <span className="text-sm text-[var(--muted-foreground)]">วันคงเหลือ</span>
            <strong className="mt-1 block text-base font-semibold text-[var(--foreground)]">
              {formatMetricDays(dataOceanConfig.daysRemaining)}
            </strong>
          </article>
          <article className={cn(summaryCardClass, "p-3")}>
            <span className="text-sm text-[var(--muted-foreground)]">แก้ล่าสุดโดย</span>
            <strong className="mt-1 block text-base font-semibold text-[var(--foreground)]">
              {dataOceanConfig.updatedBy ?? "-"}
            </strong>
          </article>
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleDataOceanTokenSubmit}>
          <label className={fieldGroupClass}>
            <span className={formLabelClass}>DataOcean token ใหม่</span>
            <Textarea
              value={tokenInput}
              disabled={isSubmittingDataOceanToken}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="วาง DataOcean token ที่ต้องการใช้กับทุกคนในระบบ"
              rows={2}
              required
            />
          </label>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,14rem)_1fr]">
            <label className={fieldGroupClass}>
              <span className={formLabelClass}>อายุ token (วัน)</span>
              <Input
                type="number"
                min={1}
                value={validityDaysInput}
                disabled={isSubmittingDataOceanToken}
                onChange={(event) => setValidityDaysInput(event.target.value)}
                required
              />
            </label>

            <div className="flex flex-col gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">
                ระบบจะบันทึกวันเริ่มใช้ token ให้เองตอนกดบันทึก ไม่ต้องกรอกวันเอง
              </p>
              <Button
                variant="outline"
                className="shrink-0"
                disabled={isLoadingAdminState || isSubmittingDataOceanToken}
                onClick={() => void forceRefresh()}
              >
                <RefreshCw className="size-4" />
                รีเฟรชสถานะ
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmittingDataOceanToken}>
              {isSubmittingDataOceanToken ? "กำลังบันทึก token..." : "บันทึก token"}
            </Button>
          </div>
        </form>
      </section>
      ) : null}

      {activeAdminView === "users" ? (
      <>
      <section className={sectionClass}>
        <SectionIntro
          eyebrow="สร้างบัญชีใหม่"
          title="สร้างบัญชีผู้ใช้ใหม่"
          description="สร้างบัญชีได้ทันทีจากหน้า Admin โดยไม่ต้องรอคำขอสิทธิ์ก่อน"
        />

        <form className="space-y-3" onSubmit={handleCreateUser}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className={fieldGroupClass}>
              <span className={formLabelClass}>อีเมลผู้ใช้</span>
              <Input
                type="email"
                value={createEmail}
                disabled={isSubmittingCreateUser}
                onChange={(event) => setCreateEmail(event.target.value)}
                placeholder="your.email@scg.com"
                autoComplete="email"
                required
              />
            </label>
            <label className={fieldGroupClass}>
              <span className={formLabelClass}>ชื่อผู้ใช้งาน</span>
              <Input
                value={createName}
                disabled={isSubmittingCreateUser}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="ชื่อผู้ใช้"
                autoComplete="name"
                required
              />
            </label>
            <label className={fieldGroupClass}>
              <span className={formLabelClass}>บริษัท</span>
              <select
                value={createCompany}
                disabled={isSubmittingCreateUser}
                onChange={(event) => setCreateCompany(event.target.value as CompanyCode)}
                className={selectClass}
              >
                <option value="CPAC">CPAC</option>
                <option value="QMIX">QMIX</option>
              </select>
            </label>
            <label className={fieldGroupClass}>
              <span className={formLabelClass}>สิทธิ์ผู้ใช้</span>
              <select
                value={createRole}
                disabled={isSubmittingCreateUser}
                onChange={(event) => setCreateRole(event.target.value as "admin" | "user")}
                className={selectClass}
              >
                <option value="user">ผู้ใช้งาน</option>
                <option value="admin">ผู้ดูแลระบบ</option>
              </select>
            </label>
          </div>

          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm leading-6 text-[var(--muted-foreground)]">
            ถ้าเป็นการใช้งานครั้งแรก ระบบจะสร้างรหัสผ่านชั่วคราวและส่งให้ทางอีเมลที่ระบุทันที
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--foreground)]">เมนูที่เห็นได้หลังสร้างบัญชี</p>
            <MenuCheckboxes
              menus={createSelectedMenus}
              disabled={isSubmittingCreateUser || createRole === "admin"}
              onToggle={(menu) => setCreateMenus((current) => toggleMenu(current, menu))}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmittingCreateUser}>
              {isSubmittingCreateUser ? "กำลังสร้างบัญชี..." : "สร้างบัญชี"}
            </Button>
          </div>
        </form>
      </section>

      <section className={sectionClass}>
        <SectionIntro
          eyebrow="คำขอเข้าใช้งาน"
          title="คำขอเข้าใช้งาน"
          description="รายการผู้ใช้ใหม่ที่ส่งคำขอเข้ามาและรอให้ผู้ดูแลอนุมัติ"
        />

        <div className="space-y-4">
          {pendingRequests.length === 0 ? (
            <div className={cn(emptyStateClass, "min-h-[10rem] py-6")}>
              <Check className="size-8 text-emerald-300" />
              <strong className="mt-3 text-base text-[var(--foreground)]">ไม่มีคำขอใหม่</strong>
              <span className="mt-1 text-sm text-[var(--muted-foreground)]">
                เมื่อมีคนขอสิทธิ์เข้าใช้งาน รายการจะมาอยู่ตรงนี้
              </span>
            </div>
          ) : null}

          {visibleRequests.map((request) => {
            const selectedRole = approvalRoleById[request.id] ?? "user";
            const defaultMenu = getDefaultMenuForCompany(request.company);
            const selectedMenus = getMenuPermissionsForRole(
              selectedRole,
              approvalMenusById[request.id] ?? [],
              defaultMenu
            );

            return (
              <article
                key={request.id}
                className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] font-semibold text-[var(--foreground)]">
                      {request.company === "QMIX" ? "Q" : "C"}
                    </div>
                    <div className="space-y-1">
                      <strong className="block text-lg text-[var(--foreground)]">{request.name}</strong>
                      <span className="block text-sm text-[var(--muted-foreground)]">{request.email}</span>
                      <small className="block text-xs text-[var(--muted-foreground)]">
                        ส่งคำขอ {formatAdminDate(request.createdAt)}
                      </small>
                    </div>
                  </div>
                  <Badge variant="secondary" className="self-start">
                    {request.company}
                  </Badge>
                </div>

                <div className="mt-3 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
                  ระบบจะสร้างรหัสผ่านชั่วคราวและส่งไปที่ <strong className="text-[var(--foreground)]">{request.email}</strong> หลังจากอนุมัติ
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className={fieldGroupClass}>
                    <span className={formLabelClass}>สิทธิ์ผู้ใช้</span>
                    <select
                      value={selectedRole}
                      disabled={submittingRequestId === request.id || deletingRequestId === request.id}
                      onChange={(event) =>
                        setApprovalRoleById((current) => {
                          const nextRole = event.target.value as "admin" | "user";
                          setApprovalMenusById((menus) => ({
                            ...menus,
                            [request.id]: getMenuPermissionsForRole(
                              nextRole,
                              menus[request.id] ?? [],
                              defaultMenu
                            )
                          }));
                          return {
                            ...current,
                            [request.id]: nextRole
                          };
                        })
                      }
                      className={selectClass}
                    >
                      <option value="user">ผู้ใช้งาน</option>
                      <option value="admin">ผู้ดูแลระบบ</option>
                    </select>
                  </label>
                </div>

                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">เมนูที่เห็นได้</p>
                  <MenuCheckboxes
                    menus={selectedMenus}
                    disabled={
                      submittingRequestId === request.id ||
                      deletingRequestId === request.id ||
                      selectedRole === "admin"
                    }
                    onToggle={(menu) =>
                      setApprovalMenusById((current) => ({
                        ...current,
                        [request.id]: toggleMenu(current[request.id] ?? [], menu)
                      }))
                    }
                  />
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="destructive"
                    disabled={submittingRequestId === request.id || deletingRequestId === request.id}
                    onClick={() => void handleDeleteRequest(request.id, request.email)}
                  >
                    <Trash2 className="size-4" />
                    {deletingRequestId === request.id ? "กำลังลบ..." : "ลบคำขอ"}
                  </Button>
                  <Button
                    disabled={submittingRequestId === request.id || deletingRequestId === request.id}
                    onClick={() => void handleApprove(request.id, request.company)}
                  >
                    {submittingRequestId === request.id ? "กำลังอนุมัติ..." : "อนุมัติและส่งรหัสผ่าน"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        {pendingRequests.length > ADMIN_TABLE_PAGE_SIZE ? (
          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <span className="text-sm text-[var(--muted-foreground)]">
              แสดง {firstRequestIndex}-{lastRequestIndex} จาก {pendingRequests.length} คำขอ
            </span>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    type="button"
                    disabled={resolvedRequestPage === 1}
                    onClick={() => setCurrentRequestPage((page) => Math.max(1, page - 1))}
                  />
                </PaginationItem>
                {requestPaginationItems.map((item, index) => (
                  <PaginationItem key={typeof item === "number" ? item : `request-ellipsis-${index}`}>
                    {item === "ellipsis" ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        type="button"
                        isActive={resolvedRequestPage === item}
                        onClick={() => setCurrentRequestPage(item)}
                      >
                        {item}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    type="button"
                    disabled={resolvedRequestPage === requestTotalPages}
                    onClick={() => setCurrentRequestPage((page) => Math.min(requestTotalPages, page + 1))}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </section>

      <section className={sectionClass}>
        <SectionIntro
          eyebrow="รายชื่อผู้ใช้งาน"
          title="จัดการสิทธิ์ผู้ใช้"
          description="แก้ role, เมนูที่มองเห็นได้ และลบบัญชีจากตารางเดียว"
        />

        <p className="mb-3 text-sm text-[var(--muted-foreground)]">
          บัญชีผู้ดูแลระบบคนสุดท้ายจะถูกป้องกันไม่ให้ลดสิทธิ์หรือลบออก
        </p>

        <div className={tableWrapClass}>
          <div className="overflow-x-auto">
            <table className={tableBaseClass}>
              <thead className="bg-[var(--surface-strong)] text-left">
                <tr className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  <th className="px-3 py-3">ผู้ใช้งาน</th>
                  <th className="px-3 py-3">บริษัท</th>
                  <th className="px-3 py-3">สิทธิ์ผู้ใช้</th>
                  <th className="px-3 py-3">เมนูที่เห็นได้</th>
                  <th className="px-3 py-3">อัปเดตล่าสุด</th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => {
                  const isDefaultAdmin = user.id === "admin-local" || user.email === DEFAULT_ADMIN_EMAIL;
                  const isLastAdmin = user.role === "admin" && adminCount <= 1;
                  const disableDelete = isDefaultAdmin || isLastAdmin || deletingUserId === user.id;
                  const disableRoleEdit = updatingUserId === user.id || isLastAdmin;
                  const disableMenuEdit = updatingUserId === user.id || user.role === "admin";
                  return (
                    <tr key={user.id} className="border-t border-[var(--border)] align-top">
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] font-semibold text-[var(--foreground)]">
                            {user.company === "QMIX" ? "Q" : "C"}
                          </div>
                          <div className="space-y-1">
                            <strong className="block text-sm text-[var(--foreground)]">{user.name}</strong>
                            <span className="block text-sm text-[var(--muted-foreground)]">{user.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="secondary">{user.company}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div>
                          <select
                            value={user.role}
                            disabled={disableRoleEdit}
                            onChange={(event) =>
                              handleUserRoleChange(user.id, event.target.value as "admin" | "user")
                            }
                            className={selectClass}
                          >
                            <option value="user">ผู้ใช้งาน</option>
                            <option value="admin">ผู้ดูแลระบบ</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div>
                          <MenuCheckboxes
                            menus={
                              user.role === "admin"
                                ? ALL_MENU_OPTIONS
                                : user.menuPermissions
                            }
                            disabled={disableMenuEdit}
                            onToggle={(menu) => void handleUserMenuToggle(user.id, menu)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-[var(--muted-foreground)]">
                        {formatAdminDate(user.updatedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={disableDelete}
                          onClick={() => void handleDeleteUser(user.id, user.email)}
                        >
                          <Trash2 className="size-4" />
                          {deletingUserId === user.id ? "กำลังลบ..." : "ลบผู้ใช้"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {users.length > ADMIN_TABLE_PAGE_SIZE ? (
          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <span className="text-sm text-[var(--muted-foreground)]">
              แสดง {firstUserIndex}-{lastUserIndex} จาก {users.length} บัญชี
            </span>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    type="button"
                    disabled={resolvedUserPage === 1}
                    onClick={() => setCurrentUserPage((page) => Math.max(1, page - 1))}
                  />
                </PaginationItem>
                {userPaginationItems.map((item, index) => (
                  <PaginationItem key={typeof item === "number" ? item : `user-ellipsis-${index}`}>
                    {item === "ellipsis" ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        type="button"
                        isActive={resolvedUserPage === item}
                        onClick={() => setCurrentUserPage(item)}
                      >
                        {item}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    type="button"
                    disabled={resolvedUserPage === userTotalPages}
                    onClick={() => setCurrentUserPage((page) => Math.min(userTotalPages, page + 1))}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </section>

      <section className={sectionClass}>
        <SectionIntro
          eyebrow="ประวัติการเข้าใช้งาน"
          title="Recent Login Activity"
          description="แสดงรายการล่าสุดว่าใครเข้าใช้งานหรือออกจากระบบเมื่อใด พร้อม IP และอุปกรณ์เบื้องต้น"
        />

        {authAuditLogs.length === 0 ? (
          <div className={cn(emptyStateClass, "min-h-[10rem] py-6")}>
            <strong className="text-base text-[var(--foreground)]">ยังไม่มีประวัติการเข้าใช้งาน</strong>
            <span className="mt-1 text-sm text-[var(--muted-foreground)]">
              เมื่อมีการ login หรือ logout รายการจะมาแสดงที่ส่วนนี้
            </span>
          </div>
        ) : (
          <div className={tableWrapClass}>
            <div className="overflow-x-auto">
              <table className={tableBaseClass}>
                <thead className="bg-[var(--surface-strong)] text-left">
                  <tr className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                    <th className="px-3 py-3">เวลา</th>
                    <th className="px-3 py-3">เหตุการณ์</th>
                    <th className="px-3 py-3">ผู้ใช้</th>
                    <th className="px-3 py-3">IP</th>
                    <th className="px-3 py-3">อุปกรณ์</th>
                  </tr>
                </thead>
                <tbody>
                  {authAuditLogs.map((log) => (
                    <tr key={log.id} className="border-t border-[var(--border)] align-top">
                      <td className="px-3 py-3 text-sm text-[var(--muted-foreground)]">
                        {formatAdminDate(log.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={getAuditEventVariant(log.eventType)}>
                          {formatAuditEventLabel(log.eventType)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <strong className="block text-sm text-[var(--foreground)]">
                            {log.email ?? log.userId ?? "-"}
                          </strong>
                          {log.userId ? (
                            <span className="block text-xs text-[var(--muted-foreground)]">{log.userId}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-[var(--muted-foreground)]">
                        {log.ipAddress ?? "-"}
                      </td>
                      <td className="px-3 py-3 text-sm text-[var(--muted-foreground)]">
                        <span className="block max-w-[420px] truncate">{log.userAgent ?? "-"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      </>
      ) : null}
    </div>
  );
}
