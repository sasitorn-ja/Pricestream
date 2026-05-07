import { createHash } from "node:crypto";
import {
  AUTH_SESSION_COOKIE_MAX_AGE_SECONDS,
  AUTH_SESSION_COOKIE_NAME
} from "../../shared/appConfig.js";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function toHttpError(error: unknown, fallbackStatus = 500, fallbackMessage = "Unexpected error") {
  if (isHttpError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new HttpError(fallbackStatus, error.message || fallbackMessage);
  }

  return new HttpError(fallbackStatus, fallbackMessage);
}

export function parseCookieHeader(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

export function readSessionTokenFromRequest(input: {
  authorizationHeader?: string;
  cookieHeader?: string;
}) {
  const authorization = input.authorizationHeader ?? "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  const cookies = parseCookieHeader(input.cookieHeader ?? "");
  return cookies[AUTH_SESSION_COOKIE_NAME] ?? "";
}

export function buildSessionCookie(token: string, expiresAt: string) {
  const expiresAtDate = new Date(expiresAt);
  const secure = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  return [
    `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${AUTH_SESSION_COOKIE_MAX_AGE_SECONDS}`,
    `Expires=${expiresAtDate.toUTCString()}`,
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildClearedSessionCookie() {
  const secure = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  return [
    `${AUTH_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export function assertRateLimit(input: {
  action: string;
  key: string;
  maxRequests: number;
  windowMs: number;
}) {
  const now = Date.now();
  const storeKey = `${input.action}:${input.key}`;
  const existing = rateLimitStore.get(storeKey);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(storeKey, {
      count: 1,
      resetAt: now + input.windowMs
    });
    return;
  }

  if (existing.count >= input.maxRequests) {
    throw new HttpError(429, "ส่งคำขอถี่เกินไป กรุณาลองใหม่อีกครั้งในภายหลัง");
  }

  existing.count += 1;
}

export function readClientAddress(input: {
  headers?: Record<string, string | string[] | undefined>;
  fallback?: string;
}) {
  const forwardedFor = input.headers?.["x-forwarded-for"] ?? input.headers?.["X-Forwarded-For"];
  const rawValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const firstAddress = String(rawValue ?? input.fallback ?? "").split(",")[0]?.trim();
  return firstAddress || "unknown";
}
