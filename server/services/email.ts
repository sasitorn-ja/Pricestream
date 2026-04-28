import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

type EmailInput = {
  to: string;
  subject: string;
  body: string;
};

export type EmailDeliveryResult = {
  delivered: boolean;
  provider: "smtp" | "none";
  queued?: boolean;
  reason?: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedTransporterKey = "";

function readBooleanEnv(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function readRuntimeEnv() {
  const env = { ...process.env } as Record<string, string | undefined>;
  const envPath = path.resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return env;
  }

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function readSmtpConfig() {
  const env = readRuntimeEnv();
  const host = env.SMTP_HOST || "";
  const port = Number(env.SMTP_PORT || "587");
  const user = env.SMTP_USER || "";
  const pass = env.SMTP_PASS || "";
  const from = env.MAIL_FROM || user;
  const secure = readBooleanEnv(env.SMTP_SECURE, port === 465);
  const requireTls = readBooleanEnv(env.SMTP_REQUIRE_TLS, port !== 465);

  return {
    configured: Boolean(host && port && user && pass && from),
    host,
    port,
    user,
    pass,
    from,
    secure,
    requireTls
  };
}

function getTransporter(config: ReturnType<typeof readSmtpConfig>) {
  const transporterKey = JSON.stringify({
    host: config.host,
    port: config.port,
    user: config.user,
    pass: config.pass,
    secure: config.secure,
    requireTls: config.requireTls
  });

  if (cachedTransporter && cachedTransporterKey === transporterKey) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTls,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
  cachedTransporterKey = transporterKey;

  return cachedTransporter;
}

async function sendWithSmtp(input: EmailInput): Promise<EmailDeliveryResult> {
  const config = readSmtpConfig();
  if (!config.configured) {
    return {
      delivered: false,
      provider: "smtp",
      reason: "SMTP is not configured."
    };
  }

  const transporter = getTransporter(config);

  try {
    await transporter.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.body
    });
  } catch (error) {
    return {
      delivered: false,
      provider: "smtp",
      reason: error instanceof Error ? error.message : "Unknown SMTP error"
    };
  }

  return { delivered: true, provider: "smtp" };
}

export async function sendEmail(input: EmailInput): Promise<EmailDeliveryResult> {
  return sendWithSmtp(input);
}
