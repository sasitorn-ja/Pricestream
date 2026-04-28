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

export type LocalEmailRecord = {
  id: string;
  to: string;
  subject: string;
  body: string;
  deliveryStatus: "pending" | "sent" | "failed" | "skipped";
  deliveryProvider?: "smtp" | "none" | null;
  deliveryError?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
};

export type EmailDeliveryResult = {
  delivered: boolean;
  provider: "smtp" | "none";
  queued?: boolean;
  reason?: string;
};

type ApproveAccessRequestResponse =
  | { user: LocalUserRecord; emailDelivery?: EmailDeliveryResult }
  | LocalUserRecord;

export type AdminState = {
  users: LocalUserRecord[];
  requests: LocalAccessRequest[];
  outbox: LocalEmailRecord[];
};

export type AdminNotificationSummary = {
  pendingRequestCount: number;
};

export const APP_MENU_LABELS: Record<AppMenuKey, string> = {
  "dashboard-cpac": "Dashboard ติดตามการขึ้นราคา (CPAC)",
  "dashboard-qmix": "Dashboard ติดตามการขึ้นราคา (QMIX)",
  admin: "Admin"
};

const AUTH_TOKEN_KEY = "pricing-monitor-auth-token";

function getAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}

async function requestJson<T>(url: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error || message;
    } catch {
      // Keep status message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
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

function normalizeOutboxEmail(email: LocalEmailRecord): LocalEmailRecord {
  return {
    ...email,
    deliveryStatus: email.deliveryStatus ?? "pending",
    deliveryProvider: email.deliveryProvider ?? null,
    deliveryError: email.deliveryError ?? null,
    deliveredAt: email.deliveredAt ?? null
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
  const result = await requestJson<{ token: string; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  window.localStorage.setItem(AUTH_TOKEN_KEY, result.token);
  return result.user;
}

export async function getCurrentLocalAuthUser() {
  if (!getAuthToken()) {
    return null;
  }

  try {
    return await requestJson<AuthUser>("/api/auth/me");
  } catch {
    clearLocalAuthSession();
    return null;
  }
}

export async function clearLocalAuthSession() {
  if (getAuthToken()) {
    try {
      await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear local token even if the server session is already gone.
    }
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
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

export async function getAdminState() {
  const state = await requestJson<AdminState>("/api/auth/admin/state");
  return {
    ...state,
    outbox: state.outbox.map(normalizeOutboxEmail)
  };
}

export async function getAdminNotificationSummary() {
  return requestJson<AdminNotificationSummary>("/api/auth/admin/notifications");
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
      body: JSON.stringify(input)
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

export async function updateLocalUser(
  userId: string,
  input: Pick<LocalUserRecord, "role" | "menuPermissions">
) {
  return requestJson<LocalUserRecord>(`/api/auth/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}
