import { LEGACY_AUTH_TOKEN_STORAGE_KEY } from "../../../shared/appConfig";
import { type AuthUser } from "./authUser";

export type CompanyCode = "CPAC" | "QMIX";
export type AppMenuKey = "dashboard-cpac" | "dashboard-qmix" | "admin";

export type LocalAccessRequest = {
  id: string;
  email: string;
  name: string;
  company: CompanyCode;
  status: "pending" | "approved";
  createdAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
};

export type LocalUserRecord = {
  id: string;
  email: string;
  name: string;
  company: CompanyCode;
  role: "admin" | "user";
  menuPermissions: AppMenuKey[];
  createdAt: string;
  updatedAt: string;
};

export type AuthAuditLog = {
  id: string;
  userId: string | null;
  email: string | null;
  eventType: "login_success" | "login_failed" | "logout";
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type OnlineUserRecord = {
  id: string;
  email: string;
  name: string;
  company: CompanyCode;
  role: "admin" | "user";
  menuPermissions: AppMenuKey[];
  lastSeenAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type OnlineUsersResponse = {
  onlineWindowSeconds: number;
  users: OnlineUserRecord[];
};

export type EmailDeliveryResult = {
  delivered: boolean;
  provider: "smtp" | "none";
  queued?: boolean;
  reason?: string;
};

export type DataOceanTokenStatus = {
  source: "db" | "env" | "missing";
  maskedToken: string | null;
  savedAt: string | null;
  validityDays: number | null;
  expiresAt: string | null;
  daysUsed: number | null;
  daysRemaining: number | null;
  status: "healthy" | "expiring" | "expired" | "missing" | "invalid";
  updatedAt: string | null;
  updatedBy: string | null;
  message: string;
};

type ApproveAccessRequestResponse =
  | { user: LocalUserRecord; emailDelivery?: EmailDeliveryResult }
  | LocalUserRecord;

type CreateLocalUserResponse = {
  user: LocalUserRecord;
  emailDelivery?: EmailDeliveryResult;
};

export type AdminState = {
  users: LocalUserRecord[];
  requests: LocalAccessRequest[];
  authAuditLogs: AuthAuditLog[];
  dataOceanConfig: DataOceanTokenStatus;
};

export type AdminNotificationSummary = {
  pendingRequestCount: number;
  dataOceanTokenAlert: boolean;
  dataOceanTokenStatus: DataOceanTokenStatus["status"];
  dataOceanDaysRemaining: number | null;
  dataOceanExpiresAt: string | null;
};

export type AuthBootstrapResult = {
  status: "authenticated" | "anonymous" | "timeout" | "server_error";
  user?: AuthUser | null;
  message?: string;
  source?: "server" | "session-cache";
};

type AuthSessionResponse =
  | {
      authenticated: true;
      user: AuthUser;
    }
  | {
      authenticated: false;
      user?: null;
    };

export const APP_MENU_LABELS: Record<AppMenuKey, string> = {
  "dashboard-cpac": "Dashboard ติดตามการขึ้นราคา (CPAC)",
  "dashboard-qmix": "Dashboard ติดตามการขึ้นราคา (QMIX)",
  admin: "Admin"
};

class HttpRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpRequestError";
    this.status = status;
  }
}

const AUTH_BOOTSTRAP_TIMEOUT_MS = 5000;
const AUTH_REQUEST_TIMEOUT_MS = 30000;
const AUTH_EMAIL_REQUEST_TIMEOUT_MS = 90000;

type RequestJsonOptions = RequestInit & {
  timeoutMs?: number;
};
const AUTH_SESSION_CACHE_KEY = "cpac-dashboard-auth-session-cache";

function getLegacyAuthToken() {
  return window.localStorage.getItem(LEGACY_AUTH_TOKEN_STORAGE_KEY) ?? "";
}

function clearLegacyAuthToken() {
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_STORAGE_KEY);
}

function readCachedAuthUser() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(AUTH_SESSION_CACHE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as AuthUser | null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedAuthUser(user: AuthUser) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(AUTH_SESSION_CACHE_KEY, JSON.stringify(user));
}

function clearCachedAuthUser() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(AUTH_SESSION_CACHE_KEY);
}

async function requestJson<T>(url: string, options: RequestJsonOptions = {}) {
  const legacyToken = getLegacyAuthToken();
  const headers = new Headers(options.headers);
  const { timeoutMs = AUTH_REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  headers.set("Content-Type", "application/json");
  if (legacyToken) {
    headers.set("Authorization", `Bearer ${legacyToken}`);
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = fetchOptions.signal
    ? AbortSignal.any([fetchOptions.signal, timeoutSignal])
    : timeoutSignal;

  const response = await fetch(url, {
    ...fetchOptions,
    credentials: "include",
    headers,
    signal: requestSignal
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error || message;
    } catch {
      // Keep status message.
    }
    throw new HttpRequestError(message, response.status);
  }

  return response.json() as Promise<T>;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function normalizeEmailDeliveryResult(result: unknown): EmailDeliveryResult {
  if (
    typeof result === "object" &&
    result !== null &&
    "delivered" in result &&
    typeof (result as { delivered?: unknown }).delivered === "boolean"
  ) {
    const candidate = result as {
      delivered: boolean;
      queued?: unknown;
      provider?: unknown;
      reason?: unknown;
    };

    return {
      delivered: candidate.delivered,
      queued: typeof candidate.queued === "boolean" ? candidate.queued : undefined,
      provider: candidate.provider === "smtp" || candidate.provider === "none" ? candidate.provider : "none",
      reason: typeof candidate.reason === "string" ? candidate.reason : undefined
    };
  }

  return {
    delivered: false,
    queued: false,
    provider: "none",
    reason: "Server ยังไม่ได้ส่งสถานะอีเมลกลับมา"
  };
}

export function bootstrapLocalAuth() {
  // Database schema is initialized by the backend on the first auth API request.
}

export async function registerAccessRequest(input: {
  email: string;
  name: string;
  company: CompanyCode;
}) {
  return requestJson<LocalAccessRequest>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function loginWithEmailPassword(email: string, password: string) {
  const user = await requestJson<AuthUser>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  clearLegacyAuthToken();
  writeCachedAuthUser(user);
  return user;
}

export async function getCurrentLocalAuthUser(): Promise<AuthBootstrapResult> {
  try {
    const response = await requestJson<AuthSessionResponse>("/api/auth/me", {
      timeoutMs: AUTH_BOOTSTRAP_TIMEOUT_MS
    });
    clearLegacyAuthToken();

    if (response.authenticated) {
      writeCachedAuthUser(response.user);
      if (import.meta.env.DEV) {
        console.debug("[auth-bootstrap] authenticated");
      }
      return {
        status: "authenticated",
        user: response.user,
        source: "server"
      };
    }

    clearCachedAuthUser();
    if (import.meta.env.DEV) {
      console.debug("[auth-bootstrap] anonymous");
    }
    return {
      status: "anonymous",
      user: null,
      source: "server"
    };
  } catch (error) {
    if (error instanceof HttpRequestError && error.status === 401) {
      clearLegacyAuthToken();
      clearCachedAuthUser();
      if (import.meta.env.DEV) {
        console.debug("[auth-bootstrap] anonymous (401)");
      }
      return {
        status: "anonymous",
        user: null,
        source: "server"
      };
    }

    if (error instanceof HttpRequestError && error.status >= 500) {
      const cachedUser = readCachedAuthUser();
      if (import.meta.env.DEV) {
        console.debug("[auth-bootstrap] server_error", error.status, error.message);
      }
      if (cachedUser) {
        return {
          status: "authenticated",
          user: cachedUser,
          source: "session-cache"
        };
      }
      return {
        status: "anonymous",
        user: null,
        source: "server"
      };
    }

    if (isTimeoutError(error)) {
      const cachedUser = readCachedAuthUser();
      if (import.meta.env.DEV) {
        console.debug("[auth-bootstrap] timeout");
      }
      if (cachedUser) {
        return {
          status: "authenticated",
          user: cachedUser,
          source: "session-cache"
        };
      }
      return {
        status: "anonymous",
        user: null
      };
    }

    const cachedUser = readCachedAuthUser();
    if (import.meta.env.DEV) {
      console.debug("[auth-bootstrap] server_error", error);
    }
    if (cachedUser) {
      return {
        status: "authenticated",
        user: cachedUser,
        source: "session-cache"
      };
    }
    return {
      status: "anonymous",
      user: null,
      source: "server"
    };
  }
}

export async function clearLocalAuthSession() {
  try {
    await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
  } catch {
    // Clear legacy state even if the server session is already gone.
  }
  clearLegacyAuthToken();
  clearCachedAuthUser();
}

export async function changeLocalPassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  return requestJson<{ ok: true }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function recordPresence() {
  return requestJson<{ ok: true; lastSeenAt: string }>("/api/auth/presence", {
    method: "POST",
    timeoutMs: AUTH_BOOTSTRAP_TIMEOUT_MS
  });
}

export async function getAdminState() {
  return requestJson<AdminState>("/api/auth/admin/state");
}

export async function getAdminNotificationSummary() {
  return requestJson<AdminNotificationSummary>("/api/auth/admin/notifications");
}

export async function getOnlineUsers() {
  return requestJson<OnlineUsersResponse>("/api/auth/admin/online-users", {
    timeoutMs: AUTH_BOOTSTRAP_TIMEOUT_MS
  });
}

export async function approveAccessRequest(
  requestId: string,
  input: {
    role: "admin" | "user";
    menuPermissions: AppMenuKey[];
  }
) {
  const response = await requestJson<ApproveAccessRequestResponse>(
    `/api/auth/admin/requests/${requestId}/approve`,
    {
      method: "POST",
      body: JSON.stringify(input),
      timeoutMs: AUTH_EMAIL_REQUEST_TIMEOUT_MS
    }
  );

  if ("user" in response) {
    return {
      user: response.user,
      emailDelivery: normalizeEmailDeliveryResult(response.emailDelivery)
    };
  }

  return {
    user: response,
    emailDelivery: normalizeEmailDeliveryResult(null)
  };
}

export async function deleteAccessRequest(requestId: string) {
  return requestJson<{ ok: true; deletedRequestId: string; deletedEmail: string }>(
    `/api/auth/admin/requests/${requestId}`,
    {
      method: "DELETE"
    }
  );
}

export async function updateLocalUser(
  userId: string,
  input: Pick<LocalUserRecord, "role" | "menuPermissions">
) {
  return requestJson<LocalUserRecord>(`/api/auth/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function createLocalUser(input: {
  email: string;
  name: string;
  company: CompanyCode;
  role: "admin" | "user";
  menuPermissions: AppMenuKey[];
}) {
  const response = await requestJson<CreateLocalUserResponse>("/api/auth/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: AUTH_EMAIL_REQUEST_TIMEOUT_MS
  });

  return {
    user: response.user,
    emailDelivery: normalizeEmailDeliveryResult(response.emailDelivery)
  };
}

export async function deleteLocalUser(userId: string) {
  return requestJson<{ ok: true; deletedUserId: string; deletedEmail: string }>(
    `/api/auth/admin/users/${userId}`,
    {
      method: "DELETE"
    }
  );
}

export async function updateDataOceanToken(input: {
  token: string;
  validityDays: number;
}) {
  return requestJson<DataOceanTokenStatus>("/api/auth/admin/dataocean-token", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}
