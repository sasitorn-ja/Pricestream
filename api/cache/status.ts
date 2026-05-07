import { getAuthUserFromToken } from "../../server/handlers/auth.js";
import { getCacheStatus } from "../../server/handlers/pricing.js";
import { readSessionTokenFromRequest } from "../../server/services/httpSecurity.js";
import type { ApiRequest, ApiResponse } from "../shared/http.js";
import { readHeaderValue, sendJson } from "../shared/http.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const user = await getAuthUserFromToken(
    readSessionTokenFromRequest({
      authorizationHeader: readHeaderValue(req.headers, "authorization"),
      cookieHeader: readHeaderValue(req.headers, "cookie")
    })
  );

  if (!user) {
    return sendJson(res, { error: "Unauthorized" }, 401);
  }

  if (user.role !== "admin") {
    return sendJson(res, { error: "Unauthorized admin request" }, 403);
  }

  return sendJson(res, getCacheStatus());
}
