import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { sendEmail, type EmailDeliveryResult } from "../services/email.js";

export type CompanyCode = "CPAC" | "QMIX";
export type AppMenuKey = "dashboard-cpac" | "dashboard-qmix" | "admin";

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "admin" | "user";
  company?: CompanyCode;
  menuPermissions?: AppMenuKey[];
};

type DbUser = {
  id: string;
  email: string;
  name: string;
  company: CompanyCode;
  role: "admin" | "user";
  menu_permissions: AppMenuKey[];
  password_hash: string;
  created_at: string;
  updated_at: string;
};

type DbAccessRequest = {
  id: string;
  email: string;
  name: string;
  company: CompanyCode;
  status: "pending" | "approved";
  created_at: string;
  approved_at?: string | null;
  approved_by?: string | null;
};

type DbEmailRecord = {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  delivery_status: "pending" | "sent" | "failed" | "skipped";
  delivery_provider?: "smtp" | "none" | null;
  delivery_error?: string | null;
  delivered_at?: string | null;
  created_at: string;
};

export const APP_MENU_LABELS: Record<AppMenuKey, string> = {
  "dashboard-cpac": "Dashboard ติดตามการขึ้นราคา (CPAC)",
  "dashboard-qmix": "Dashboard ติดตามการขึ้นราคา (QMIX)",
  admin: "Admin"
};
const ALL_MENU_PERMISSIONS: AppMenuKey[] = ["dashboard-cpac", "dashboard-qmix", "admin"];

const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@admin.com").toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@1234";
const DEFAULT_ADMIN_ID = "admin-local";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let schemaReady: Promise<void> | null = null;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL. Add your Neon connection string to .env.");
  }

  return neon(databaseUrl);
}

function buildId(prefix: string) {
  return `${prefix}-${randomBytes(16).toString("hex")}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isCompanyCode(value: string): value is CompanyCode {
  return value === "CPAC" || value === "QMIX";
}

function isAppMenuKey(value: string): value is AppMenuKey {
  return ALL_MENU_PERMISSIONS.includes(value as AppMenuKey);
}

function getDefaultMenuForCompany(company: CompanyCode): AppMenuKey {
  return company === "QMIX" ? "dashboard-qmix" : "dashboard-cpac";
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return `pbkdf2$${salt}$${hash}`;
}

function generateTemporaryPassword(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function verifyPassword(password: string, storedHash: string) {
  const [, salt, hash] = storedHash.split("$");
  if (!salt || !hash) {
    return false;
  }

  const candidate = hashPassword(password, salt).split("$")[2];
  return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

function toAuthUser(user: DbUser): AuthUser {
  return {
    id: user.id,
    username: user.email,
    name: user.name,
    email: user.email,
    role: user.role,
    company: user.company,
    menuPermissions: user.menu_permissions
  };
}

function sanitizeUser(user: DbUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company,
    role: user.role,
    menuPermissions: user.menu_permissions,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

function sanitizeRequest(request: DbAccessRequest) {
  return {
    id: request.id,
    email: request.email,
    name: request.name,
    company: request.company,
    status: request.status,
    createdAt: request.created_at,
    approvedAt: request.approved_at,
    approvedBy: request.approved_by
  };
}

function resolveMenuPermissions(
  role: "admin" | "user",
  menuPermissions: AppMenuKey[],
  fallbackMenu: AppMenuKey
) {
  if (role === "admin") {
    return ALL_MENU_PERMISSIONS;
  }

  const validMenus = Array.from(new Set(menuPermissions.filter(isAppMenuKey)));
  return validMenus.length ? validMenus : [fallbackMenu];
}

function sanitizeEmail(email: DbEmailRecord) {
  return {
    id: email.id,
    to: email.to_email,
    subject: email.subject,
    body: email.body,
    deliveryStatus: email.delivery_status,
    deliveryProvider: email.delivery_provider,
    deliveryError: email.delivery_error,
    deliveredAt: email.delivered_at,
    createdAt: email.created_at
  };
}

function getDeliveryOutcomeLabel(result: EmailDeliveryResult) {
  if (result.delivered) {
    return "sent" as const;
  }

  if (result.provider === "none") {
    return "skipped" as const;
  }

  return "failed" as const;
}

function getAppBaseUrl() {
  const fallbackUrl = "https://pricing-monitor-green.vercel.app/";
  const rawUrl = process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || fallbackUrl;
  return rawUrl.replace(/\/+$/, "");
}

function buildQueuedEmailDeliveryResult(): EmailDeliveryResult {
  return {
    delivered: false,
    queued: true,
    provider: "smtp",
    reason: "อนุมัติแล้ว ระบบกำลังส่งอีเมลให้ผู้ใช้ หากยังไม่ขึ้นว่า \"ส่งแล้ว\" ให้ตรวจสอบต่อใน Email outbox"
  };
}

function queueApprovalEmailDelivery(outboxId: string, input: { to: string; subject: string; body: string }) {
  void (async () => {
    const sql = getSql();
    const deliveryResult = await sendEmail(input);
    const deliveryStatus = getDeliveryOutcomeLabel(deliveryResult);
    await sql`
      update auth_email_outbox
      set
        delivery_status = ${deliveryStatus},
        delivery_provider = ${deliveryResult.provider},
        delivery_error = ${deliveryResult.reason ?? null},
        delivered_at = ${deliveryResult.delivered ? new Date().toISOString() : null}
      where id = ${outboxId}
    `;

    if (!deliveryResult.delivered) {
      console.error("Failed to deliver approval email:", deliveryResult.reason);
    }
  })().catch((error) => {
    console.error("Failed to queue approval email:", error);
  });
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        create table if not exists auth_users (
          id text primary key,
          email text not null unique,
          name text not null,
          company text not null check (company in ('CPAC', 'QMIX')),
          role text not null check (role in ('admin', 'user')),
          menu_permissions jsonb not null default '[]'::jsonb,
          password_hash text not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists auth_access_requests (
          id text primary key,
          email text not null,
          name text not null,
          company text not null check (company in ('CPAC', 'QMIX')),
          status text not null check (status in ('pending', 'approved')),
          created_at timestamptz not null default now(),
          approved_at timestamptz,
          approved_by text
        )
      `;
      await sql`
        create unique index if not exists auth_access_requests_pending_email_idx
        on auth_access_requests (email)
        where status = 'pending'
      `;
      await sql`
        create table if not exists auth_sessions (
          token text primary key,
          user_id text not null references auth_users(id) on delete cascade,
          expires_at timestamptz not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists auth_email_outbox (
          id text primary key,
          to_email text not null,
          subject text not null,
          body text not null,
          delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
          delivery_provider text,
          delivery_error text,
          delivered_at timestamptz,
          created_at timestamptz not null default now()
        )
      `;
      await sql`alter table auth_email_outbox add column if not exists delivery_status text not null default 'pending'`;
      await sql`alter table auth_email_outbox add column if not exists delivery_provider text`;
      await sql`alter table auth_email_outbox add column if not exists delivery_error text`;
      await sql`alter table auth_email_outbox add column if not exists delivered_at timestamptz`;
      const defaultAdmin = (await sql`
        select * from auth_users where id = ${DEFAULT_ADMIN_ID} or email = ${DEFAULT_ADMIN_EMAIL} limit 1
      `) as DbUser[];

      if (defaultAdmin.length === 0) {
        await sql`
          insert into auth_users (
            id, email, name, company, role, menu_permissions, password_hash
          ) values (
            ${DEFAULT_ADMIN_ID},
            ${DEFAULT_ADMIN_EMAIL},
            'System Admin',
            'CPAC',
            'admin',
            ${JSON.stringify(["dashboard-cpac", "dashboard-qmix", "admin"])}::jsonb,
            ${hashPassword(DEFAULT_ADMIN_PASSWORD)}
          )
        `;
      } else {
        await sql`
          update auth_users
          set
            id = ${DEFAULT_ADMIN_ID},
            email = ${DEFAULT_ADMIN_EMAIL},
            role = 'admin',
            menu_permissions = ${JSON.stringify(["dashboard-cpac", "dashboard-qmix", "admin"])}::jsonb,
            updated_at = now()
          where id = ${defaultAdmin[0].id}
        `;
      }
    })();
  }

  await schemaReady;
}

export async function registerAccessRequest(input: {
  email: string;
  name: string;
  company: CompanyCode;
}) {
  await ensureSchema();
  const sql = getSql();
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const company = input.company;

  if (!email || !email.includes("@")) {
    throw new Error("กรอกอีเมลให้ถูกต้อง");
  }

  if (!name) {
    throw new Error("กรอกชื่อบริษัทหรือชื่อผู้ใช้งาน");
  }

  if (!isCompanyCode(company)) {
    throw new Error("เลือกบริษัทให้ถูกต้อง");
  }

  const existingUsers = await sql`select id from auth_users where email = ${email} limit 1`;
  if (existingUsers.length > 0) {
    throw new Error("อีเมลนี้มีบัญชีในระบบแล้ว");
  }

  const pendingRequests = await sql`
    select id from auth_access_requests
    where email = ${email} and status = 'pending'
    limit 1
  `;
  if (pendingRequests.length > 0) {
    throw new Error("อีเมลนี้ส่งคำขอไว้แล้วและกำลังรอ admin อนุมัติ");
  }

  let rows: DbAccessRequest[];
  try {
    rows = (await sql`
      insert into auth_access_requests (id, email, name, company, status)
      values (${buildId("request")}, ${email}, ${name}, ${company}, 'pending')
      returning *
    `) as DbAccessRequest[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("auth_access_requests_pending_email_idx")) {
      throw new Error("อีเมลนี้ส่งคำขอไว้แล้วและกำลังรอ admin อนุมัติ");
    }
    throw error;
  }

  return sanitizeRequest(rows[0]);
}

export async function loginWithEmailPassword(emailInput: string, password: string) {
  await ensureSchema();
  const sql = getSql();
  const email = normalizeEmail(emailInput);
  if (!email || !password) {
    throw new Error("กรอกอีเมลและรหัสผ่านให้ครบ");
  }

  const rows = (await sql`select * from auth_users where email = ${email} limit 1`) as DbUser[];
  const user = rows[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await sql`
    insert into auth_sessions (token, user_id, expires_at)
    values (${token}, ${user.id}, ${expiresAt})
  `;

  return {
    token,
    user: toAuthUser(user)
  };
}

export async function getAuthUserFromToken(token: string) {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select u.*
    from auth_sessions s
    join auth_users u on u.id = s.user_id
    where s.token = ${token} and s.expires_at > now()
    limit 1
  `) as DbUser[];

  return rows[0] ? toAuthUser(rows[0]) : null;
}

export async function logoutSession(token: string) {
  await ensureSchema();
  const sql = getSql();
  await sql`delete from auth_sessions where token = ${token}`;
}

export async function changePassword(
  token: string,
  input: {
    currentPassword: string;
    newPassword: string;
  }
) {
  await ensureSchema();
  const sql = getSql();
  const currentPassword = String(input.currentPassword ?? "");
  const newPassword = String(input.newPassword ?? "");

  if (!currentPassword || !newPassword) {
    throw new Error("กรอกรหัสผ่านเดิมและรหัสผ่านใหม่ให้ครบ");
  }

  if (newPassword.length < 8) {
    throw new Error("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
  }

  if (currentPassword === newPassword) {
    throw new Error("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");
  }

  const rows = (await sql`
    select u.*
    from auth_sessions s
    join auth_users u on u.id = s.user_id
    where s.token = ${token} and s.expires_at > now()
    limit 1
  `) as DbUser[];
  const user = rows[0];

  if (!user) {
    throw new Error("Unauthorized");
  }

  if (!verifyPassword(currentPassword, user.password_hash)) {
    throw new Error("รหัสผ่านเดิมไม่ถูกต้อง");
  }

  await sql`
    update auth_users
    set password_hash = ${hashPassword(newPassword)}, updated_at = now()
    where id = ${user.id}
  `;

  return { ok: true };
}

async function requireAdmin(token: string) {
  const user = await getAuthUserFromToken(token);
  if (!user || user.role !== "admin") {
    throw new Error("Unauthorized admin request");
  }

  return user;
}

export async function getAdminState(token: string) {
  await requireAdmin(token);
  const sql = getSql();
  const [usersResult, requestsResult, outboxResult] = await Promise.all([
    sql`select * from auth_users order by created_at asc`,
    sql`select * from auth_access_requests order by created_at desc`,
    sql`select * from auth_email_outbox order by created_at desc`
  ]);
  const users = usersResult as DbUser[];
  const requests = requestsResult as DbAccessRequest[];
  const outbox = outboxResult as DbEmailRecord[];

  return {
    users: users.map(sanitizeUser),
    requests: requests.map(sanitizeRequest),
    outbox: outbox.map(sanitizeEmail)
  };
}

export async function getAdminNotificationSummary(token: string) {
  await requireAdmin(token);
  const sql = getSql();
  const rows = (await sql`
    select count(*)::int as pending_request_count
    from auth_access_requests
    where status = 'pending'
  `) as Array<{ pending_request_count: number }>;

  return {
    pendingRequestCount: rows[0]?.pending_request_count ?? 0
  };
}

export async function approveAccessRequest(
  token: string,
  requestId: string,
  input: {
    role: "admin" | "user";
    menuPermissions: AppMenuKey[];
  }
) {
  const admin = await requireAdmin(token);
  const sql = getSql();
  const requests = (await sql`
    select * from auth_access_requests where id = ${requestId} limit 1
  `) as DbAccessRequest[];
  const request = requests[0];

  if (!request) {
    throw new Error("ไม่พบคำขอนี้");
  }

  const resolvedMenuPermissions = resolveMenuPermissions(
    input.role,
    input.menuPermissions,
    getDefaultMenuForCompany(request.company)
  );
  const temporaryPassword = generateTemporaryPassword(10);

  const userRows = (await sql`
    insert into auth_users (
      id, email, name, company, role, menu_permissions, password_hash
    ) values (
      ${buildId("user")},
      ${request.email},
      ${request.name},
      ${request.company},
      ${input.role},
      ${JSON.stringify(resolvedMenuPermissions)}::jsonb,
      ${hashPassword(temporaryPassword)}
    )
    on conflict (email) do update set
      name = excluded.name,
      company = excluded.company,
      role = excluded.role,
      menu_permissions = excluded.menu_permissions,
      password_hash = excluded.password_hash,
      updated_at = now()
    returning *
  `) as DbUser[];
  const approvedUser = userRows[0];

  await sql`
    update auth_access_requests
    set status = 'approved', approved_at = now(), approved_by = ${admin.email}
    where id = ${requestId}
  `;

  const body = `บัญชี Dashboard ของคุณได้รับการอนุมัติแล้ว\n\nEmail: ${request.email}\nรหัสผ่านสำหรับเข้าใช้งานครั้งแรก: ${temporaryPassword}\nลิงก์เข้าสู่ระบบ: ${getAppBaseUrl()}\n\nกรุณาใช้ email และรหัสผ่านนี้เข้าสู่ระบบ`;
  const subject = "Dashboard account approved";
  const outboxId = buildId("email");
  await sql`
    insert into auth_email_outbox (id, to_email, subject, body, delivery_status)
    values (${outboxId}, ${request.email}, ${subject}, ${body}, 'pending')
  `;
  queueApprovalEmailDelivery(outboxId, {
    to: request.email,
    subject,
    body
  });

  return {
    user: sanitizeUser(approvedUser),
    emailDelivery: buildQueuedEmailDeliveryResult()
  };
}

export async function updateUserPermissions(
  token: string,
  userId: string,
  input: {
    role: "admin" | "user";
    menuPermissions: AppMenuKey[];
  }
) {
  await requireAdmin(token);
  const sql = getSql();
  const users = (await sql`select * from auth_users where id = ${userId} limit 1`) as DbUser[];
  const user = users[0];

  if (!user) {
    throw new Error("ไม่พบ user นี้");
  }

  const isDefaultAdmin = user.id === DEFAULT_ADMIN_ID || user.email === DEFAULT_ADMIN_EMAIL;
  const resolvedRole = isDefaultAdmin ? "admin" : input.role;
  const resolvedMenuPermissions = isDefaultAdmin
    ? ALL_MENU_PERMISSIONS
    : resolveMenuPermissions(input.role, input.menuPermissions, getDefaultMenuForCompany(user.company));
  const rows = (await sql`
    update auth_users
    set
      role = ${resolvedRole},
      menu_permissions = ${JSON.stringify(resolvedMenuPermissions)}::jsonb,
      updated_at = now()
    where id = ${userId}
    returning *
  `) as DbUser[];

  return sanitizeUser(rows[0]);
}

export function formatAuthError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Unknown auth error"
  };
}
