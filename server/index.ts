import cors from "cors";
import express from "express";
import path from "path";
import { APP_BRAND_NAME } from "../shared/appConfig.js";
import {
  approveAccessRequest,
  changePassword,
  createLocalUser,
  deleteAccessRequest,
  deleteLocalUser,
  formatAuthError,
  getAdminNotificationSummary,
  getAdminState,
  getAuthSubsystemStatus,
  getAuthUserFromToken,
  initializeAuthSubsystem,
  loginWithEmailPassword,
  logoutSession,
  registerAccessRequest,
  updateDataOceanTokenConfig,
  updateUserPermissions
} from "./handlers/auth.js";
import {
  forceRefreshRemoteSnapshot,
  formatHandlerError,
  getCacheStatus,
  getDashboard,
  getMeta,
  getPriceTrackingBootstrap,
  getProjectTrend,
  getProjects,
  getSummary,
  getTrend,
  scheduleRemoteSnapshotRefresh
} from "./handlers/pricing.js";
import { buildAuthorizedFilterInput, buildAuthorizedProjectParams } from "./services/dataApiAccess.js";
import {
  assertRateLimit,
  buildClearedSessionCookie,
  buildSessionCookie,
  HttpError,
  readClientAddress,
  readSessionTokenFromRequest,
  toHttpError
} from "./services/httpSecurity.js";

const app = express();
app.use(cors());
app.use(express.json());

function readSessionToken(req: express.Request) {
  return readSessionTokenFromRequest({
    authorizationHeader: req.headers.authorization,
    cookieHeader: req.headers.cookie
  });
}

function readCsvQuery(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readBaselineQuery(req: express.Request) {
  return {
    baselineStart: String(req.query.baselineStart ?? ""),
    baselineEnd: String(req.query.baselineEnd ?? "")
  };
}

function getRequestedCompany(req: express.Request) {
  return String(req.query.company ?? "");
}

function setSessionCookie(res: express.Response, token: string, expiresAt: string) {
  res.setHeader("Set-Cookie", buildSessionCookie(token, expiresAt));
}

function clearSessionCookie(res: express.Response) {
  res.setHeader("Set-Cookie", buildClearedSessionCookie());
}

async function requireAuthenticatedUser(req: express.Request) {
  const user = await getAuthUserFromToken(readSessionToken(req));
  if (!user) {
    throw new HttpError(401, "Unauthorized");
  }

  return user;
}

async function requireAdminUser(req: express.Request) {
  const user = await requireAuthenticatedUser(req);
  if (user.role !== "admin") {
    throw new HttpError(403, "Unauthorized admin request");
  }

  return user;
}

function sendAuthError(res: express.Response, error: unknown) {
  const httpError = toHttpError(error, 500, "Unknown auth error");
  return res.status(httpError.status).json(formatAuthError(httpError));
}

function sendHandlerError(res: express.Response, error: unknown) {
  const httpError = toHttpError(error, error instanceof HttpError ? error.status : 502, "Unknown handler error");
  return res.status(httpError.status).json(formatHandlerError(httpError));
}

app.get("/api/dashboard", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req);
    const filters = buildAuthorizedFilterInput(user, {
      company: getRequestedCompany(req),
      divisions: readCsvQuery(req.query.divisions),
      segments: readCsvQuery(req.query.segments),
      channels: readCsvQuery(req.query.channels),
      fcNames: readCsvQuery(req.query.fcNames),
      discountTypes: readCsvQuery(req.query.discountTypes),
      ...readBaselineQuery(req)
    });

    res.json(
      await getDashboard({
        ...filters,
        day: String(req.query.day ?? ""),
      })
    );
  } catch (error) {
    sendHandlerError(res, error);
  }
});

app.get("/api/meta", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req);
    res.json(
      await getMeta(
        buildAuthorizedFilterInput(user, {
          company: getRequestedCompany(req),
          divisions: readCsvQuery(req.query.divisions),
          ...readBaselineQuery(req)
        })
      )
    );
  } catch (error) {
    sendHandlerError(res, error);
  }
});

app.get("/api/summary", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req);
    const filters = buildAuthorizedFilterInput(user, {
      company: getRequestedCompany(req),
      divisions: readCsvQuery(req.query.divisions),
      segments: readCsvQuery(req.query.segments),
      channels: readCsvQuery(req.query.channels),
      fcNames: readCsvQuery(req.query.fcNames),
      discountTypes: readCsvQuery(req.query.discountTypes),
      ...readBaselineQuery(req)
    });

    res.json(
      await getSummary({
        ...filters,
        day: String(req.query.day ?? "")
      })
    );
  } catch (error) {
    sendHandlerError(res, error);
  }
});

app.get("/api/trend", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req);
    const filters = buildAuthorizedFilterInput(user, {
      company: getRequestedCompany(req),
      divisions: readCsvQuery(req.query.divisions),
      segments: readCsvQuery(req.query.segments),
      channels: readCsvQuery(req.query.channels),
      fcNames: readCsvQuery(req.query.fcNames),
      discountTypes: readCsvQuery(req.query.discountTypes),
      ...readBaselineQuery(req)
    });

    res.json(await getTrend(filters));
  } catch (error) {
    sendHandlerError(res, error);
  }
});

app.get("/api/projects", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req);
    res.json(
      await getProjects(
        buildAuthorizedProjectParams(user, {
          company: getRequestedCompany(req),
          search: String(req.query.search ?? ""),
          ladder: String(req.query.ladder ?? ""),
          day: String(req.query.day ?? ""),
          page: Number(req.query.page ?? 1),
          pageSize: Number(req.query.pageSize ?? 20),
          divisions: readCsvQuery(req.query.divisions),
          segments: readCsvQuery(req.query.segments),
          channels: readCsvQuery(req.query.channels),
          fcNames: readCsvQuery(req.query.fcNames),
          discountTypes: readCsvQuery(req.query.discountTypes),
          ...readBaselineQuery(req)
        })
      )
    );
  } catch (error) {
    sendHandlerError(res, error);
  }
});

app.get("/api/projects/:siteNo/trend", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req);
    res.json(
      await getProjectTrend(
        req.params.siteNo,
        buildAuthorizedFilterInput(user, {
          company: getRequestedCompany(req),
          divisions: readCsvQuery(req.query.divisions),
          segments: readCsvQuery(req.query.segments),
          channels: readCsvQuery(req.query.channels),
          fcNames: readCsvQuery(req.query.fcNames),
          discountTypes: readCsvQuery(req.query.discountTypes),
          ...readBaselineQuery(req)
        })
      )
    );
  } catch (error) {
    sendHandlerError(res, error);
  }
});

app.get("/api/price-tracking/bootstrap", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req);
    res.json(
      await getPriceTrackingBootstrap({
        ...buildAuthorizedProjectParams(user, {
          company: getRequestedCompany(req),
          search: String(req.query.search ?? ""),
          ladder: String(req.query.ladder ?? ""),
          day: String(req.query.day ?? ""),
          page: Number(req.query.page ?? 1),
          pageSize: Number(req.query.pageSize ?? 20),
          divisions: readCsvQuery(req.query.divisions),
          segments: readCsvQuery(req.query.segments),
          channels: readCsvQuery(req.query.channels),
          fcNames: readCsvQuery(req.query.fcNames),
          discountTypes: readCsvQuery(req.query.discountTypes),
          ...readBaselineQuery(req)
        }),
        selectedSite: String(req.query.selectedSite ?? "")
      })
    );
  } catch (error) {
    sendHandlerError(res, error);
  }
});

function canRefreshCache(req: express.Request) {
  const allowedTokens = [process.env.CACHE_REFRESH_TOKEN, process.env.CRON_SECRET]
    .map((value) => value ?? "")
    .filter(Boolean);

  if (allowedTokens.length === 0) {
    return false;
  }

  const authorization = req.headers.authorization ?? "";
  return allowedTokens.some((token) => authorization === `Bearer ${token}`);
}

app.get("/api/cache/status", async (req, res) => {
  try {
    await requireAdminUser(req);
    res.json(getCacheStatus());
  } catch (error) {
    sendHandlerError(res, error);
  }
});

app.all("/api/cache/refresh", async (req, res) => {
  try {
    const method = String(req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      throw new HttpError(405, "Method not allowed");
    }

    if (!canRefreshCache(req)) {
      if (method !== "POST") {
        throw new HttpError(401, "Unauthorized cache refresh request.");
      }
      await requireAdminUser(req);
    }
    await forceRefreshRemoteSnapshot();
    res.json(getCacheStatus());
  } catch (error) {
    sendHandlerError(res, error);
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    assertRateLimit({
      action: "register",
      key: readClientAddress({ headers: req.headers, fallback: req.ip }),
      maxRequests: 6,
      windowMs: 15 * 60 * 1000
    });
    res.json(await registerAccessRequest(req.body));
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    assertRateLimit({
      action: "login",
      key: `${readClientAddress({ headers: req.headers, fallback: req.ip })}:${String(req.body?.email ?? "").trim().toLowerCase()}`,
      maxRequests: 10,
      windowMs: 15 * 60 * 1000
    });
    const result = await loginWithEmailPassword(
      String(req.body?.email ?? ""),
      String(req.body?.password ?? "")
    );
    setSessionCookie(res, result.session.token, result.session.expiresAt);
    res.json(result.user);
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const token = readSessionToken(req);
    const user = await getAuthUserFromToken(token);
    if (!user) {
      res.json({ authenticated: false });
      return;
    }

    res.json({ authenticated: true, user });
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    await logoutSession(readSessionToken(req));
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.post("/api/auth/change-password", async (req, res) => {
  try {
    const result = await changePassword(readSessionToken(req), req.body);
    setSessionCookie(res, result.session.token, result.session.expiresAt);
    res.json({ ok: result.ok });
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.get("/api/auth/admin/state", async (req, res) => {
  try {
    res.json(await getAdminState(readSessionToken(req)));
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.get("/api/auth/admin/notifications", async (req, res) => {
  try {
    res.json(await getAdminNotificationSummary(readSessionToken(req)));
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.post("/api/auth/admin/requests/:requestId/approve", async (req, res) => {
  try {
    res.json(await approveAccessRequest(readSessionToken(req), req.params.requestId, req.body));
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.delete("/api/auth/admin/requests/:requestId", async (req, res) => {
  try {
    res.json(await deleteAccessRequest(readSessionToken(req), req.params.requestId));
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.patch("/api/auth/admin/users/:userId", async (req, res) => {
  try {
    res.json(await updateUserPermissions(readSessionToken(req), req.params.userId, req.body));
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.post("/api/auth/admin/users", async (req, res) => {
  try {
    res.json(await createLocalUser(readSessionToken(req), req.body));
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.delete("/api/auth/admin/users/:userId", async (req, res) => {
  try {
    res.json(await deleteLocalUser(readSessionToken(req), req.params.userId));
  } catch (error) {
    sendAuthError(res, error);
  }
});

app.put("/api/auth/admin/dataocean-token", async (req, res) => {
  try {
    res.json(await updateDataOceanTokenConfig(readSessionToken(req), req.body));
  } catch (error) {
    sendAuthError(res, error);
  }
});

const port = Number(process.env.PORT ?? 8787);

app.use(express.static(path.join(process.cwd(), "dist")));

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(process.cwd(), "dist/index.html"));
});

const server = app.listen(port, () => {
  console.log(`${APP_BRAND_NAME} API listening on http://localhost:${port}`);
  void initializeAuthSubsystem().catch((error) => {
    const status = getAuthSubsystemStatus();
    console.error("Auth subsystem warm-up failed:", status.schemaFailureMessage || error);
  });
  scheduleRemoteSnapshotRefresh();
});

(globalThis as typeof globalThis & { __pricingMonitorServer?: typeof server }).__pricingMonitorServer =
  server;
