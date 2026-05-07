import { getAuthUserFromToken } from "../../server/handlers/auth.js";
import { formatHandlerError, getProjects } from "../../server/handlers/pricing.js";
import { buildAuthorizedProjectParams } from "../../server/services/dataApiAccess.js";
import { readSessionTokenFromRequest, toHttpError } from "../../server/services/httpSecurity.js";
import type { ApiRequest, ApiResponse } from "../shared/http.js";
import { readCsvValue, readHeaderValue, readQueryValue, sendJson } from "../shared/http.js";

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
      await getProjects(
        buildAuthorizedProjectParams(user, {
          company: readQueryValue(req.query, "company"),
          search: readQueryValue(req.query, "search"),
          ladder: readQueryValue(req.query, "ladder"),
          day: readQueryValue(req.query, "day"),
          page: Number(readQueryValue(req.query, "page") || 1),
          pageSize: Number(readQueryValue(req.query, "pageSize") || 20),
          divisions: readCsvValue(req.query, "divisions"),
          segments: readCsvValue(req.query, "segments"),
          channels: readCsvValue(req.query, "channels"),
          fcNames: readCsvValue(req.query, "fcNames"),
          discountTypes: readCsvValue(req.query, "discountTypes"),
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
