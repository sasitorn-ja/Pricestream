import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { APP_BRAND_NAME, GENERAL_USER_EMAIL_DOMAIN } from "../../shared/appConfig.js";
import {
  getDataOceanTokenStatus,
  saveDataOceanTokenStatus
} from "../services/dataOceanConfig.js";
import { getSql } from "../services/db.js";
import { sendEmail, type EmailDeliveryResult } from "../services/email.js";
import { hashSessionToken, HttpError } from "../services/httpSecurity.js";
import {
  clearRemoteSnapshotCache,
  forceRefreshRemoteSnapshot,
  validateDataOceanToken
} from "./pricing.js";

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
  mustChangePassword?: boolean;
};

type SanitizedUser = {
  id: string;
  email: string;
  name: string;
  company: CompanyCode;
  role: "admin" | "user";
  menuPermissions: AppMenuKey[];
  createdAt: string;
  updatedAt: string;
};

type DbUser = {
  id: string;
  email: string;
  name: string;
  company: CompanyCode;
  role: "admin" | "user";
  menu_permissions: AppMenuKey[];
  password_hash: string;
  password_changed_at?: string | null;
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

export const APP_MENU_LABELS: Record<AppMenuKey, string> = {
  "dashboard-cpac": "Dashboard ติดตามการขึ้นราคา (CPAC)",
  "dashboard-qmix": "Dashboard ติดตามการขึ้นราคา (QMIX)",
  admin: "Admin"
};
const ALL_MENU_PERMISSIONS: AppMenuKey[] = ["dashboard-cpac", "dashboard-qmix", "admin"];
const DEFAULT_ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || "");
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DEFAULT_ADMIN_ID = "admin-local";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PUBLIC_APP_URL = "https://pricing-monitor-green.vercel.app/";
let schemaReady: Promise<void> | null = null;
let schemaStatus: "idle" | "initializing" | "ready" | "failed" = "idle";
let schemaFailureMessage = "";

function buildId(prefix: string) {
  return `${prefix}-${randomBytes(16).toString("hex")}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isSeededAdminEmail(email: string) {
  return Boolean(DEFAULT_ADMIN_EMAIL) && normalizeEmail(email) === DEFAULT_ADMIN_EMAIL;
}

function validateUserEmailPolicy(emailInput: string, errorMessage = "บัญชีผู้ใช้งานทั่วไปต้องใช้อีเมล @scg.com") {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    throw new HttpError(400, "กรอกอีเมลให้ถูกต้อง");
  }

  if (email.endsWith(GENERAL_USER_EMAIL_DOMAIN) || isSeededAdminEmail(email)) {
    return email;
  }

  throw new HttpError(400, errorMessage);
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
    menuPermissions: user.menu_permissions,
    mustChangePassword: !user.password_changed_at
  };
}

function sanitizeUser(user: DbUser): SanitizedUser {
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
  const rawUrl =
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_APP_URL ||
    DEFAULT_PUBLIC_APP_URL;
  if (rawUrl) {
  return `${rawUrl.replace(/\/+$/, "")}/`;
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new HttpError(500, "Missing APP_BASE_URL for production email delivery.");
  }

  const port = process.env.PORT || "8787";
  return `http://localhost:${port}`;
}

function buildLoginHelpMessage(email: string) {
  if (!email.endsWith(GENERAL_USER_EMAIL_DOMAIN) && !isSeededAdminEmail(email)) {
    return "บัญชีผู้ใช้งานทั่วไปต้องใช้อีเมล @scg.com หากเป็นการใช้งานครั้งแรกให้ขอสิทธิ์ก่อน";
  }

  return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
}

async function createSession(userId: string) {
  const sql = getSql();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await sql`
    insert into auth_sessions (token, token_hash, user_id, expires_at)
    values (${buildId("session")}, ${hashSessionToken(token)}, ${userId}, ${expiresAt})
  `;

  return { token, expiresAt };
}

async function getUserBySessionToken(token: string) {
  if (!token) {
    return null;
  }

  const sql = getSql();
  const rows = (await sql`
    select u.*
    from auth_sessions s
    join auth_users u on u.id = s.user_id
    where (s.token_hash = ${hashSessionToken(token)} or s.token = ${token}) and s.expires_at > now()
    limit 1
  `) as DbUser[];

  return rows[0] ?? null;
}

async function deleteSessionToken(token: string) {
  if (!token) {
    return;
  }

  const sql = getSql();
  await sql`
    delete from auth_sessions
    where token_hash = ${hashSessionToken(token)} or token = ${token}
  `;
}

async function deleteAllUserSessions(userId: string) {
  const sql = getSql();
  await sql`delete from auth_sessions where user_id = ${userId}`;
}

async function removeExpiredSessions() {
  const sql = getSql();
  await sql`delete from auth_sessions where expires_at <= now()`;
}

async function persistCredentialEmailLog(input: {
  to: string;
  subject: string;
  deliveryResult: EmailDeliveryResult;
}) {
  const sql = getSql();
  await sql`
    insert into auth_email_outbox (
      id,
      to_email,
      subject,
      body,
      delivery_status,
      delivery_provider,
      delivery_error,
      delivered_at
    )
    values (
      ${buildId("email")},
      ${input.to},
      ${input.subject},
      'Credential email content hidden for security.',
      ${getDeliveryOutcomeLabel(input.deliveryResult)},
      ${input.deliveryResult.provider},
      ${input.deliveryResult.reason ?? null},
      ${input.deliveryResult.delivered ? new Date().toISOString() : null}
    )
  `;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaStatus = "initializing";
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
          password_changed_at timestamptz default now(),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`alter table auth_users add column if not exists password_changed_at timestamptz default now()`;
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
          token_hash text,
          user_id text not null references auth_users(id) on delete cascade,
          expires_at timestamptz not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`alter table auth_sessions add column if not exists token_hash text`;
      await sql`update auth_users set company = upper(company) where lower(company) in ('cpac', 'qmix')`;
      await sql`update auth_users set company = 'CPAC' where company not in ('CPAC', 'QMIX')`;
      await sql`
        do $$
        begin
          if exists (
            select 1
            from pg_constraint
            where conrelid = 'auth_users'::regclass
              and conname = 'auth_users_company_check'
          ) then
            alter table auth_users drop constraint auth_users_company_check;
          end if;

          if not exists (
            select 1
            from pg_constraint
            where conrelid = 'auth_users'::regclass
              and conname = 'auth_users_company_allowed_check'
          ) then
            alter table auth_users
            add constraint auth_users_company_allowed_check check (company in ('CPAC', 'QMIX'));
          end if;
        end $$;
      `;
      await sql`update auth_access_requests set company = upper(company) where lower(company) in ('cpac', 'qmix')`;
      await sql`update auth_access_requests set company = 'CPAC' where company not in ('CPAC', 'QMIX')`;
      await sql`
        do $$
        begin
          if exists (
            select 1
            from pg_constraint
            where conrelid = 'auth_access_requests'::regclass
              and conname = 'auth_access_requests_company_check'
          ) then
            alter table auth_access_requests drop constraint auth_access_requests_company_check;
          end if;

          if not exists (
            select 1
            from pg_constraint
            where conrelid = 'auth_access_requests'::regclass
              and conname = 'auth_access_requests_company_allowed_check'
          ) then
            alter table auth_access_requests
            add constraint auth_access_requests_company_allowed_check check (company in ('CPAC', 'QMIX'));
          end if;
        end $$;
      `;
      await sql`
        create unique index if not exists auth_sessions_token_hash_idx
        on auth_sessions (token_hash)
        where token_hash is not null
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
      await removeExpiredSessions();

      if (DEFAULT_ADMIN_EMAIL && DEFAULT_ADMIN_PASSWORD) {
        const defaultAdmin = (await sql`
          select * from auth_users where id = ${DEFAULT_ADMIN_ID} or email = ${DEFAULT_ADMIN_EMAIL} limit 1
        `) as DbUser[];

        if (defaultAdmin.length === 0) {
          await sql`
            insert into auth_users (
              id, email, name, company, role, menu_permissions, password_hash, password_changed_at
            ) values (
              ${DEFAULT_ADMIN_ID},
              ${DEFAULT_ADMIN_EMAIL},
              'System Admin',
              'CPAC',
              'admin',
              ${JSON.stringify(["dashboard-cpac", "dashboard-qmix", "admin"])}::jsonb,
              ${hashPassword(DEFAULT_ADMIN_PASSWORD)},
              now()
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
              password_changed_at = coalesce(password_changed_at, now()),
              updated_at = now()
            where id = ${defaultAdmin[0].id}
          `;
        }
      }
      schemaStatus = "ready";
      schemaFailureMessage = "";
    })().catch((error) => {
      schemaStatus = "failed";
      schemaReady = null;
      schemaFailureMessage =
        error instanceof Error ? error.message : "Auth schema initialization failed";
      throw error;
    });
  }

  try {
    await schemaReady;
  } catch (error) {
    throw new HttpError(
      503,
      `ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน${schemaFailureMessage ? `: ${schemaFailureMessage}` : ""}`
    );
  }
}

export function getAuthSubsystemStatus() {
  return {
    schemaStatus,
    schemaFailureMessage
  };
}

export async function initializeAuthSubsystem() {
  await ensureSchema();
}

export async function registerAccessRequest(input: {
  email: string;
  name: string;
  company: CompanyCode;
}) {
  await ensureSchema();
  const sql = getSql();
  const email = validateUserEmailPolicy(input.email);
  const name = input.name.trim();
  const company = input.company;

  if (!name) {
    throw new HttpError(400, "กรอกผู้ใช้งาน");
  }

  if (!isCompanyCode(company)) {
    throw new HttpError(400, "เลือกบริษัทให้ถูกต้อง");
  }

  const existingUsers = await sql`select id from auth_users where email = ${email} limit 1`;
  if (existingUsers.length > 0) {
    throw new HttpError(400, "อีเมลนี้มีบัญชีในระบบแล้ว");
  }

  const pendingRequests = await sql`
    select id from auth_access_requests
    where email = ${email} and status = 'pending'
    limit 1
  `;
  if (pendingRequests.length > 0) {
    throw new HttpError(400, "อีเมลนี้ส่งคำขอไว้แล้วและกำลังรอ admin อนุมัติ");
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
      throw new HttpError(400, "อีเมลนี้ส่งคำขอไว้แล้วและกำลังรอ admin อนุมัติ");
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
    throw new HttpError(400, "กรอกอีเมลและรหัสผ่านให้ครบ");
  }

  const rows = (await sql`select * from auth_users where email = ${email} limit 1`) as DbUser[];
  const user = rows[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, user ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : buildLoginHelpMessage(email));
  }

  const session = await createSession(user.id);

  return {
    user: toAuthUser(user),
    session
  };
}

export async function getAuthUserFromToken(token: string) {
  if (!token) {
    return null;
  }

  await ensureSchema();
  const user = await getUserBySessionToken(token);
  return user ? toAuthUser(user) : null;
}

export async function logoutSession(token: string) {
  if (!token) {
    return;
  }

  await ensureSchema();
  await deleteSessionToken(token);
}

export async function changePassword(
  token: string,
  input: {
    currentPassword: string;
    newPassword: string;
  }
) {
  if (!token) {
    throw new HttpError(401, "Unauthorized");
  }

  await ensureSchema();
  const sql = getSql();
  const currentPassword = String(input.currentPassword ?? "");
  const newPassword = String(input.newPassword ?? "");

  if (!currentPassword || !newPassword) {
    throw new HttpError(400, "กรอกรหัสผ่านเดิมและรหัสผ่านใหม่ให้ครบ");
  }

  if (newPassword.length < 8) {
    throw new HttpError(400, "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
  }

  if (currentPassword === newPassword) {
    throw new HttpError(400, "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");
  }

  const user = await getUserBySessionToken(token);

  if (!user) {
    throw new HttpError(401, "Unauthorized");
  }

  if (!verifyPassword(currentPassword, user.password_hash)) {
    throw new HttpError(400, "รหัสผ่านเดิมไม่ถูกต้อง");
  }

  await sql`
    update auth_users
    set password_hash = ${hashPassword(newPassword)}, password_changed_at = now(), updated_at = now()
    where id = ${user.id}
  `;
  await deleteAllUserSessions(user.id);
  const session = await createSession(user.id);

  return { ok: true, session };
}

async function requireAdmin(token: string) {
  if (!token) {
    throw new HttpError(401, "Unauthorized");
  }

  const user = await getAuthUserFromToken(token);
  if (!user) {
    throw new HttpError(401, "Unauthorized");
  }

  if (user.role !== "admin") {
    throw new HttpError(403, "Unauthorized admin request");
  }

  return user;
}

export async function getAdminState(token: string) {
  await requireAdmin(token);
  const sql = getSql();
  const [usersResult, requestsResult, dataOceanConfig] = await Promise.all([
    sql`select * from auth_users order by created_at asc`,
    sql`select * from auth_access_requests order by created_at desc`,
    getDataOceanTokenStatus()
  ]);
  const users = usersResult as DbUser[];
  const requests = requestsResult as DbAccessRequest[];

  return {
    users: users.map(sanitizeUser),
    requests: requests.map(sanitizeRequest),
    dataOceanConfig
  };
}

function isAdminRole(value: string): value is "admin" | "user" {
  return value === "admin" || value === "user";
}

async function countAdmins() {
  const sql = getSql();
  const rows = (await sql`
    select count(*)::int as admin_count
    from auth_users
    where role = 'admin'
  `) as Array<{ admin_count: number }>;

  return rows[0]?.admin_count ?? 0;
}

async function sendCredentialEmail(email: string, temporaryPassword: string) {
  const loginUrl = getAppBaseUrl();
  const body = `บัญชี ${APP_BRAND_NAME} ของคุณพร้อมใช้งานแล้ว\n\nEmail: ${email}\nรหัสผ่านสำหรับเข้าใช้งานครั้งแรก: ${temporaryPassword}\nลิงก์เข้าสู่ระบบ: ${loginUrl}\n\nหากเป็นการใช้งานครั้งแรก หลังเข้าสู่ระบบแล้วแนะนำให้เปลี่ยนรหัสผ่านทันที`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>บัญชี ${APP_BRAND_NAME} ของคุณพร้อมใช้งานแล้ว</p>
      <p>
        <strong>Email:</strong> ${email}<br />
        <strong>รหัสผ่านสำหรับเข้าใช้งานครั้งแรก:</strong> ${temporaryPassword}
      </p>
      <p>
        <a href="${loginUrl}" style="display: inline-block; border-radius: 10px; background: #1d8ee5; color: #ffffff; padding: 10px 16px; text-decoration: none; font-weight: 700;">
          เข้าสู่ระบบ Dashboard
        </a>
      </p>
      <p style="color: #475569;">หากเป็นการใช้งานครั้งแรก หลังเข้าสู่ระบบแล้วแนะนำให้เปลี่ยนรหัสผ่านทันที</p>
    </div>
  `;
  const subject = `${APP_BRAND_NAME} account ready`;
  const deliveryResult = await sendEmail({
    to: email,
    subject,
    body,
    html
  });

  await persistCredentialEmailLog({
    to: email,
    subject,
    deliveryResult
  });

  return deliveryResult;
}

function queueCredentialEmail(email: string, temporaryPassword: string): EmailDeliveryResult {
  void sendCredentialEmail(email, temporaryPassword).catch((error) => {
    console.error(
      "Credential email delivery failed:",
      error instanceof Error ? error.message : error
    );
  });

  return {
    delivered: false,
    provider: "smtp",
    queued: true,
    reason: "ระบบกำลังส่งอีเมลรหัสผ่านให้ผู้ใช้"
  };
}

async function createUserRecord(input: {
  email: string;
  name: string;
  company: CompanyCode;
  role: "admin" | "user";
  menuPermissions: AppMenuKey[];
}): Promise<{ user: SanitizedUser; temporaryPassword: string }> {
  const sql = getSql();
  const email = validateUserEmailPolicy(input.email);
  const name = input.name.trim();
  const company = input.company;

  if (!name) {
    throw new HttpError(400, "กรอกชื่อผู้ใช้งาน");
  }

  if (!isCompanyCode(company)) {
    throw new HttpError(400, "เลือกบริษัทให้ถูกต้อง");
  }

  if (!isAdminRole(input.role)) {
    throw new HttpError(400, "เลือก role ให้ถูกต้อง");
  }

  const resolvedMenuPermissions = resolveMenuPermissions(
    input.role,
    input.menuPermissions,
    getDefaultMenuForCompany(company)
  );
  const temporaryPassword = generateTemporaryPassword(10);

  const rows = (await sql`
    insert into auth_users (
      id, email, name, company, role, menu_permissions, password_hash, password_changed_at
    ) values (
      ${buildId("user")},
      ${email},
      ${name},
      ${company},
      ${input.role},
      ${JSON.stringify(resolvedMenuPermissions)}::jsonb,
      ${hashPassword(temporaryPassword)},
      null
    )
    returning *
  `) as DbUser[];

  return {
    user: sanitizeUser(rows[0]),
    temporaryPassword
  };
}

export async function getAdminNotificationSummary(token: string) {
  await requireAdmin(token);
  const sql = getSql();
  const [pendingRequestRows, dataOceanConfig] = await Promise.all([
    sql`
      select count(*)::int as pending_request_count
      from auth_access_requests
      where status = 'pending'
    `,
    getDataOceanTokenStatus()
  ]);
  const rows = pendingRequestRows as Array<{ pending_request_count: number }>;
  const dataOceanTokenAlert =
    dataOceanConfig.status === "expired" ||
    (typeof dataOceanConfig.daysRemaining === "number" && dataOceanConfig.daysRemaining <= 10);

  return {
    pendingRequestCount: rows[0]?.pending_request_count ?? 0,
    dataOceanTokenAlert,
    dataOceanTokenStatus: dataOceanConfig.status,
    dataOceanDaysRemaining: dataOceanConfig.daysRemaining,
    dataOceanExpiresAt: dataOceanConfig.expiresAt
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
    throw new HttpError(404, "ไม่พบคำขอนี้");
  }

  const resolvedMenuPermissions = resolveMenuPermissions(
    input.role,
    input.menuPermissions,
    getDefaultMenuForCompany(request.company)
  );
  const temporaryPassword = generateTemporaryPassword(10);

  const userRows = (await sql`
    insert into auth_users (
      id, email, name, company, role, menu_permissions, password_hash, password_changed_at
    ) values (
      ${buildId("user")},
      ${validateUserEmailPolicy(request.email)},
      ${request.name},
      ${request.company},
      ${input.role},
      ${JSON.stringify(resolvedMenuPermissions)}::jsonb,
      ${hashPassword(temporaryPassword)},
      null
    )
    on conflict (email) do update set
      name = excluded.name,
      company = excluded.company,
      role = excluded.role,
      menu_permissions = excluded.menu_permissions,
      password_hash = excluded.password_hash,
      password_changed_at = null,
      updated_at = now()
    returning *
  `) as DbUser[];
  const approvedUser = userRows[0];

  await sql`
    update auth_access_requests
    set status = 'approved', approved_at = now(), approved_by = ${admin.email}
    where id = ${requestId}
  `;

  const emailDelivery = queueCredentialEmail(request.email, temporaryPassword);

  return {
    user: sanitizeUser(approvedUser),
    emailDelivery
  };
}

export async function deleteAccessRequest(token: string, requestId: string) {
  await requireAdmin(token);
  const sql = getSql();
  const rows = (await sql`
    delete from auth_access_requests
    where id = ${requestId} and status = 'pending'
    returning *
  `) as DbAccessRequest[];
  const deletedRequest = rows[0];

  if (!deletedRequest) {
    throw new HttpError(404, "ไม่พบคำขอที่รอลบ");
  }

  return {
    ok: true,
    deletedRequestId: requestId,
    deletedEmail: deletedRequest.email
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
    throw new HttpError(404, "ไม่พบ user นี้");
  }

  const isDefaultAdmin = user.id === DEFAULT_ADMIN_ID || user.email === DEFAULT_ADMIN_EMAIL;
  if (user.role === "admin" && input.role !== "admin") {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      throw new HttpError(400, "ระบบต้องมี admin อย่างน้อย 1 บัญชี");
    }
  }
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

export async function createLocalUser(
  token: string,
  input: {
    email: string;
    name: string;
    company: CompanyCode;
    role: "admin" | "user";
    menuPermissions: AppMenuKey[];
  }
) {
  await requireAdmin(token);
  await ensureSchema();
  const sql = getSql();
  const email = validateUserEmailPolicy(input.email);
  const existingUsers = await sql`select id from auth_users where email = ${email} limit 1`;

  if (existingUsers.length > 0) {
    throw new HttpError(400, "อีเมลนี้มีบัญชีในระบบแล้ว");
  }

  const { user, temporaryPassword } = await createUserRecord({
    ...input,
    email
  });

  await sql`delete from auth_access_requests where email = ${email}`;
  const emailDelivery = queueCredentialEmail(email, temporaryPassword);

  return {
    user,
    emailDelivery
  };
}

export async function deleteLocalUser(token: string, userId: string) {
  await requireAdmin(token);
  await ensureSchema();
  const sql = getSql();
  const users = (await sql`select * from auth_users where id = ${userId} limit 1`) as DbUser[];
  const user = users[0];

  if (!user) {
    throw new HttpError(404, "ไม่พบ user นี้");
  }

  const isDefaultAdmin = user.id === DEFAULT_ADMIN_ID || user.email === DEFAULT_ADMIN_EMAIL;
  if (isDefaultAdmin) {
    throw new HttpError(400, "ไม่สามารถลบบัญชี admin หลักของระบบได้");
  }

  if (user.role === "admin") {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      throw new HttpError(400, "ระบบต้องมี admin อย่างน้อย 1 บัญชี");
    }
  }

  await sql`delete from auth_access_requests where email = ${user.email}`;
  await sql`delete from auth_email_outbox where to_email = ${user.email}`;
  await sql`delete from auth_users where id = ${userId}`;

  return {
    ok: true as const,
    deletedUserId: userId,
    deletedEmail: user.email
  };
}

export async function updateDataOceanTokenConfig(
  token: string,
  input: {
    token: string;
    validityDays: number;
  }
) {
  const admin = await requireAdmin(token);
  const nextToken = String(input.token ?? "").trim();
  const nextValidityDays = Number(input.validityDays ?? NaN);

  if (!nextToken) {
    throw new HttpError(400, "กรอก DataOcean token ก่อนบันทึก");
  }

  await validateDataOceanToken(nextToken);

  const status = await saveDataOceanTokenStatus({
    token: nextToken,
    validityDays: nextValidityDays,
    updatedBy: admin.email
  });

  await clearRemoteSnapshotCache();
  void forceRefreshRemoteSnapshot().catch(() => {
    // The new token is already saved; next request will retry with fresh credentials.
  });

  return status;
}

export function formatAuthError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Unknown auth error"
  };
}
