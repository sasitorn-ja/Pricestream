import {
  getAuthUserFromToken
} from "../../server/handlers/auth.js";
import {
  forceRefreshRemoteSnapshot,
  formatHandlerError,
  getCacheStatus
} from "../../server/handlers/pricing.js";
import { readSessionTokenFromRequest, toHttpError } from "../../server/services/httpSecurity.js";
import type { ApiRequest, ApiResponse } from "../shared/http.js";
import { readHeaderValue, sendJson } from "../shared/http.js";

function canRefreshCache(req: ApiRequest) {
  const allowedTokens = [process.env.CACHE_REFRESH_TOKEN, process.env.CRON_SECRET]
    .map((value) => value ?? "")
    .filter(Boolean);

  if (allowedTokens.length === 0) {
    return false;
  }

  const authorization = readHeaderValue(req.headers, "authorization");

  return allowedTokens.some((token) => authorization === `Bearer ${token}`);
}

async function canAdminRefreshCache(req: ApiRequest) {
  const user = await getAuthUserFromToken(
    readSessionTokenFromRequest({
      authorizationHeader: readHeaderValue(req.headers, "authorization"),
      cookieHeader: readHeaderValue(req.headers, "cookie")
    })
  );

  return user?.role === "admin";
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const method = String(req.method ?? "GET").toUpperCase();

  if (method !== "GET" && method !== "POST") {
    return sendJson(res, { error: "Method not allowed" }, 405);
  }

  const isTokenAuthorized = canRefreshCache(req);
  const isAdminAuthorized = method === "POST" ? await canAdminRefreshCache(req) : false;

  if (!isTokenAuthorized && !isAdminAuthorized) {
    return sendJson(res, { error: "Unauthorized cache refresh request." }, 401);
  }

  try {
    await forceRefreshRemoteSnapshot();
    return sendJson(res, getCacheStatus());
  } catch (error) {
    const httpError = toHttpError(error, 502, "Unknown handler error");
    return sendJson(res, formatHandlerError(httpError), httpError.status);
  }
}
