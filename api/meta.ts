import { getAuthUserFromToken } from "../server/handlers/auth.js";
import { formatHandlerError, getMeta } from "../server/handlers/pricing.js";
import { buildAuthorizedFilterInput } from "../server/services/dataApiAccess.js";
import { readSessionTokenFromRequest, toHttpError } from "../server/services/httpSecurity.js";
import type { ApiRequest, ApiResponse } from "./shared/http.js";
import { readCsvValue, readHeaderValue, readQueryValue, sendJson } from "./shared/http.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const user = await getAuthUserFromToken(
      readSessionTokenFromRequest({
        authorizationHeader: readHeaderValue(req.headers, "authorization"),
        cookieHeader: readHeaderValue(req.headers, "cookie")
      })
    );
    if (!user) {
      return sendJson(res, { error: "Unauthorized" }, 401);
    }

    return sendJson(
      res,
      await getMeta(
        buildAuthorizedFilterInput(user, {
          company: readQueryValue(req.query, "company"),
          divisions: readCsvValue(req.query, "divisions"),
          baselineStart: readQueryValue(req.query, "baselineStart"),
          baselineEnd: readQueryValue(req.query, "baselineEnd")
        })
      )
    );
  } catch (error) {
    const httpError = toHttpError(error, 502, "Unknown handler error");
    return sendJson(res, formatHandlerError(httpError), httpError.status);
  }
}
