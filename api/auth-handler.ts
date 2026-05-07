import {
  approveAccessRequest,
  changePassword,
  createLocalUser,
  deleteAccessRequest,
  deleteLocalUser,
  formatAuthError,
  getAdminNotificationSummary,
  getAdminState,
  getAuthUserFromToken,
  loginWithEmailPassword,
  logoutSession,
  registerAccessRequest,
  updateDataOceanTokenConfig,
  updateUserPermissions
} from "../server/handlers/auth.js";
import type { ApiRequest, ApiResponse } from "./shared/http.js";
import { readHeaderValue, sendJson } from "./shared/http.js";
import {
  assertRateLimit,
  buildClearedSessionCookie,
  buildSessionCookie,
  readClientAddress,
  readSessionTokenFromRequest,
  toHttpError
} from "../server/services/httpSecurity.js";

function readSessionToken(req: ApiRequest) {
  return readSessionTokenFromRequest({
    authorizationHeader: readHeaderValue(req.headers, "authorization"),
    cookieHeader: readHeaderValue(req.headers, "cookie")
  });
}

function readPath(req: ApiRequest) {
  const value = req.query?.path ?? req.params?.path;
  const rawPath = Array.isArray(value) ? value.join("/") : String(value ?? "");
  return rawPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const method = String(req.method ?? "GET").toUpperCase();
  const path = readPath(req);

  try {
    if (method === "POST" && path[0] === "register") {
      assertRateLimit({
        action: "register",
        key: readClientAddress({ headers: req.headers }),
        maxRequests: 6,
        windowMs: 15 * 60 * 1000
      });
      return sendJson(res, await registerAccessRequest(req.body as never));
    }

    if (method === "POST" && path[0] === "login") {
      const body = req.body as { email?: string; password?: string };
      assertRateLimit({
        action: "login",
        key: `${readClientAddress({ headers: req.headers })}:${String(body?.email ?? "").trim().toLowerCase()}`,
        maxRequests: 10,
        windowMs: 15 * 60 * 1000
      });
      const result = await loginWithEmailPassword(
        String(body?.email ?? ""),
        String(body?.password ?? "")
      );
      res.setHeader?.("Set-Cookie", buildSessionCookie(result.session.token, result.session.expiresAt));
      return sendJson(res, result.user);
    }

    if (method === "GET" && path[0] === "me") {
      const user = await getAuthUserFromToken(readSessionToken(req));
      return user
        ? sendJson(res, { authenticated: true, user })
        : sendJson(res, { authenticated: false });
    }

    if (method === "POST" && path[0] === "logout") {
      await logoutSession(readSessionToken(req));
      res.setHeader?.("Set-Cookie", buildClearedSessionCookie());
      return sendJson(res, { ok: true });
    }

    if (method === "POST" && path[0] === "change-password") {
      const result = await changePassword(readSessionToken(req), req.body as never);
      res.setHeader?.("Set-Cookie", buildSessionCookie(result.session.token, result.session.expiresAt));
      return sendJson(res, { ok: result.ok });
    }

    if (method === "GET" && path.join("/") === "admin/state") {
      return sendJson(res, await getAdminState(readSessionToken(req)));
    }

    if (method === "GET" && path.join("/") === "admin/notifications") {
      return sendJson(res, await getAdminNotificationSummary(readSessionToken(req)));
    }

    if (
      method === "POST" &&
      path[0] === "admin" &&
      path[1] === "requests" &&
      path[3] === "approve"
    ) {
      return sendJson(
        res,
        await approveAccessRequest(readSessionToken(req), path[2], req.body as never)
      );
    }

    if (method === "DELETE" && path[0] === "admin" && path[1] === "requests") {
      return sendJson(res, await deleteAccessRequest(readSessionToken(req), path[2]));
    }

    if (method === "PATCH" && path[0] === "admin" && path[1] === "users") {
      return sendJson(
        res,
        await updateUserPermissions(readSessionToken(req), path[2], req.body as never)
      );
    }

    if (method === "POST" && path[0] === "admin" && path[1] === "users" && path.length === 2) {
      return sendJson(res, await createLocalUser(readSessionToken(req), req.body as never));
    }

    if (method === "DELETE" && path[0] === "admin" && path[1] === "users") {
      return sendJson(res, await deleteLocalUser(readSessionToken(req), path[2]));
    }

    if (method === "PUT" && path.join("/") === "admin/dataocean-token") {
      return sendJson(res, await updateDataOceanTokenConfig(readSessionToken(req), req.body as never));
    }

    return sendJson(res, { error: "Not found" }, 404);
  } catch (error) {
    const httpError = toHttpError(error, 500, "Unknown auth error");
    return sendJson(res, formatAuthError(httpError), httpError.status);
  }
}
