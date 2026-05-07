import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync
} from "node:crypto";
import { DATAOCEAN_CONFIG_SECRET_LABEL } from "../../shared/appConfig.js";
import { getSql } from "./db.js";

export type DataOceanTokenSource = "db" | "env" | "missing";
export type DataOceanTokenHealth = "healthy" | "expiring" | "expired" | "missing" | "invalid";

export type DataOceanTokenStatus = {
  source: DataOceanTokenSource;
  maskedToken: string | null;
  savedAt: string | null;
  validityDays: number | null;
  expiresAt: string | null;
  daysUsed: number | null;
  daysRemaining: number | null;
  status: DataOceanTokenHealth;
  updatedAt: string | null;
  updatedBy: string | null;
  message: string;
};

type DbDataOceanConfig = {
  config_key: string;
  token_ciphertext: string;
  token_last4: string;
  validity_days: number;
  saved_at: string;
  updated_at: string;
  updated_by: string;
};

type BuildTrackedStatusInput = {
  source: Extract<DataOceanTokenSource, "db" | "env">;
  maskedToken: string | null;
  savedAt: string;
  validityDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
  message: string;
  now?: Date;
};

type RuntimeConfig = {
  apiToken: string;
  source: Extract<DataOceanTokenSource, "db" | "env">;
  status: DataOceanTokenStatus;
};

type EnvironmentTrackingConfig = {
  savedAt: string;
  validityDays: number;
};

const CONFIG_KEY = "dataocean-api-token";
const DEFAULT_VALIDITY_DAYS = 360;
const EXPIRING_THRESHOLD_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
let dataOceanConfigSchemaReady: Promise<void> | null = null;

function getConfigSecret() {
  const secret = process.env.DATAOCEAN_CONFIG_SECRET;
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("Missing DATAOCEAN_CONFIG_SECRET for production runtime.");
  }

  return DATAOCEAN_CONFIG_SECRET_LABEL;
}

function buildEncryptionKey() {
  return scryptSync(getConfigSecret(), "dataocean-config-salt", 32);
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", buildEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptToken(ciphertext: string) {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      buildEncryptionKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, "hex")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

function normalizeValidityDays(input: number) {
  if (!Number.isInteger(input) || input <= 0) {
    throw new Error("จำนวนวันอายุ token ต้องเป็นตัวเลขมากกว่า 0");
  }

  return input;
}

function maskToken(last4: string | null) {
  return last4 ? `••••${last4}` : null;
}

function getLast4(token: string) {
  return token.trim().slice(-4);
}

function getUtcStart(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatUtcDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeSavedAtDateInput(input: string) {
  const value = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return value;
}

function buildTrackedStatus({
  source,
  maskedToken,
  savedAt,
  validityDays,
  updatedAt,
  updatedBy,
  message,
  now = new Date()
}: BuildTrackedStatusInput): DataOceanTokenStatus {
  const savedDate = new Date(savedAt);
  const savedDayMs = getUtcStart(savedDate);
  const todayMs = getUtcStart(now);
  const expiryMs = savedDayMs + validityDays * DAY_MS;
  const daysUsed = Math.max(0, Math.floor((todayMs - savedDayMs) / DAY_MS));
  const daysRemaining = Math.floor((expiryMs - todayMs) / DAY_MS);
  const status =
    daysRemaining <= 0
      ? "expired"
      : daysRemaining <= EXPIRING_THRESHOLD_DAYS
        ? "expiring"
        : "healthy";

  return {
    source,
    maskedToken,
    savedAt,
    validityDays,
    expiresAt: formatUtcDate(expiryMs),
    daysUsed,
    daysRemaining,
    status,
    updatedAt,
    updatedBy,
    message
  };
}

async function ensureDataOceanConfigSchema() {
  if (!dataOceanConfigSchemaReady) {
    dataOceanConfigSchemaReady = (async () => {
      const sql = getSql();
      await sql`
        create table if not exists app_dataocean_config (
          config_key text primary key,
          token_ciphertext text not null,
          token_last4 text not null,
          validity_days integer not null check (validity_days > 0),
          saved_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          updated_by text not null
        )
      `;
    })();
  }

  await dataOceanConfigSchemaReady;
}

async function getStoredConfigRecord() {
  await ensureDataOceanConfigSchema();
  const sql = getSql();
  const rows = (await sql`
    select *
    from app_dataocean_config
    where config_key = ${CONFIG_KEY}
    limit 1
  `) as DbDataOceanConfig[];
  return rows[0] ?? null;
}

function getEnvironmentTrackingConfig(): EnvironmentTrackingConfig | null {
  const savedAt = normalizeSavedAtDateInput(process.env.DATAOCEAN_API_TOKEN_SAVED_AT ?? "");
  if (!savedAt) {
    return null;
  }

  const rawValidityDays = (process.env.DATAOCEAN_API_TOKEN_VALIDITY_DAYS ?? "").trim();
  const validityDays = rawValidityDays ? Number(rawValidityDays) : DEFAULT_VALIDITY_DAYS;
  if (!Number.isInteger(validityDays) || validityDays <= 0) {
    return null;
  }

  return {
    savedAt,
    validityDays
  };
}

function buildEnvironmentStatus(envToken: string): DataOceanTokenStatus {
  const tracking = getEnvironmentTrackingConfig();
  if (tracking) {
    return buildTrackedStatus({
      source: "env",
      maskedToken: maskToken(getLast4(envToken)),
      savedAt: tracking.savedAt,
      validityDays: tracking.validityDays,
      updatedAt: null,
      updatedBy: "environment",
      message:
        "ระบบกำลังใช้ token จาก environment อยู่ และคำนวณอายุจากวันที่เริ่มใช้งานที่ตั้งไว้ใน environment"
    });
  }

  return {
    source: "env",
    maskedToken: maskToken(getLast4(envToken)),
    savedAt: null,
    validityDays: null,
    expiresAt: null,
    daysUsed: null,
    daysRemaining: null,
    status: "healthy",
    updatedAt: null,
    updatedBy: null,
    message:
      "ระบบกำลังใช้ token จาก environment อยู่ เมื่อบันทึกผ่านหน้า Admin แล้วจะเปลี่ยนไปใช้ token กลางของทุกคน"
  };
}

export async function getDataOceanTokenStatus(): Promise<DataOceanTokenStatus> {
  const record = await getStoredConfigRecord();

  if (record) {
    const decryptedToken = decryptToken(record.token_ciphertext);
    if (!decryptedToken) {
      return {
        source: "db",
        maskedToken: maskToken(record.token_last4),
        savedAt: record.saved_at,
        validityDays: record.validity_days,
        expiresAt: null,
        daysUsed: null,
        daysRemaining: null,
        status: "invalid",
        updatedAt: record.updated_at,
        updatedBy: record.updated_by,
        message:
          "ระบบอ่าน token จากฐานข้อมูลไม่สำเร็จ กรุณาบันทึก token ใหม่อีกครั้งจากหน้า Admin"
      };
    }

    return buildTrackedStatus({
      source: "db",
      maskedToken: maskToken(record.token_last4),
      savedAt: record.saved_at,
      validityDays: record.validity_days,
      updatedAt: record.updated_at,
      updatedBy: record.updated_by,
      message:
        "ระบบกำลังใช้ token กลางจากฐานข้อมูลสำหรับผู้ใช้ทุกคน"
    });
  }

  const envToken = (process.env.DATAOCEAN_API_TOKEN ?? "").trim();
  if (envToken) {
    return buildEnvironmentStatus(envToken);
  }

  return {
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
}

export async function resolveDataOceanRuntimeConfig(): Promise<RuntimeConfig | null> {
  const record = await getStoredConfigRecord();

  if (record) {
    const decryptedToken = decryptToken(record.token_ciphertext);
    if (!decryptedToken) {
      return null;
    }

    return {
      apiToken: decryptedToken,
      source: "db",
      status: buildTrackedStatus({
        source: "db",
        maskedToken: maskToken(record.token_last4),
        savedAt: record.saved_at,
        validityDays: record.validity_days,
        updatedAt: record.updated_at,
        updatedBy: record.updated_by,
        message: "ระบบกำลังใช้ token กลางจากฐานข้อมูลสำหรับผู้ใช้ทุกคน"
      })
    };
  }

  const envToken = (process.env.DATAOCEAN_API_TOKEN ?? "").trim();
  if (!envToken) {
    return null;
  }

  return {
    apiToken: envToken,
    source: "env",
    status: buildEnvironmentStatus(envToken)
  };
}

export async function saveDataOceanTokenStatus(input: {
  token: string;
  validityDays: number;
  updatedBy: string;
}) {
  const token = input.token.trim();
  const validityDays = normalizeValidityDays(input.validityDays);
  const updatedBy = input.updatedBy.trim();

  if (!token) {
    throw new Error("กรอก DataOcean token ก่อนบันทึก");
  }

  if (!updatedBy) {
    throw new Error("ไม่พบผู้ที่กำลังบันทึก token");
  }

  await ensureDataOceanConfigSchema();
  const sql = getSql();
  const nowIso = new Date().toISOString();
  const ciphertext = encryptToken(token);
  const tokenLast4 = getLast4(token);

  await sql`
    insert into app_dataocean_config (
      config_key,
      token_ciphertext,
      token_last4,
      validity_days,
      saved_at,
      updated_at,
      updated_by
    ) values (
      ${CONFIG_KEY},
      ${ciphertext},
      ${tokenLast4},
      ${validityDays},
      ${nowIso},
      ${nowIso},
      ${updatedBy}
    )
    on conflict (config_key) do update set
      token_ciphertext = excluded.token_ciphertext,
      token_last4 = excluded.token_last4,
      validity_days = excluded.validity_days,
      saved_at = excluded.saved_at,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `;

  return getDataOceanTokenStatus();
}

export function getDefaultDataOceanValidityDays() {
  return DEFAULT_VALIDITY_DAYS;
}
