import {
  approveAccessRequest,
  changePassword,
  formatAuthError,
  getAdminNotificationSummary,
  getAdminState,
  getAuthUserFromToken,
  loginWithEmailPassword,
  logoutSession,
  registerAccessRequest,
  updateUserPermissions
} from "../../server/handlers/auth.js";
import type { ApiRequest, ApiResponse } from "../shared/http.js";
import { readHeaderValue, sendJson } from "../shared/http.js";

function readBearerToken(req: ApiRequest) {
  const authorization = readHeaderValue(req.headers, "authorization");
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
}

function readPath(req: ApiRequest) {
  const value = req.query?.path ?? req.params?.path;
  const parts = Array.isArray(value) ? value : String(value ?? "").split("/");
  return parts.filter(Boolean);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const method = String(req.method ?? "GET").toUpperCase();
  const path = readPath(req);

  try {
    if (method === "POST" && path[0] === "register") {
      return sendJson(res, await registerAccessRequest(req.body as never));
    }

    if (method === "POST" && path[0] === "login") {
      const body = req.body as { email?: string; password?: string };
      return sendJson(
        res,
        await loginWithEmailPassword(String(body?.email ?? ""), String(body?.password ?? ""))
      );
    }

    if (method === "GET" && path[0] === "me") {
      const user = await getAuthUserFromToken(readBearerToken(req));
      return user ? sendJson(res, user) : sendJson(res, { error: "Unauthorized" }, 401);
    }

    if (method === "POST" && path[0] === "logout") {
      await logoutSession(readBearerToken(req));
      return sendJson(res, { ok: true });
    }

    if (method === "POST" && path[0] === "change-password") {
      return sendJson(res, await changePassword(readBearerToken(req), req.body as never));
    }

    if (method === "GET" && path.join("/") === "admin/state") {
      return sendJson(res, await getAdminState(readBearerToken(req)));
    }

    if (method === "GET" && path.join("/") === "admin/notifications") {
      return sendJson(res, await getAdminNotificationSummary(readBearerToken(req)));
    }

    if (
      method === "POST" &&
      path[0] === "admin" &&
      path[1] === "requests" &&
      path[3] === "approve"
    ) {
      return sendJson(
        res,
        await approveAccessRequest(readBearerToken(req), path[2], req.body as never)
      );
    }

    if (method === "PATCH" && path[0] === "admin" && path[1] === "users") {
      return sendJson(
        res,
        await updateUserPermissions(readBearerToken(req), path[2], req.body as never)
      );
    }

    return sendJson(res, { error: "Not found" }, 404);
  } catch (error) {
    return sendJson(res, formatAuthError(error), 400);
  }
}
