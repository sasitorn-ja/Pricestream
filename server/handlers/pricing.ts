import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BASELINE_END,
  BASELINE_START,
  TARGET_INCREASE
} from "../config/pricing.js";
import {
  buildAnalytics,
  getAnalyticsConfig,
  type DivisionPriceTrendPoint,
  type PricingRecord,
  type ProjectRow,
  type ProjectTrendRow,
  type SummaryStats,
  type TrendPoint
} from "../services/analytics/index.js";
import { resolveDataOceanRuntimeConfig } from "../services/dataOceanConfig.js";
import { getSql } from "../services/db.js";
import { resolveAuthorizedCompany } from "../services/accessControl.js";
import {
  COMPANY_DASHBOARD_DIVISIONS,
  PERSISTED_ANALYTICS_SNAPSHOT_FILENAME,
  PERSISTED_CACHE_FILENAME
} from "../../shared/appConfig.js";

type SnapshotCompany = "CPAC" | "QMIX";
type SnapshotBaseKind = "single" | "overview" | "projects" | "project-trend";
type SnapshotProjectsChunkGroup = "projectsLatest" | "dailyProjects" | "metricRecords";
type SnapshotProjectsChunkKind = `projects:${SnapshotProjectsChunkGroup}:${number}`;
type SnapshotProjectTrendChunkKind = `project-trend:entries:${number}`;
type SnapshotChunkKind = SnapshotProjectsChunkKind | SnapshotProjectTrendChunkKind;
type SnapshotKind = SnapshotBaseKind | SnapshotChunkKind | "lock";
type SnapshotStrategy =
  | "single"
  | "overview+projects"
  | "overview+projects+project-trend"
  | "chunked-required";

type CompactMetricRecord = PricingRecord & {
  searchText: string;
};

type AvailableFilters = ReturnType<typeof getAvailableFilters>;

type FilterParams = {
  company?: string;
  divisions?: string[];
  segments?: string[];
  channels?: string[];
  fcNames?: string[];
  discountTypes?: string[];
  day?: string;
  baselineStart?: string;
  baselineEnd?: string;
};

type SnapshotOverviewPayload = {
  metadata: {
    total_rows: number;
    total_sites: number;
    min_dp_date: string | null;
    max_dp_date: string | null;
  };
  summary: SummaryStats;
  summaryByDay: Record<string, SummaryStats>;
  trend: TrendPoint[];
  divisionPriceTrend: DivisionPriceTrendPoint[];
  availableFilters: AvailableFilters;
};

type SnapshotProjectsPayload = {
  projectsLatest: ProjectRow[];
  dailyProjects: ProjectRow[];
  metricRecords: CompactMetricRecord[];
};

type SnapshotProjectTrendPayload = {
  projectTrendMap: Record<string, ProjectTrendRow[]>;
};

type SnapshotProjectsChunkPayload = {
  group: SnapshotProjectsChunkGroup;
  chunkIndex: number;
  chunkCount: number;
  rows: ProjectRow[] | CompactMetricRecord[];
};

type SnapshotProjectTrendChunkPayload = {
  chunkIndex: number;
  chunkCount: number;
  entries: Array<[string, ProjectTrendRow[]]>;
};

type SnapshotSinglePayload = SnapshotOverviewPayload &
  SnapshotProjectsPayload &
  SnapshotProjectTrendPayload;

type SnapshotPayloadByKind = {
  single: SnapshotSinglePayload;
  overview: SnapshotOverviewPayload;
  projects: SnapshotProjectsPayload;
  "project-trend": SnapshotProjectTrendPayload;
};

type SnapshotChunkPayloadByKind = {
  [K in SnapshotProjectsChunkKind]: SnapshotProjectsChunkPayload;
} & {
  [K in SnapshotProjectTrendChunkKind]: SnapshotProjectTrendChunkPayload;
};

type SnapshotPayloadByEnvelopeKind = SnapshotPayloadByKind & SnapshotChunkPayloadByKind;

type SnapshotEnvelope<K extends keyof SnapshotPayloadByEnvelopeKind = keyof SnapshotPayloadByEnvelopeKind> = {
  schemaVersion: number;
  company: SnapshotCompany;
  kind: K;
  strategy: SnapshotStrategy;
  fetchedAt: string;
  generatedAt: string;
  rawRecordCount: number;
  compactRecordCount: number;
  snapshotBytes: number;
  contentHash: string;
  payload: SnapshotPayloadByEnvelopeKind[K];
};

type LoadedCompanySnapshot = {
  company: SnapshotCompany;
  strategy: SnapshotStrategy;
  fetchedAt: string;
  generatedAt: string;
  rawRecordCount: number;
  compactRecordCount: number;
  overview: SnapshotOverviewPayload;
  projects: SnapshotProjectsPayload;
  projectTrendMap: Record<string, ProjectTrendRow[]>;
  snapshotBytes: Record<string, number>;
};

type InternalSnapshot = {
  metadata: SnapshotOverviewPayload["metadata"];
  summary: SummaryStats;
  summaryByDay: Map<string, SummaryStats>;
  trend: TrendPoint[];
  divisionPriceTrend: DivisionPriceTrendPoint[];
  projects: ProjectRow[];
  dailyProjects: ProjectRow[];
  projectTrendMap: Map<string, ProjectTrendRow[]>;
};

type FreshnessMetadata = {
  generatedAt: string;
  snapshotFetchedAt: string | null;
  isStale: boolean;
  isRefreshing: boolean;
  hasData: boolean;
  refreshError: string | null;
};

type FilteredSnapshotArtifacts = {
  snapshot: InternalSnapshot;
  availableFilters: AvailableFilters;
  freshness: FreshnessMetadata;
};

type RollingStats = {
  values: number[];
};

type CompanyBenchmarkMetrics = {
  remoteFetchMs: number;
  jsonParseMs: number;
  compactMetricsBuildMs: number;
  buildAnalyticsMs: number;
  serializeSnapshotMs: number;
  persistSnapshotMs: number;
  snapshotBytes: {
    single: number;
    overview: number;
    projects: number;
    "project-trend": number;
  };
  strategy: SnapshotStrategy;
  rawRecordCount: number;
  compactRecordCount: number;
  generatedAt: string;
};

type SnapshotDbRow = {
  snapshot_key: string;
  company: string;
  kind: string;
  snapshot_json: unknown;
  record_count: number | null;
  snapshot_bytes: number | null;
  fetched_at: string | null;
  generated_at: string | null;
  schema_version: number;
  content_hash: string | null;
  last_error: string | null;
  lock_owner: string | null;
  lock_acquired_at: string | null;
  lock_expires_at: string | null;
  updated_at?: string | null;
};

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_SINGLE_THRESHOLD_BYTES = 5 * 1024 * 1024;
const SNAPSHOT_PROJECT_TREND_THRESHOLD_BYTES = 15 * 1024 * 1024;
const SNAPSHOT_HARD_STOP_THRESHOLD_BYTES = 25 * 1024 * 1024;
const SNAPSHOT_CHUNK_TARGET_BYTES = 4 * 1024 * 1024;

function readNumberEnv(name: string) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    return Number.NaN;
  }

  return Number(rawValue);
}

const DEFAULT_REMOTE_FETCH_TIMEOUT_MS = 8_000;
const parsedRemoteFetchTimeoutMs = readNumberEnv("DATAOCEAN_TIMEOUT_MS");
const REMOTE_FETCH_TIMEOUT_MS =
  Number.isFinite(parsedRemoteFetchTimeoutMs) && parsedRemoteFetchTimeoutMs > 0
    ? parsedRemoteFetchTimeoutMs
    : DEFAULT_REMOTE_FETCH_TIMEOUT_MS;
const DEFAULT_CACHE_PRELOAD_INTERVAL_MS = 24 * 60 * 60 * 1000;
const parsedCachePreloadIntervalMs = readNumberEnv("DATA_CACHE_PRELOAD_INTERVAL_MS");
const CACHE_PRELOAD_INTERVAL_MS =
  Number.isFinite(parsedCachePreloadIntervalMs) && parsedCachePreloadIntervalMs > 0
    ? parsedCachePreloadIntervalMs
    : DEFAULT_CACHE_PRELOAD_INTERVAL_MS;
const DEFAULT_BUSY_HOURS_CACHE_PRELOAD_INTERVAL_MS = 15 * 60 * 1000;
const parsedBusyHoursCachePreloadIntervalMs = readNumberEnv("DATA_CACHE_BUSY_HOURS_INTERVAL_MS");
const BUSY_HOURS_CACHE_PRELOAD_INTERVAL_MS =
  Number.isFinite(parsedBusyHoursCachePreloadIntervalMs) && parsedBusyHoursCachePreloadIntervalMs > 0
    ? parsedBusyHoursCachePreloadIntervalMs
    : DEFAULT_BUSY_HOURS_CACHE_PRELOAD_INTERVAL_MS;
const DEFAULT_BUSINESS_HOURS_START = 7;
const DEFAULT_BUSINESS_HOURS_END = 19;
const parsedBusinessHoursStart = readNumberEnv("DATA_CACHE_BUSINESS_HOUR_START");
const parsedBusinessHoursEnd = readNumberEnv("DATA_CACHE_BUSINESS_HOUR_END");
const BUSINESS_HOUR_START =
  Number.isFinite(parsedBusinessHoursStart) && parsedBusinessHoursStart >= 0 && parsedBusinessHoursStart <= 23
    ? parsedBusinessHoursStart
    : DEFAULT_BUSINESS_HOURS_START;
const BUSINESS_HOUR_END =
  Number.isFinite(parsedBusinessHoursEnd) && parsedBusinessHoursEnd >= 0 && parsedBusinessHoursEnd <= 23
    ? parsedBusinessHoursEnd
    : DEFAULT_BUSINESS_HOURS_END;
const BUSINESS_TIME_ZONE = process.env.DATA_CACHE_BUSINESS_TIMEZONE || "Asia/Bangkok";
const DEFAULT_FRESHNESS_SLA_MS = 5 * 60 * 1000;
const parsedFreshnessSlaMs = readNumberEnv("DATA_FRESHNESS_SLA_MS");
const DATA_FRESHNESS_SLA_MS =
  Number.isFinite(parsedFreshnessSlaMs) && parsedFreshnessSlaMs > 0
    ? parsedFreshnessSlaMs
    : DEFAULT_FRESHNESS_SLA_MS;
const DEFAULT_STRICT_REFRESH_WAIT_MS = 12_000;
const parsedStrictRefreshWaitMs = readNumberEnv("DATA_STRICT_REFRESH_WAIT_MS");
const DATA_STRICT_REFRESH_WAIT_MS =
  Number.isFinite(parsedStrictRefreshWaitMs) && parsedStrictRefreshWaitMs >= 0
    ? parsedStrictRefreshWaitMs
    : DEFAULT_STRICT_REFRESH_WAIT_MS;
const DEFAULT_REFRESH_LOCK_TTL_MS = 120_000;
const parsedRefreshLockTtlMs = readNumberEnv("DATA_REFRESH_LOCK_TTL_MS");
const DATA_REFRESH_LOCK_TTL_MS =
  Number.isFinite(parsedRefreshLockTtlMs) && parsedRefreshLockTtlMs > 0
    ? parsedRefreshLockTtlMs
    : DEFAULT_REFRESH_LOCK_TTL_MS;
const DEFAULT_STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const parsedStaleMaxAgeMs = readNumberEnv("DATA_SERVE_STALE_MAX_AGE_MS");
const DATA_SERVE_STALE_MAX_AGE_MS =
  Number.isFinite(parsedStaleMaxAgeMs) && parsedStaleMaxAgeMs > 0
    ? parsedStaleMaxAgeMs
    : DEFAULT_STALE_MAX_AGE_MS;
const REMOTE_FETCH_MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1_000;
const PERSISTED_CACHE_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), ".cache");
const PERSISTED_CACHE_PATH = path.join(PERSISTED_CACHE_DIR, PERSISTED_ANALYTICS_SNAPSHOT_FILENAME);
const LEGACY_PERSISTED_RECORDS_PATH = path.join(PERSISTED_CACHE_DIR, PERSISTED_CACHE_FILENAME);
const GLOBAL_LOCK_SNAPSHOT_KEY = "pricing:global:lock";

const companySnapshotMemoryCache = new Map<
  SnapshotCompany,
  {
    snapshot: LoadedCompanySnapshot;
    loadedAt: number;
  }
>();
const filteredSnapshotCache = new Map<
  string,
  {
    snapshot: InternalSnapshot;
    availableFilters: AvailableFilters;
    fetchedAt: string;
  }
>();
const rollingNeonReadMetricsByCompany = new Map<SnapshotCompany, RollingStats>();
const latestBenchmarkByCompany = new Map<SnapshotCompany, CompanyBenchmarkMetrics>();
let snapshotSchemaReady: Promise<void> | null = null;
let pendingDbHydration = new Map<SnapshotCompany, Promise<LoadedCompanySnapshot | null>>();
let pendingRefreshPromise: Promise<void> | null = null;
let cachePreloadTimer: ReturnType<typeof setTimeout> | null = null;
let lastRefreshError: string | null = null;
let lastRefreshStartedAt = 0;
let lastRefreshCompletedAt = 0;
let lastServedSource = "empty";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIsoTime(value = Date.now()) {
  return new Date(value).toISOString();
}

function parseIsoTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

function logTiming(
  operation: string,
  startedAt: number,
  details: Record<string, string | number | boolean | null> = {}
) {
  console.info(
    `[pricing] ${operation}`,
    JSON.stringify({
      durationMs: roundMs(startedAt),
      ...details
    })
  );
}

function isSnapshotCompany(value: string): value is SnapshotCompany {
  return value === "CPAC" || value === "QMIX";
}

function normalizeCompany(company = ""): SnapshotCompany {
  const resolved = company.trim().toUpperCase();
  if (isSnapshotCompany(resolved)) {
    return resolved;
  }

  return "CPAC";
}

function getSnapshotKey(company: string, kind: string) {
  return `pricing:${company}:${kind}`;
}

function getCurrentHourInTimeZone() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: BUSINESS_TIME_ZONE
  });
  const hour = Number(formatter.format(new Date()));
  return Number.isFinite(hour) ? hour : 0;
}

function isBusinessHour() {
  const hour = getCurrentHourInTimeZone();
  if (BUSINESS_HOUR_START === BUSINESS_HOUR_END) {
    return true;
  }

  if (BUSINESS_HOUR_START < BUSINESS_HOUR_END) {
    return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
  }

  return hour >= BUSINESS_HOUR_START || hour < BUSINESS_HOUR_END;
}

function getNextWarmIntervalMs() {
  return isBusinessHour() ? BUSY_HOURS_CACHE_PRELOAD_INTERVAL_MS : CACHE_PRELOAD_INTERVAL_MS;
}

function percentile(values: number[], rank: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(rank * sorted.length) - 1));
  return Math.round(sorted[index]);
}

function pushRollingMetric(collection: Map<SnapshotCompany, RollingStats>, company: SnapshotCompany, value: number) {
  const current = collection.get(company) ?? { values: [] };
  current.values.push(value);
  if (current.values.length > 40) {
    current.values.shift();
  }
  collection.set(company, current);
}

function getRollingMetricSummary(collection: Map<SnapshotCompany, RollingStats>, company: SnapshotCompany) {
  const values = collection.get(company)?.values ?? [];
  const latestValue = values.length > 0 ? values[values.length - 1] ?? 0 : 0;
  return {
    count: values.length,
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    latest: latestValue
  };
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function getSerializedBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value));
}

function isProjectsChunkEnvelope(
  envelope: SnapshotEnvelope
): envelope is SnapshotEnvelope<SnapshotProjectsChunkKind> {
  return envelope.kind.startsWith("projects:");
}

function isProjectTrendChunkEnvelope(
  envelope: SnapshotEnvelope
): envelope is SnapshotEnvelope<SnapshotProjectTrendChunkKind> {
  return envelope.kind.startsWith("project-trend:entries:");
}

function getProjectsChunkKind(group: SnapshotProjectsChunkGroup, chunkIndex: number): SnapshotProjectsChunkKind {
  return `projects:${group}:${chunkIndex}` as SnapshotProjectsChunkKind;
}

function getProjectTrendChunkKind(chunkIndex: number): SnapshotProjectTrendChunkKind {
  return `project-trend:entries:${chunkIndex}` as SnapshotProjectTrendChunkKind;
}

function chunkBySerializedBytes<T>(items: T[], maxBytes: number) {
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 2;

  for (const item of items) {
    const itemBytes = getSerializedBytes(item) + 1;
    if (current.length > 0 && currentBytes + itemBytes > maxBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }

    current.push(item);
    currentBytes += itemBytes;
  }

  if (current.length > 0 || items.length === 0) {
    chunks.push(current);
  }

  return chunks;
}

function normalizeFilterValues(values: string[] = []) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).sort();
}

function hasFilterValues(filters: FilterParams) {
  return (
    normalizeFilterValues(filters.divisions).length > 0 ||
    normalizeFilterValues(filters.segments).length > 0 ||
    normalizeFilterValues(filters.channels).length > 0 ||
    normalizeFilterValues(filters.fcNames).length > 0 ||
    normalizeFilterValues(filters.discountTypes).length > 0
  );
}

function normalizeLadderValues(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).sort();
}

function buildNormalizedFilterCacheKey(filters: FilterParams) {
  const analyticsConfig = getAnalyticsConfig({
    baselineStart: filters.baselineStart,
    baselineEnd: filters.baselineEnd
  });

  return JSON.stringify({
    company: normalizeCompany(filters.company),
    divisions: normalizeFilterValues(filters.divisions),
    segments: normalizeFilterValues(filters.segments),
    channels: normalizeFilterValues(filters.channels),
    fcNames: normalizeFilterValues(filters.fcNames),
    discountTypes: normalizeFilterValues(filters.discountTypes),
    baselineStart: analyticsConfig.baselineStart,
    baselineEnd: analyticsConfig.baselineEnd
  });
}

function buildFreshnessMetadata(snapshot: LoadedCompanySnapshot | null): FreshnessMetadata {
  if (!snapshot) {
    return {
      generatedAt: toIsoTime(),
      snapshotFetchedAt: null,
      isStale: true,
      isRefreshing: Boolean(pendingRefreshPromise),
      hasData: false,
      refreshError: lastRefreshError
    };
  }

  const fetchedAtMs = parseIsoTime(snapshot.fetchedAt);
  const isStale = fetchedAtMs > 0 ? Date.now() - fetchedAtMs > DATA_FRESHNESS_SLA_MS : true;
  return {
    generatedAt: snapshot.generatedAt,
    snapshotFetchedAt: snapshot.fetchedAt,
    isStale,
    isRefreshing: Boolean(pendingRefreshPromise),
    hasData: true,
    refreshError: lastRefreshError
  };
}

function buildSummaryByDayRecord(summaryByDay: Map<string, SummaryStats>) {
  return Object.fromEntries(summaryByDay.entries());
}

function buildProjectTrendMapRecord(projectTrendMap: Map<string, ProjectTrendRow[]>) {
  return Object.fromEntries(projectTrendMap.entries());
}

function buildProjectTrendMapFromDailyProjects(dailyProjects: ProjectRow[]) {
  const map = new Map<string, ProjectTrendRow[]>();

  for (const row of dailyProjects) {
    const rows = map.get(row.siteNo) ?? [];
    rows.push({
      siteNo: row.siteNo,
      siteName: row.siteName,
      day: row.latestDay,
      baselineNetPrice: row.baselineNetPrice,
      postNetPrice: row.currentNetPrice,
      increaseAmount: row.increaseAmount,
      targetPercent: row.targetPercent,
      ladder: row.ladder
    });
    map.set(row.siteNo, rows);
  }

  for (const rows of map.values()) {
    rows.sort((left, right) => left.day.localeCompare(right.day));
  }

  return Object.fromEntries(map.entries());
}

function buildInternalSnapshotFromLoadedSnapshot(snapshot: LoadedCompanySnapshot): InternalSnapshot {
  return {
    metadata: snapshot.overview.metadata,
    summary: snapshot.overview.summary,
    summaryByDay: new Map(Object.entries(snapshot.overview.summaryByDay)),
    trend: snapshot.overview.trend,
    divisionPriceTrend: snapshot.overview.divisionPriceTrend,
    projects: snapshot.projects.projectsLatest,
    dailyProjects: snapshot.projects.dailyProjects,
    projectTrendMap: new Map(Object.entries(snapshot.projectTrendMap))
  };
}

function buildMetaFromArtifacts(
  snapshot: InternalSnapshot,
  availableFilters: AvailableFilters,
  analyticsConfig = getAnalyticsConfig()
) {
  return {
    metadata: snapshot.metadata,
    config: {
      baselineStart: analyticsConfig.baselineStart,
      baselineEnd: analyticsConfig.baselineEnd,
      campaignStart: analyticsConfig.campaignStart,
      targetIncrease: TARGET_INCREASE
    },
    filters: {
      ...availableFilters
    }
  };
}

function filterMetricRecords(records: CompactMetricRecord[], filters: FilterParams) {
  const divisions = new Set(normalizeFilterValues(filters.divisions));
  const segments = new Set(normalizeFilterValues(filters.segments));
  const channels = new Set(normalizeFilterValues(filters.channels));
  const fcNames = new Set(normalizeFilterValues(filters.fcNames));
  const discountTypes = new Set(normalizeFilterValues(filters.discountTypes));
  const company = normalizeCompany(filters.company);
  const companyDivisions = COMPANY_DASHBOARD_DIVISIONS[company] ?? [];
  const hasAllCompanyDivisions =
    divisions.size === companyDivisions.length &&
    companyDivisions.every((division) => divisions.has(division));

  if (!hasFilterValues(filters)) {
    return records;
  }

  return records.filter((record) => {
    const divisionName = String(record.DIVISION_NAME ?? "").trim();
    const fcName = String(record.FC_NAME ?? "").trim();
    const matchesDivision = divisions.size === 0 || divisions.has(divisionName);
    const matchesFcName = fcNames.size === 0 || fcNames.has(fcName);
    const matchesDivisionOrFc =
      fcNames.size === 0
        ? matchesDivision
        : hasAllCompanyDivisions
          ? matchesFcName
          : matchesDivision || matchesFcName;
    const matchesSegment =
      segments.size === 0 || segments.has(String(record.SEGMENT ?? "").trim());
    const matchesChannel =
      channels.size === 0 || channels.has(String(record.CHANNEL ?? "").trim());
    const matchesDiscountType =
      discountTypes.size === 0 || discountTypes.has(String(record.DISCOUNT_TYPE ?? "").trim());

    return (
      matchesDivisionOrFc &&
      matchesSegment &&
      matchesChannel &&
      matchesDiscountType
    );
  });
}

function getAvailableFilters(records: Array<Pick<CompactMetricRecord, "DIVISION_NAME" | "SEGMENT" | "CHANNEL" | "DISCOUNT_TYPE" | "FC_NAME">>) {
  const divisions = new Set<string>();
  const segments = new Set<string>();
  const channels = new Set<string>();
  const discountTypes = new Set<string>();
  const fcNamesByDivision: Record<string, string[]> = {};

  for (const record of records) {
    const division = String(record.DIVISION_NAME ?? "").trim();
    const segment = String(record.SEGMENT ?? "").trim();
    const channel = String(record.CHANNEL ?? "").trim();
    const discountType = String(record.DISCOUNT_TYPE ?? "").trim();
    const fcName = String(record.FC_NAME ?? "").trim();

    if (division) divisions.add(division);
    if (segment) segments.add(segment);
    if (channel) channels.add(channel);
    if (discountType) discountTypes.add(discountType);

    if (division && fcName) {
      fcNamesByDivision[division] = fcNamesByDivision[division] ?? [];
      if (!fcNamesByDivision[division].includes(fcName)) {
        fcNamesByDivision[division].push(fcName);
      }
    }
  }

  for (const names of Object.values(fcNamesByDivision)) {
    names.sort();
  }

  return {
    divisions: [...divisions].sort(),
    segments: [...segments].sort(),
    channels: [...channels].sort(),
    discountTypes: [...discountTypes].sort(),
    fcNamesByDivision
  };
}

function buildEmptySnapshot(filters: Pick<FilterParams, "baselineStart" | "baselineEnd"> = {}): InternalSnapshot {
  const analytics = buildAnalytics([], {
    baselineStart: filters.baselineStart,
    baselineEnd: filters.baselineEnd
  });
  return {
    metadata: analytics.metadata,
    summary: analytics.summary,
    summaryByDay: analytics.summaryByDay,
    trend: analytics.trend,
    divisionPriceTrend: analytics.divisionPriceTrend,
    projects: analytics.projects,
    dailyProjects: analytics.dailyProjects,
    projectTrendMap: analytics.projectTrendMap
  };
}

async function ensureSnapshotSchema() {
  if (!snapshotSchemaReady) {
    snapshotSchemaReady = (async () => {
      const sql = getSql();
      await sql`
        create table if not exists app_pricing_snapshots (
          snapshot_key text primary key,
          company text not null,
          kind text not null,
          snapshot_json jsonb,
          record_count integer,
          snapshot_bytes integer,
          fetched_at timestamptz,
          generated_at timestamptz,
          schema_version integer not null default 1,
          content_hash text,
          last_error text,
          lock_owner text,
          lock_acquired_at timestamptz,
          lock_expires_at timestamptz,
          updated_at timestamptz not null default now()
        )
      `;
      await sql`
        create unique index if not exists app_pricing_snapshots_company_kind_idx
        on app_pricing_snapshots (company, kind)
      `;
    })();
  }

  await snapshotSchemaReady;
}

async function readPersistedLocalSnapshots() {
  try {
    const raw = await readFile(PERSISTED_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, SnapshotEnvelope[]>;
    return parsed;
  } catch {
    return {};
  }
}

async function persistLocalSnapshots(entries: Record<string, SnapshotEnvelope[]>) {
  await mkdir(path.dirname(PERSISTED_CACHE_PATH), { recursive: true });
  await writeFile(PERSISTED_CACHE_PATH, JSON.stringify(entries));
}

function buildProjectsPayloadFromChunkEnvelopes(envelopes: SnapshotEnvelope[]): SnapshotProjectsPayload | null {
  const chunks = envelopes.filter(isProjectsChunkEnvelope);
  if (chunks.length === 0) {
    return null;
  }

  const projectsLatest: ProjectRow[] = [];
  const dailyProjects: ProjectRow[] = [];
  const metricRecords: CompactMetricRecord[] = [];

  for (const group of ["projectsLatest", "dailyProjects", "metricRecords"] as const) {
    const groupChunks = chunks
      .filter((envelope) => envelope.payload.group === group)
      .sort((left, right) => left.payload.chunkIndex - right.payload.chunkIndex);
    const chunkCount = groupChunks[0]?.payload.chunkCount ?? 0;

    if (groupChunks.length !== chunkCount) {
      return null;
    }

    for (const envelope of groupChunks) {
      if (group === "metricRecords") {
        metricRecords.push(...(envelope.payload.rows as CompactMetricRecord[]));
      } else if (group === "dailyProjects") {
        dailyProjects.push(...(envelope.payload.rows as ProjectRow[]));
      } else {
        projectsLatest.push(...(envelope.payload.rows as ProjectRow[]));
      }
    }
  }

  return {
    projectsLatest,
    dailyProjects,
    metricRecords
  };
}

function buildProjectTrendPayloadFromChunkEnvelopes(envelopes: SnapshotEnvelope[]): SnapshotProjectTrendPayload | null {
  const chunks = envelopes
    .filter(isProjectTrendChunkEnvelope)
    .sort((left, right) => left.payload.chunkIndex - right.payload.chunkIndex);

  if (chunks.length === 0) {
    return null;
  }

  const chunkCount = chunks[0]?.payload.chunkCount ?? 0;
  if (chunks.length !== chunkCount) {
    return null;
  }

  return {
    projectTrendMap: Object.fromEntries(chunks.flatMap((chunk) => chunk.payload.entries))
  };
}

function buildLoadedSnapshotFromEnvelopes(
  company: SnapshotCompany,
  envelopes: SnapshotEnvelope[]
): LoadedCompanySnapshot | null {
  const singleEnvelope = envelopes.find((envelope) => envelope.kind === "single") as
    | SnapshotEnvelope<"single">
    | undefined;
  const overviewEnvelope = envelopes.find((envelope) => envelope.kind === "overview") as
    | SnapshotEnvelope<"overview">
    | undefined;
  const projectsEnvelope = envelopes.find((envelope) => envelope.kind === "projects") as
    | SnapshotEnvelope<"projects">
    | undefined;
  const projectTrendEnvelope = envelopes.find((envelope) => envelope.kind === "project-trend") as
    | SnapshotEnvelope<"project-trend">
    | undefined;

  if (singleEnvelope) {
    return {
      company,
      strategy: singleEnvelope.strategy,
      fetchedAt: singleEnvelope.fetchedAt,
      generatedAt: singleEnvelope.generatedAt,
      rawRecordCount: singleEnvelope.rawRecordCount,
      compactRecordCount: singleEnvelope.compactRecordCount,
      overview: {
        metadata: singleEnvelope.payload.metadata,
        summary: singleEnvelope.payload.summary,
        summaryByDay: singleEnvelope.payload.summaryByDay,
        trend: singleEnvelope.payload.trend,
        divisionPriceTrend: singleEnvelope.payload.divisionPriceTrend,
        availableFilters: singleEnvelope.payload.availableFilters
      },
      projects: {
        projectsLatest: singleEnvelope.payload.projectsLatest,
        dailyProjects: singleEnvelope.payload.dailyProjects,
        metricRecords: singleEnvelope.payload.metricRecords
      },
      projectTrendMap: singleEnvelope.payload.projectTrendMap,
      snapshotBytes: {
        single: singleEnvelope.snapshotBytes,
        overview: singleEnvelope.snapshotBytes,
        projects: singleEnvelope.snapshotBytes,
        "project-trend": singleEnvelope.snapshotBytes
      }
    };
  }

  if (!overviewEnvelope || !projectsEnvelope) {
    const chunkedProjectsPayload = buildProjectsPayloadFromChunkEnvelopes(envelopes);
    if (!overviewEnvelope || !chunkedProjectsPayload) {
      return null;
    }

    const chunkedProjectTrendPayload = buildProjectTrendPayloadFromChunkEnvelopes(envelopes);
    return {
      company,
      strategy: overviewEnvelope.strategy,
      fetchedAt: overviewEnvelope.fetchedAt,
      generatedAt: overviewEnvelope.generatedAt,
      rawRecordCount: overviewEnvelope.rawRecordCount,
      compactRecordCount: overviewEnvelope.compactRecordCount,
      overview: overviewEnvelope.payload,
      projects: chunkedProjectsPayload,
      projectTrendMap:
        projectTrendEnvelope?.payload.projectTrendMap ??
        chunkedProjectTrendPayload?.projectTrendMap ??
        buildProjectTrendMapFromDailyProjects(chunkedProjectsPayload.dailyProjects),
      snapshotBytes: {
        single: 0,
        overview: overviewEnvelope.snapshotBytes,
        projects: envelopes
          .filter(isProjectsChunkEnvelope)
          .reduce((sum, envelope) => sum + envelope.snapshotBytes, 0),
        "project-trend":
          projectTrendEnvelope?.snapshotBytes ??
          envelopes
            .filter(isProjectTrendChunkEnvelope)
            .reduce((sum, envelope) => sum + envelope.snapshotBytes, 0)
      }
    };
  }

  return {
    company,
    strategy: overviewEnvelope.strategy,
    fetchedAt: overviewEnvelope.fetchedAt,
    generatedAt: overviewEnvelope.generatedAt,
    rawRecordCount: overviewEnvelope.rawRecordCount,
    compactRecordCount: overviewEnvelope.compactRecordCount,
    overview: overviewEnvelope.payload,
    projects: projectsEnvelope.payload,
    projectTrendMap:
      projectTrendEnvelope?.payload.projectTrendMap ??
      buildProjectTrendMapFromDailyProjects(projectsEnvelope.payload.dailyProjects),
    snapshotBytes: {
      single: 0,
      overview: overviewEnvelope.snapshotBytes,
      projects: projectsEnvelope.snapshotBytes,
      "project-trend": projectTrendEnvelope?.snapshotBytes ?? 0
    }
  };
}

async function readLegacyPersistedRecords() {
  try {
    const raw = await readFile(LEGACY_PERSISTED_RECORDS_PATH, "utf8");
    const parsed = JSON.parse(raw) as { fetchedAt?: unknown; records?: unknown };
    const records = Array.isArray(parsed.records) ? (parsed.records as PricingRecord[]) : [];
    if (records.length === 0) {
      return null;
    }

    const fetchedAtNumber =
      typeof parsed.fetchedAt === "number"
        ? parsed.fetchedAt
        : Number(String(parsed.fetchedAt ?? ""));

    return {
      records,
      fetchedAtIso: Number.isFinite(fetchedAtNumber) && fetchedAtNumber > 0 ? toIsoTime(fetchedAtNumber) : toIsoTime()
    };
  } catch {
    return null;
  }
}

async function buildSnapshotsFromLegacyRecords() {
  const legacy = await readLegacyPersistedRecords();
  if (!legacy) {
    return null;
  }

  const compactMetrics = buildCompactMetricRecords(legacy.records);
  const remoteBenchmark = {
    remoteFetchMs: 0,
    jsonParseMs: 0,
    compactMetricsBuildMs: compactMetrics.durationMs
  };
  const envelopesByCompany: Record<string, SnapshotEnvelope[]> = {
    CPAC: buildSnapshotEnvelopes(
      "CPAC",
      scopeMetricsToCompany(compactMetrics.records, "CPAC"),
      legacy.records.length,
      remoteBenchmark,
      legacy.fetchedAtIso
    ),
    QMIX: buildSnapshotEnvelopes(
      "QMIX",
      scopeMetricsToCompany(compactMetrics.records, "QMIX"),
      legacy.records.length,
      remoteBenchmark,
      legacy.fetchedAtIso
    )
  };

  await persistBuiltSnapshotsToLocalFile(envelopesByCompany);
  void persistSnapshotRowsToDb([...envelopesByCompany.CPAC, ...envelopesByCompany.QMIX]).catch(() => {
    // Local snapshot hydration should work even when Neon is unavailable.
  });

  return envelopesByCompany;
}

async function loadCompanySnapshotFromDb(company: SnapshotCompany) {
  await ensureSnapshotSchema();
  const sql = getSql();
  const startedAt = performance.now();
  const rows = (await sql`
    select *
    from app_pricing_snapshots
    where company = ${company}
      and (
        kind in ('single', 'overview', 'projects', 'project-trend')
        or kind like 'projects:%'
        or kind like 'project-trend:entries:%'
      )
  `) as SnapshotDbRow[];
  const neonReadMs = roundMs(startedAt);
  pushRollingMetric(rollingNeonReadMetricsByCompany, company, neonReadMs);

  if (rows.length === 0) {
    return null;
  }

  return buildLoadedSnapshotFromEnvelopes(
    company,
    rows.map((row) => row.snapshot_json as SnapshotEnvelope)
  );
}

async function hydrateCompanySnapshot(company: SnapshotCompany) {
  const cached = companySnapshotMemoryCache.get(company);
  if (cached) {
    return cached.snapshot;
  }

  const pending = pendingDbHydration.get(company);
  if (pending) {
    return pending;
  }

  const nextPromise = (async () => {
    const fromDb = await loadCompanySnapshotFromDb(company).catch(() => null);
    if (fromDb) {
      companySnapshotMemoryCache.set(company, {
        snapshot: fromDb,
        loadedAt: Date.now()
      });
      pendingDbHydration.delete(company);
      return fromDb;
    }

    const localSnapshots = await readPersistedLocalSnapshots();
    const localRows = localSnapshots[company] ?? [];
    if (localRows.length > 0) {
      const localSnapshot = buildLoadedSnapshotFromEnvelopes(company, localRows);
      if (localSnapshot) {
        companySnapshotMemoryCache.set(company, {
          snapshot: localSnapshot,
          loadedAt: Date.now()
        });
        void persistSnapshotRowsToDb(localRows).catch(() => {
          // Local snapshots are enough for development and offline fallback.
        });
        pendingDbHydration.delete(company);
        return localSnapshot;
      }
    }

    const legacySnapshots = await buildSnapshotsFromLegacyRecords();
    const legacyRows = legacySnapshots?.[company] ?? [];
    const legacySnapshot = buildLoadedSnapshotFromEnvelopes(company, legacyRows);
    if (legacySnapshot) {
      companySnapshotMemoryCache.set(company, {
        snapshot: legacySnapshot,
        loadedAt: Date.now()
      });
      pendingDbHydration.delete(company);
      return legacySnapshot;
    }

    pendingDbHydration.delete(company);
    return null;
  })();

  pendingDbHydration.set(company, nextPromise);
  return nextPromise;
}

function shouldTreatSnapshotAsFresh(snapshot: LoadedCompanySnapshot | null) {
  if (!snapshot) {
    return false;
  }

  const fetchedAtMs = parseIsoTime(snapshot.fetchedAt);
  return fetchedAtMs > 0 && Date.now() - fetchedAtMs <= DATA_FRESHNESS_SLA_MS;
}

function isWithinServeStaleWindow(snapshot: LoadedCompanySnapshot | null) {
  if (!snapshot) {
    return false;
  }

  const fetchedAtMs = parseIsoTime(snapshot.fetchedAt);
  return fetchedAtMs > 0 && Date.now() - fetchedAtMs <= DATA_SERVE_STALE_MAX_AGE_MS;
}

async function getSnapshotSource(
  company: SnapshotCompany,
  options: {
    strictFresh?: boolean;
  } = {}
) {
  let snapshot = await hydrateCompanySnapshot(company);

  if (shouldTreatSnapshotAsFresh(snapshot)) {
    lastServedSource = companySnapshotMemoryCache.has(company) ? "memory_fresh" : "db_fresh";
    return snapshot;
  }

  warmRemoteSnapshot();

  if (snapshot && pendingRefreshPromise) {
    if (!options.strictFresh && isWithinServeStaleWindow(snapshot)) {
      lastServedSource = "stale_fallback_refreshing";
      return snapshot;
    }
  }

  if (!snapshot && pendingRefreshPromise) {
    try {
      await Promise.race([pendingRefreshPromise, wait(DATA_STRICT_REFRESH_WAIT_MS)]);
      snapshot = await hydrateCompanySnapshot(company);
      if (snapshot) {
        lastServedSource = shouldTreatSnapshotAsFresh(snapshot)
          ? "fresh_after_cold_wait"
          : "cold_wait_fallback";
        return snapshot;
      }
    } catch {
      // Ignore and fall back to the empty snapshot path below.
    }
  }

  if (options.strictFresh && pendingRefreshPromise) {
    try {
      await Promise.race([pendingRefreshPromise, wait(DATA_STRICT_REFRESH_WAIT_MS)]);
      snapshot = await hydrateCompanySnapshot(company);
      if (shouldTreatSnapshotAsFresh(snapshot)) {
        lastServedSource = "fresh_after_wait";
        return snapshot;
      }
    } catch {
      // Ignore and fall back to stale snapshot below.
    }
  }

  if (isWithinServeStaleWindow(snapshot)) {
    lastServedSource = "stale_fallback";
    return snapshot;
  }

  lastServedSource = "empty";
  return snapshot;
}

async function resolveRemoteFetchConfig() {
  const apiUrl = process.env.DATAOCEAN_API_URL ?? "";
  const runtimeConfig = await resolveDataOceanRuntimeConfig();

  if (!apiUrl) {
    throw new Error("Missing DATAOCEAN_API_URL for remote analytics mode.");
  }

  if (!runtimeConfig?.apiToken) {
    throw new Error(
      "Missing DataOcean token. Add one in Admin or set DATAOCEAN_API_TOKEN in environment."
    );
  }

  return {
    apiUrl,
    apiToken: runtimeConfig.apiToken
  };
}

async function fetchRemoteRecordsWithConfig({ apiUrl, apiToken }: { apiUrl: string; apiToken: string }) {
  if (!apiUrl || !apiToken) {
    throw new Error("Missing DataOcean API URL or token.");
  }

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= REMOTE_FETCH_MAX_RETRIES; attempt += 1) {
    const requestStartedAt = performance.now();
    try {
      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS)
      });

      if (!response.ok) {
        throw new Error(`Remote API request failed with status ${response.status}`);
      }

      const remoteFetchMs = roundMs(requestStartedAt);
      const parseStartedAt = performance.now();
      const body = (await response.json()) as unknown;
      const jsonParseMs = roundMs(parseStartedAt);

      if (!Array.isArray(body)) {
        throw new Error("Remote API response is not an array");
      }

      return {
        records: body as PricingRecord[],
        remoteFetchMs,
        jsonParseMs
      };
    } catch (error) {
      lastError = error;

      if (attempt < REMOTE_FETCH_MAX_RETRIES) {
        await wait(RETRY_BACKOFF_MS * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown remote fetch error");
}

function buildCompactMetricRecords(records: PricingRecord[]) {
  const startedAt = performance.now();
  const accumulator = new Map<
    string,
    {
      record: CompactMetricRecord;
      weightedNetTotal: number;
      weightedDiscTotal: number;
      totalVolume: number;
    }
  >();

  for (const rawRecord of records) {
    const siteNo = String(rawRecord.SITE_NO ?? "").trim();
    const day = String(rawRecord.DP_DATE ?? "").slice(0, 10);
    const npAvg = Number(rawRecord.NP_AVG ?? 0);
    const dcAvg = Number(rawRecord.DC_AVG ?? 0);
    const sumQ = Number(rawRecord.SUMQ ?? 0);
    const volume = Number.isFinite(sumQ) && sumQ > 0 ? sumQ : 0;

    if (!siteNo || !day || !Number.isFinite(npAvg) || volume <= 0) {
      continue;
    }

    const divisionName = String(rawRecord.DIVISION_NAME ?? "").trim();
    const fcName = String(rawRecord.FC_NAME ?? "").trim();
    const sectName = String(rawRecord.SECT_NAME ?? "").trim();
    const siteName = String(rawRecord.SITE_NAME ?? "").trim();
    const segment = String(rawRecord.SEGMENT ?? "").trim();
    const channel = String(rawRecord.CHANNEL ?? "").trim();
    const discountType = String(rawRecord.DISCOUNT_TYPE ?? "").trim();
    const key = [
      siteNo,
      day,
      divisionName,
      fcName,
      sectName,
      segment,
      channel,
      discountType
    ].join("__");

    const current = accumulator.get(key) ?? {
      record: {
        SITE_NO: siteNo,
        SITE_NAME: siteName,
        DIVISION_NAME: divisionName,
        FC_NAME: fcName,
        SECT_NAME: sectName,
        SEGMENT: segment,
        CHANNEL: channel,
        CREATE_DATE: null,
        DISCOUNT_DATE: null,
        FUTURE_DISCOUNT_DATE: null,
        DP_DATE: day,
        DISCOUNT_TYPE: discountType,
        COUNTSITE: null,
        NP_AVG: 0,
        NETCON: null,
        DC_AVG: 0,
        LP_AVG: null,
        SUMQ: 0,
        CUSTOMER_NO: null,
        CUSTOMER_NAME: null,
        CUSTOMER_MEMBER_TYPE: null,
        SUBCUSTOMER_NO: null,
        SUBCUSTOMER_NAME: null,
        SUBCUSTOMER_MEMBER_TYPE: null,
        searchText: [siteNo, siteName, divisionName, fcName, segment].join(" ").toLowerCase()
      },
      weightedNetTotal: 0,
      weightedDiscTotal: 0,
      totalVolume: 0
    };

    current.weightedNetTotal += npAvg * volume;
    current.weightedDiscTotal += (Number.isFinite(dcAvg) ? dcAvg : 0) * volume;
    current.totalVolume += volume;
    accumulator.set(key, current);
  }

  const compactRecords = [...accumulator.values()]
    .map((entry) => ({
      ...entry.record,
      NP_AVG: entry.weightedNetTotal / entry.totalVolume,
      DC_AVG: entry.weightedDiscTotal / entry.totalVolume,
      SUMQ: entry.totalVolume
    }))
    .sort((left, right) =>
      left.SITE_NO === right.SITE_NO
        ? String(left.DP_DATE).localeCompare(String(right.DP_DATE))
        : String(left.SITE_NO).localeCompare(String(right.SITE_NO))
    );

  return {
    records: compactRecords,
    durationMs: roundMs(startedAt)
  };
}

function scopeMetricsToCompany(records: CompactMetricRecord[], company: SnapshotCompany) {
  const allowedDivisions = new Set(
    COMPANY_DASHBOARD_DIVISIONS[company].map((value) => value.toUpperCase())
  );
  return records.filter((record) =>
    allowedDivisions.has(String(record.DIVISION_NAME ?? "").trim().toUpperCase())
  );
}

function determineSnapshotStrategy(snapshotBytes: {
  single: number;
  overview: number;
  projects: number;
  "project-trend": number;
}): SnapshotStrategy {
  if (snapshotBytes.single > SNAPSHOT_HARD_STOP_THRESHOLD_BYTES) {
    return "chunked-required";
  }

  if (snapshotBytes.single <= SNAPSHOT_SINGLE_THRESHOLD_BYTES) {
    return "single";
  }

  if (snapshotBytes.single <= SNAPSHOT_PROJECT_TREND_THRESHOLD_BYTES) {
    return "overview+projects";
  }

  return "overview+projects+project-trend";
}

function buildEnvelope<K extends keyof SnapshotPayloadByEnvelopeKind>(
  common: Omit<
    SnapshotEnvelope<K>,
    "kind" | "snapshotBytes" | "contentHash" | "payload"
  >,
  kind: K,
  payload: SnapshotPayloadByEnvelopeKind[K]
): SnapshotEnvelope<K> {
  return {
    ...common,
    kind,
    snapshotBytes: getSerializedBytes(payload),
    contentHash: hashJson(payload),
    payload
  };
}

function buildProjectsChunkEnvelopes(
  common: Omit<
    SnapshotEnvelope<SnapshotProjectsChunkKind>,
    "kind" | "snapshotBytes" | "contentHash" | "payload"
  >,
  payload: SnapshotProjectsPayload
) {
  const envelopes: SnapshotEnvelope<SnapshotProjectsChunkKind>[] = [];

  function appendChunks<T extends ProjectRow | CompactMetricRecord>(
    group: SnapshotProjectsChunkGroup,
    rows: T[]
  ) {
    const chunks = chunkBySerializedBytes(rows, SNAPSHOT_CHUNK_TARGET_BYTES);
    chunks.forEach((chunkRows, chunkIndex) => {
      const chunkPayload: SnapshotProjectsChunkPayload = {
        group,
        chunkIndex,
        chunkCount: chunks.length,
        rows:
          group === "metricRecords"
            ? (chunkRows as CompactMetricRecord[])
            : (chunkRows as ProjectRow[])
      };
      envelopes.push(buildEnvelope(common, getProjectsChunkKind(group, chunkIndex), chunkPayload));
    });
  }

  appendChunks("projectsLatest", payload.projectsLatest);
  appendChunks("dailyProjects", payload.dailyProjects);
  appendChunks("metricRecords", payload.metricRecords);

  return envelopes;
}

function buildProjectTrendChunkEnvelopes(
  common: Omit<
    SnapshotEnvelope<SnapshotProjectTrendChunkKind>,
    "kind" | "snapshotBytes" | "contentHash" | "payload"
  >,
  payload: SnapshotProjectTrendPayload
) {
  const entries = Object.entries(payload.projectTrendMap);
  const chunks = chunkBySerializedBytes(entries, SNAPSHOT_CHUNK_TARGET_BYTES);
  return chunks.map((entriesChunk, chunkIndex) =>
    buildEnvelope(common, getProjectTrendChunkKind(chunkIndex), {
      chunkIndex,
      chunkCount: chunks.length,
      entries: entriesChunk
    })
  );
}

function buildSnapshotEnvelopes(
  company: SnapshotCompany,
  records: CompactMetricRecord[],
  rawRecordCount: number,
  remoteBenchmark: {
    remoteFetchMs: number;
    jsonParseMs: number;
    compactMetricsBuildMs: number;
  },
  fetchedAtIso: string
) {
  const buildStartedAt = performance.now();
  const analytics = buildAnalytics(records);
  const buildAnalyticsMs = roundMs(buildStartedAt);
  const availableFilters = getAvailableFilters(records);

  const overviewPayload: SnapshotOverviewPayload = {
    metadata: analytics.metadata,
    summary: analytics.summary,
    summaryByDay: buildSummaryByDayRecord(analytics.summaryByDay),
    trend: analytics.trend,
    divisionPriceTrend: analytics.divisionPriceTrend,
    availableFilters
  };

  const projectsPayload: SnapshotProjectsPayload = {
    projectsLatest: analytics.projects,
    dailyProjects: analytics.dailyProjects,
    metricRecords: records
  };

  const projectTrendPayload: SnapshotProjectTrendPayload = {
    projectTrendMap: buildProjectTrendMapRecord(analytics.projectTrendMap)
  };

  const singlePayload: SnapshotSinglePayload = {
    ...overviewPayload,
    ...projectsPayload,
    ...projectTrendPayload
  };

  const serializeStartedAt = performance.now();
  const singleJson = JSON.stringify(singlePayload);
  const overviewJson = JSON.stringify(overviewPayload);
  const projectsJson = JSON.stringify(projectsPayload);
  const projectTrendJson = JSON.stringify(projectTrendPayload);
  const serializeSnapshotMs = roundMs(serializeStartedAt);
  const snapshotBytes = {
    single: Buffer.byteLength(singleJson),
    overview: Buffer.byteLength(overviewJson),
    projects: Buffer.byteLength(projectsJson),
    "project-trend": Buffer.byteLength(projectTrendJson)
  };
  const strategy = determineSnapshotStrategy(snapshotBytes);
  const generatedAt = toIsoTime();
  const common = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    company,
    strategy,
    fetchedAt: fetchedAtIso,
    generatedAt,
    rawRecordCount,
    compactRecordCount: records.length
  };

  const envelopes: SnapshotEnvelope[] = [];
  const commonEnvelope = {
    ...common
  };

  if (strategy === "single") {
    envelopes.push(buildEnvelope(commonEnvelope, "single", singlePayload));
  } else {
    envelopes.push(buildEnvelope(commonEnvelope, "overview", overviewPayload));

    if (strategy === "chunked-required") {
      envelopes.push(...buildProjectsChunkEnvelopes(commonEnvelope, projectsPayload));
    } else {
      envelopes.push(buildEnvelope(commonEnvelope, "projects", projectsPayload));
    }

    if (strategy === "overview+projects+project-trend" || strategy === "chunked-required") {
      if (strategy === "chunked-required") {
        envelopes.push(...buildProjectTrendChunkEnvelopes(commonEnvelope, projectTrendPayload));
      } else {
        envelopes.push(buildEnvelope(commonEnvelope, "project-trend", projectTrendPayload));
      }
    }
  }

  latestBenchmarkByCompany.set(company, {
    ...remoteBenchmark,
    buildAnalyticsMs,
    serializeSnapshotMs,
    persistSnapshotMs: 0,
    snapshotBytes,
    strategy,
    rawRecordCount,
    compactRecordCount: records.length,
    generatedAt
  });

  return envelopes;
}

async function persistSnapshotRowsToDb(
  envelopes: SnapshotEnvelope[],
  options: { lastError?: string | null } = {}
) {
  await ensureSnapshotSchema();
  const sql = getSql();
  const startedAt = performance.now();

  for (const envelope of envelopes) {
    await sql`
      insert into app_pricing_snapshots (
        snapshot_key,
        company,
        kind,
        snapshot_json,
        record_count,
        snapshot_bytes,
        fetched_at,
        generated_at,
        schema_version,
        content_hash,
        last_error,
        updated_at
      )
      values (
        ${getSnapshotKey(envelope.company, envelope.kind)},
        ${envelope.company},
        ${envelope.kind},
        ${JSON.parse(JSON.stringify(envelope))},
        ${envelope.compactRecordCount},
        ${envelope.snapshotBytes},
        ${envelope.fetchedAt},
        ${envelope.generatedAt},
        ${envelope.schemaVersion},
        ${envelope.contentHash},
        ${options.lastError ?? null},
        now()
      )
      on conflict (snapshot_key) do update set
        snapshot_json = excluded.snapshot_json,
        record_count = excluded.record_count,
        snapshot_bytes = excluded.snapshot_bytes,
        fetched_at = excluded.fetched_at,
        generated_at = excluded.generated_at,
        schema_version = excluded.schema_version,
        content_hash = excluded.content_hash,
        last_error = excluded.last_error,
        updated_at = now()
    `;
  }

  const companies = Array.from(new Set(envelopes.map((envelope) => envelope.company)));
  for (const company of companies) {
    const kinds = envelopes
      .filter((envelope) => envelope.company === company)
      .map((envelope) => envelope.kind);
    await sql`
      delete from app_pricing_snapshots
      where company = ${company}
        and (
          kind in ('single', 'overview', 'projects', 'project-trend')
          or kind like 'projects:%'
          or kind like 'project-trend:entries:%'
        )
        and not (kind = any(${kinds}))
    `;
  }

  const persistSnapshotMs = roundMs(startedAt);
  for (const company of companies) {
    const benchmark = latestBenchmarkByCompany.get(company);
    if (benchmark) {
      benchmark.persistSnapshotMs = persistSnapshotMs;
      latestBenchmarkByCompany.set(company, benchmark);
    }
  }
}

async function persistBuiltSnapshotsToLocalFile(envelopesByCompany: Record<string, SnapshotEnvelope[]>) {
  await persistLocalSnapshots(envelopesByCompany);
}

async function acquireRefreshLock(owner: string) {
  await ensureSnapshotSchema();
  const sql = getSql();
  const expiresAtIso = toIsoTime(Date.now() + DATA_REFRESH_LOCK_TTL_MS);
  const rows = (await sql`
    insert into app_pricing_snapshots (
      snapshot_key,
      company,
      kind,
      schema_version,
      lock_owner,
      lock_acquired_at,
      lock_expires_at,
      updated_at
    )
    values (
      ${GLOBAL_LOCK_SNAPSHOT_KEY},
      ${"GLOBAL"},
      ${"lock"},
      ${SNAPSHOT_SCHEMA_VERSION},
      ${owner},
      now(),
      ${expiresAtIso},
      now()
    )
    on conflict (snapshot_key) do update set
      lock_owner = case
        when app_pricing_snapshots.lock_expires_at is null
          or app_pricing_snapshots.lock_expires_at < now()
          or app_pricing_snapshots.lock_owner = ${owner}
        then ${owner}
        else app_pricing_snapshots.lock_owner
      end,
      lock_acquired_at = case
        when app_pricing_snapshots.lock_expires_at is null
          or app_pricing_snapshots.lock_expires_at < now()
          or app_pricing_snapshots.lock_owner = ${owner}
        then now()
        else app_pricing_snapshots.lock_acquired_at
      end,
      lock_expires_at = case
        when app_pricing_snapshots.lock_expires_at is null
          or app_pricing_snapshots.lock_expires_at < now()
          or app_pricing_snapshots.lock_owner = ${owner}
        then ${expiresAtIso}
        else app_pricing_snapshots.lock_expires_at
      end,
      updated_at = now()
    returning lock_owner, lock_expires_at
  `) as Array<{ lock_owner: string | null; lock_expires_at: string | null }>;

  const row = rows[0];
  return {
    acquired: row?.lock_owner === owner,
    lockExpiresAt: row?.lock_expires_at ?? null
  };
}

async function releaseRefreshLock(owner: string) {
  await ensureSnapshotSchema();
  const sql = getSql();
  await sql`
    update app_pricing_snapshots
    set lock_owner = null,
        lock_acquired_at = null,
        lock_expires_at = null,
        updated_at = now()
    where snapshot_key = ${GLOBAL_LOCK_SNAPSHOT_KEY}
      and lock_owner = ${owner}
  `;
}

async function refreshAndPersistSnapshots() {
  const config = await resolveRemoteFetchConfig();
  const { records: remoteRecords, remoteFetchMs, jsonParseMs } = await fetchRemoteRecordsWithConfig(config);
  const compactMetrics = buildCompactMetricRecords(remoteRecords);
  const fetchedAtIso = toIsoTime();
  const remoteBenchmark = {
    remoteFetchMs,
    jsonParseMs,
    compactMetricsBuildMs: compactMetrics.durationMs
  };

  const envelopesByCompany: Record<string, SnapshotEnvelope[]> = {
    CPAC: buildSnapshotEnvelopes(
      "CPAC",
      scopeMetricsToCompany(compactMetrics.records, "CPAC"),
      remoteRecords.length,
      remoteBenchmark,
      fetchedAtIso
    ),
    QMIX: buildSnapshotEnvelopes(
      "QMIX",
      scopeMetricsToCompany(compactMetrics.records, "QMIX"),
      remoteRecords.length,
      remoteBenchmark,
      fetchedAtIso
    )
  };

  await persistBuiltSnapshotsToLocalFile(envelopesByCompany);

  companySnapshotMemoryCache.clear();
  filteredSnapshotCache.clear();

  for (const company of ["CPAC", "QMIX"] as const) {
    const builtSnapshot = buildLoadedSnapshotFromEnvelopes(company, envelopesByCompany[company]);
    if (builtSnapshot) {
      companySnapshotMemoryCache.set(company, {
        snapshot: builtSnapshot,
        loadedAt: Date.now()
      });
    }
  }

  try {
    await persistSnapshotRowsToDb([...envelopesByCompany.CPAC, ...envelopesByCompany.QMIX]);
  } catch (error) {
    console.warn("[pricing] snapshot_db_persist_failed", toReadableError(error));
  }
}

export async function forceRefreshRemoteSnapshot() {
  if (pendingRefreshPromise) {
    return pendingRefreshPromise;
  }

  pendingRefreshPromise = (async () => {
    lastRefreshStartedAt = Date.now();
    const owner = `refresh-${randomUUID()}`;
    const lock = await acquireRefreshLock(owner);

    if (!lock.acquired) {
      await wait(Math.min(DATA_STRICT_REFRESH_WAIT_MS, 1_000));
      lastRefreshCompletedAt = Date.now();
      return;
    }

    try {
      await refreshAndPersistSnapshots();
      lastRefreshError = null;
      lastRefreshCompletedAt = Date.now();
    } catch (error) {
      lastRefreshError = toReadableError(error);
      throw error;
    } finally {
      await releaseRefreshLock(owner);
    }
  })();

  void pendingRefreshPromise.then(
    () => {
      pendingRefreshPromise = null;
    },
    () => {
      pendingRefreshPromise = null;
    }
  );

  return pendingRefreshPromise;
}

export async function clearRemoteSnapshotCache() {
  companySnapshotMemoryCache.clear();
  filteredSnapshotCache.clear();
  pendingDbHydration = new Map();
  pendingRefreshPromise = null;
  lastRefreshError = null;
  lastRefreshStartedAt = 0;
  lastRefreshCompletedAt = 0;

  try {
    const sql = getSql();
    await ensureSnapshotSchema();
    await sql`delete from app_pricing_snapshots`;
  } catch {
    // Ignore DB cleanup errors and clear memory anyway.
  }

  try {
    await rm(PERSISTED_CACHE_PATH, { force: true });
  } catch {
    // Ignore local cleanup errors.
  }
}

export async function validateDataOceanToken(token: string) {
  const apiUrl = process.env.DATAOCEAN_API_URL ?? "";
  const apiToken = token.trim();

  if (!apiUrl) {
    throw new Error("Missing DATAOCEAN_API_URL for remote analytics mode.");
  }

  if (!apiToken) {
    throw new Error("กรอก DataOcean token ก่อนบันทึก");
  }

  await fetchRemoteRecordsWithConfig({ apiUrl, apiToken });
}

function toReadableError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message;
    const errorWithCause = error as Error & { cause?: unknown };
    const causeValue = errorWithCause.cause;
    const cause =
      typeof causeValue === "object" && causeValue !== null
        ? String((causeValue as { code?: string; message?: string }).code ?? "") +
          " " +
          String((causeValue as { code?: string; message?: string }).message ?? "")
        : "";
    const combined = `${message} ${cause}`;

    if (combined.includes("ENOTFOUND")) {
      return "Cannot resolve DataOcean host. Check internet/DNS or corporate VPN access.";
    }

    if (combined.includes("401")) {
      return "DataOcean token was rejected. Check the configured token in Admin or environment.";
    }

    if (combined.includes("timed out") || combined.includes("TimeoutError")) {
      return `DataOcean did not respond within ${REMOTE_FETCH_TIMEOUT_MS / 1000} seconds.`;
    }

    if (combined.includes("fetch failed")) {
      return "Cannot reach DataOcean API. Check internet connection, VPN, or API URL.";
    }

    return message;
  }

  return "Unknown remote data error";
}

async function getFilteredSnapshotArtifacts(
  filters: FilterParams = {},
  options: { strictFresh?: boolean } = {}
): Promise<FilteredSnapshotArtifacts> {
  const startedAt = performance.now();
  const company = normalizeCompany(filters.company);
  const sourceSnapshot = await getSnapshotSource(company, options);
  const freshness = buildFreshnessMetadata(sourceSnapshot);
  const analyticsConfig = getAnalyticsConfig({
    baselineStart: filters.baselineStart,
    baselineEnd: filters.baselineEnd
  });
  const isDefaultBaseline =
    analyticsConfig.baselineStart === BASELINE_START && analyticsConfig.baselineEnd === BASELINE_END;

  if (!sourceSnapshot) {
    logTiming("getFilteredSnapshot", startedAt, {
      company,
      label: "empty_fallback"
    });
    return {
      snapshot: buildEmptySnapshot(analyticsConfig),
      availableFilters: getAvailableFilters([]),
      freshness
    };
  }

  const cacheKey = buildNormalizedFilterCacheKey(filters);
  const cached = filteredSnapshotCache.get(cacheKey);
  if (cached && cached.fetchedAt === sourceSnapshot.fetchedAt) {
    logTiming("getFilteredSnapshot", startedAt, {
      company,
      label: "cache_hit",
      defaultBaseline: isDefaultBaseline,
      hasFilters: hasFilterValues(filters)
    });
    return {
      snapshot: cached.snapshot,
      availableFilters: cached.availableFilters,
      freshness
    };
  }

  if (!hasFilterValues(filters) && isDefaultBaseline) {
    const snapshot = buildInternalSnapshotFromLoadedSnapshot(sourceSnapshot);
    filteredSnapshotCache.set(cacheKey, {
      snapshot,
      availableFilters: sourceSnapshot.overview.availableFilters,
      fetchedAt: sourceSnapshot.fetchedAt
    });
    logTiming("getFilteredSnapshot", startedAt, {
      company,
      label: "snapshot_hit",
      defaultBaseline: true,
      hasFilters: false
    });
    return {
      snapshot,
      availableFilters: sourceSnapshot.overview.availableFilters,
      freshness
    };
  }

  const filteredMetricRecords = filterMetricRecords(sourceSnapshot.projects.metricRecords, filters);
  const availableFilters = getAvailableFilters(filteredMetricRecords);
  const rebuilt = buildAnalytics(filteredMetricRecords, analyticsConfig);
  const snapshot: InternalSnapshot = {
    metadata: rebuilt.metadata,
    summary: rebuilt.summary,
    summaryByDay: rebuilt.summaryByDay,
    trend: rebuilt.trend,
    divisionPriceTrend: rebuilt.divisionPriceTrend,
    projects: rebuilt.projects,
    dailyProjects: rebuilt.dailyProjects,
    projectTrendMap: rebuilt.projectTrendMap
  };
  filteredSnapshotCache.set(cacheKey, {
    snapshot,
    availableFilters,
    fetchedAt: sourceSnapshot.fetchedAt
  });
  logTiming("getFilteredSnapshot", startedAt, {
    company,
    label: "rebuilt_from_compact_metrics",
    defaultBaseline: isDefaultBaseline,
    hasFilters: hasFilterValues(filters),
    compactRecordCount: filteredMetricRecords.length
  });

  return {
    snapshot,
    availableFilters,
    freshness
  };
}

export async function getMeta(filters: FilterParams = {}) {
  const startedAt = performance.now();
  const { snapshot, availableFilters } = await getFilteredSnapshotArtifacts(filters);
  const response = buildMetaFromArtifacts(
    snapshot,
    availableFilters,
    getAnalyticsConfig({
      baselineStart: filters.baselineStart,
      baselineEnd: filters.baselineEnd
    })
  );
  logTiming("getMeta", startedAt, {
    company: normalizeCompany(filters.company),
    hasFilters: hasFilterValues(filters)
  });
  return response;
}

export async function getDashboard(filters: FilterParams = {}) {
  const startedAt = performance.now();
  const analyticsConfig = getAnalyticsConfig({
    baselineStart: filters.baselineStart,
    baselineEnd: filters.baselineEnd
  });
  const { snapshot, availableFilters, freshness } = await getFilteredSnapshotArtifacts(filters);
  const latestTrendPoint = snapshot.trend.length > 0 ? snapshot.trend[snapshot.trend.length - 1] : undefined;
  const latestDay = latestTrendPoint?.day;
  const summary = filters.day
    ? snapshot.summaryByDay.get(filters.day)
    : latestDay
      ? snapshot.summaryByDay.get(latestDay)
      : null;

  const response = {
    meta: buildMetaFromArtifacts(snapshot, availableFilters, analyticsConfig),
    summary:
      summary ??
      (filters.day
        ? {
            comparableSites: 0,
            ladder500: 0,
            ladder400: 0,
            ladder300: 0,
            ladder250: 0,
            ladder200: 0,
            ladder100: 0,
            ladder0: 0,
            belowTargetSites: 0,
            totalIncrease: 0,
            avgIncrease: 0,
            avgTargetPercent: 0,
            targetHitShare: 0,
            minIncrease: 0,
            maxIncrease: 0,
            latestDayMin: filters.day,
            latestDayMax: filters.day
          }
        : snapshot.summary),
    trend: snapshot.trend,
    divisionPriceTrend: snapshot.divisionPriceTrend,
    ...freshness
  };
  logTiming("getDashboard", startedAt, {
    company: normalizeCompany(filters.company),
    day: filters.day || null,
    hasFilters: hasFilterValues(filters)
  });
  return response;
}

export async function getSummary(filters: FilterParams = {}) {
  const startedAt = performance.now();
  const { snapshot } = await getFilteredSnapshotArtifacts(filters);
  if (filters.day) {
    const response = snapshot.summaryByDay.get(filters.day) ?? {
      comparableSites: 0,
      ladder500: 0,
      ladder400: 0,
      ladder300: 0,
      ladder250: 0,
      ladder200: 0,
      ladder100: 0,
      ladder0: 0,
      belowTargetSites: 0,
      totalIncrease: 0,
      avgIncrease: 0,
      avgTargetPercent: 0,
      targetHitShare: 0,
      minIncrease: 0,
      maxIncrease: 0,
      latestDayMin: filters.day,
      latestDayMax: filters.day
    };
    logTiming("getSummary", startedAt, {
      company: normalizeCompany(filters.company),
      day: filters.day
    });
    return response;
  }

  const latestTrendPoint = snapshot.trend.length > 0 ? snapshot.trend[snapshot.trend.length - 1] : undefined;
  const latestDay = latestTrendPoint?.day;
  const response = latestDay ? (snapshot.summaryByDay.get(latestDay) ?? snapshot.summary) : snapshot.summary;
  logTiming("getSummary", startedAt, {
    company: normalizeCompany(filters.company),
    day: latestDay || null
  });
  return response;
}

export async function getTrend(filters: FilterParams = {}) {
  const startedAt = performance.now();
  const { snapshot } = await getFilteredSnapshotArtifacts(filters);
  logTiming("getTrend", startedAt, {
    company: normalizeCompany(filters.company),
    hasFilters: hasFilterValues(filters)
  });
  return snapshot.trend;
}

export async function getProjects(params: {
  company?: string;
  search?: string;
  ladder?: string;
  day?: string;
  divisions?: string[];
  segments?: string[];
  channels?: string[];
  fcNames?: string[];
  discountTypes?: string[];
  baselineStart?: string;
  baselineEnd?: string;
  page?: number;
  pageSize?: number;
}) {
  const {
    company = "",
    search = "",
    ladder = "",
    day = "",
    divisions = [],
    segments = [],
    channels = [],
    fcNames = [],
    discountTypes = [],
    baselineStart = "",
    baselineEnd = "",
    page = 1,
    pageSize = 20
  } = params;
  const normalizedSearch = search.trim().toLowerCase();
  const startedAt = performance.now();
  const ladders = normalizeLadderValues(ladder);
  const ladderSet = new Set(ladders);

  const { snapshot, freshness } = await getFilteredSnapshotArtifacts({
    company,
    divisions,
    segments,
    channels,
    fcNames,
    discountTypes,
    baselineStart,
    baselineEnd
  });

  let rows = day
    ? snapshot.dailyProjects.filter((row) => row.latestDay === day)
    : [...snapshot.dailyProjects];

  if (normalizedSearch) {
    rows = rows.filter((row) =>
      [row.siteNo, row.siteName, row.divisionName, row.fcName, row.segment]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }

  if (ladderSet.size > 0) {
    rows = rows.filter((row) => ladderSet.has(row.ladder));
  }

  const total = rows.length;
  const normalizedPageSize = Number.isFinite(pageSize) ? Math.max(1, pageSize) : 20;
  const normalizedPage = Number.isFinite(page) ? Math.max(1, page) : 1;
  const startIndex = (normalizedPage - 1) * normalizedPageSize;
  const pagedRows = rows.slice(startIndex, startIndex + normalizedPageSize);

  const response = {
    rows: pagedRows,
    total,
    ...freshness
  };
  logTiming("getProjects", startedAt, {
    company: normalizeCompany(company),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    ladderCount: ladders.length,
    hasSearch: Boolean(normalizedSearch)
  });
  return response;
}

export async function getProjectTrend(siteNo: string, filters: FilterParams = {}) {
  const startedAt = performance.now();
  const { snapshot, freshness } = await getFilteredSnapshotArtifacts(filters);
  const response = {
    rows: snapshot.projectTrendMap.get(siteNo) ?? [],
    ...freshness
  };
  logTiming("getProjectTrend", startedAt, {
    company: normalizeCompany(filters.company),
    siteNo,
    hasFilters: hasFilterValues(filters)
  });
  return response;
}

export async function getPriceTrackingBootstrap(params: {
  company?: string;
  search?: string;
  ladder?: string;
  day?: string;
  divisions?: string[];
  segments?: string[];
  channels?: string[];
  fcNames?: string[];
  discountTypes?: string[];
  baselineStart?: string;
  baselineEnd?: string;
  page?: number;
  pageSize?: number;
  selectedSite?: string;
}) {
  const startedAt = performance.now();
  const {
    company = "",
    search = "",
    ladder = "",
    day = "",
    divisions = [],
    segments = [],
    channels = [],
    fcNames = [],
    discountTypes = [],
    baselineStart = "",
    baselineEnd = "",
    page = 1,
    pageSize = 20,
    selectedSite = ""
  } = params;
  const analyticsConfig = getAnalyticsConfig({ baselineStart, baselineEnd });
  const { snapshot, availableFilters, freshness } = await getFilteredSnapshotArtifacts({
    company,
    divisions,
    segments,
    channels,
    fcNames,
    discountTypes,
    baselineStart,
    baselineEnd
  });
  const latestTrendPoint = snapshot.trend.length > 0 ? snapshot.trend[snapshot.trend.length - 1] : undefined;
  const latestDay = latestTrendPoint?.day;
  const summary = day ? snapshot.summaryByDay.get(day) : latestDay ? snapshot.summaryByDay.get(latestDay) : null;
  const normalizedSearch = search.trim().toLowerCase();
  const ladderSet = new Set(normalizeLadderValues(ladder));
  let rows = day ? snapshot.dailyProjects.filter((row) => row.latestDay === day) : [...snapshot.dailyProjects];

  if (normalizedSearch) {
    rows = rows.filter((row) =>
      [row.siteNo, row.siteName, row.divisionName, row.fcName, row.segment]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }

  if (ladderSet.size > 0) {
    rows = rows.filter((row) => ladderSet.has(row.ladder));
  }

  const total = rows.length;
  const normalizedPageSize = Number.isFinite(pageSize) ? Math.max(1, pageSize) : 20;
  const normalizedPage = Number.isFinite(page) ? Math.max(1, page) : 1;
  const startIndex = (normalizedPage - 1) * normalizedPageSize;
  const pagedRows = rows.slice(startIndex, startIndex + normalizedPageSize);
  const resolvedSelectedSite = pagedRows.some((row) => row.siteNo === selectedSite)
    ? selectedSite
    : pagedRows[0]?.siteNo ?? "";

  const response = {
    meta: buildMetaFromArtifacts(snapshot, availableFilters, analyticsConfig),
    summary:
      summary ??
      (day
        ? {
            comparableSites: 0,
            ladder500: 0,
            ladder400: 0,
            ladder300: 0,
            ladder250: 0,
            ladder200: 0,
            ladder100: 0,
            ladder0: 0,
            belowTargetSites: 0,
            totalIncrease: 0,
            avgIncrease: 0,
            avgTargetPercent: 0,
            targetHitShare: 0,
            minIncrease: 0,
            maxIncrease: 0,
            latestDayMin: day,
            latestDayMax: day
          }
        : snapshot.summary),
    trend: snapshot.trend,
    divisionPriceTrend: snapshot.divisionPriceTrend,
    projects: {
      rows: pagedRows,
      total
    },
    selectedSite: resolvedSelectedSite,
    selectedProjectTrend: resolvedSelectedSite
      ? snapshot.projectTrendMap.get(resolvedSelectedSite) ?? []
      : [],
    ...freshness
  };
  logTiming("bootstrap", startedAt, {
    company: normalizeCompany(company),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    hasSelectedSite: Boolean(selectedSite),
    hasFilters: hasFilterValues({ company, divisions, segments, channels, fcNames, discountTypes })
  });
  return response;
}

export function formatHandlerError(error: unknown) {
  return {
    error: toReadableError(error)
  };
}

export function warmRemoteSnapshot() {
  void forceRefreshRemoteSnapshot().catch(() => {
    // Warm-up should never crash the server; request handlers still surface errors.
  });
}

function scheduleNextRemoteSnapshotRefresh() {
  const delayMs = getNextWarmIntervalMs();
  cachePreloadTimer = setTimeout(() => {
    warmRemoteSnapshot();
    scheduleNextRemoteSnapshotRefresh();
  }, delayMs);
  cachePreloadTimer.unref?.();
}

export function scheduleRemoteSnapshotRefresh() {
  if (cachePreloadTimer) {
    return;
  }

  warmRemoteSnapshot();
  scheduleNextRemoteSnapshotRefresh();
}

export function getCacheStatus() {
  const snapshotStatusByCompany = Object.fromEntries(
    (["CPAC", "QMIX"] as const).map((company) => {
      const snapshot = companySnapshotMemoryCache.get(company)?.snapshot ?? null;
      const freshness = buildFreshnessMetadata(snapshot);
      const benchmark = latestBenchmarkByCompany.get(company) ?? null;
      return [
        company,
        {
          hasCache: Boolean(snapshot),
          fetchedAt: snapshot?.fetchedAt ?? null,
          generatedAt: snapshot?.generatedAt ?? null,
          freshnessAgeMs: snapshot ? Math.max(0, Date.now() - parseIsoTime(snapshot.fetchedAt)) : null,
          strategy: snapshot?.strategy ?? null,
          snapshotBytes: snapshot?.snapshotBytes ?? null,
          compactRecordCount: snapshot?.compactRecordCount ?? null,
          rawRecordCount: snapshot?.rawRecordCount ?? null,
          freshness,
          neonRead: getRollingMetricSummary(rollingNeonReadMetricsByCompany, company),
          benchmark
        }
      ];
    })
  );

  return {
    hasCache:
      companySnapshotMemoryCache.has("CPAC") || companySnapshotMemoryCache.has("QMIX"),
    companies: snapshotStatusByCompany,
    freshnessSlaMs: DATA_FRESHNESS_SLA_MS,
    strictRefreshWaitMs: DATA_STRICT_REFRESH_WAIT_MS,
    refreshLockTtlMs: DATA_REFRESH_LOCK_TTL_MS,
    serveStaleMaxAgeMs: DATA_SERVE_STALE_MAX_AGE_MS,
    preloadIntervalMs: CACHE_PRELOAD_INTERVAL_MS,
    busyHoursPreloadIntervalMs: BUSY_HOURS_CACHE_PRELOAD_INTERVAL_MS,
    businessHourStart: BUSINESS_HOUR_START,
    businessHourEnd: BUSINESS_HOUR_END,
    businessTimeZone: BUSINESS_TIME_ZONE,
    lastRefreshStartedAt: lastRefreshStartedAt || null,
    lastRefreshCompletedAt: lastRefreshCompletedAt || null,
    isRefreshing: Boolean(pendingRefreshPromise),
    lastError: lastRefreshError,
    lastServedSource,
    rolloutGates: {
      requestPathUsesSnapshotsOnly: true,
      snapshotSplitThresholdBytes: {
        single: SNAPSHOT_SINGLE_THRESHOLD_BYTES,
        projectTrend: SNAPSHOT_PROJECT_TREND_THRESHOLD_BYTES,
        hardStop: SNAPSHOT_HARD_STOP_THRESHOLD_BYTES
      },
      neonReadTargets: {
        p95Ms: 250,
        p99Ms: 1000
      },
      buildAnalyticsTargets: {
        passMs: 500,
        upperMs: 1500,
        hardLimitMs: 3000
      }
    }
  };
}
