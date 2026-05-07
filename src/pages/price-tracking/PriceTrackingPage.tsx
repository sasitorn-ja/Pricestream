import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { PriceTrackingShell } from "./PriceTrackingShell";
import { CalcHelpModal } from "./ui/CalcHelpModal";
import { OverviewSection } from "./ui/sections/OverviewSection";
import { ProjectTrendSection } from "./ui/sections/ProjectTrendSection";
import { ProjectsTableSection } from "./ui/sections/ProjectsTableSection";
import { SharedFilterMenuBar } from "./ui/sections/SharedFilterMenuBar";
import { TrendChartsSection } from "./ui/sections/TrendChartsSection";
import {
  buildActiveTableFilters,
  buildDivisionPriceChartData,
  buildProportionTrendData,
  buildSelectedTrendChartData,
  getActiveTrendBucketSeries,
  getDivisionPriceTrendByGranularity,
  getFilteredDivisionPriceTrend,
  getFilteredAverageTrend,
  getPostCampaignTrendData,
  getTrendPointsByGranularity
} from "./calculations/priceTracking";
import {
  type TableColumnHelpKey,
  discountDropSeries,
  FILTER_DEBOUNCE_MS,
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS
} from "./constants";
import { buildCalcHelpContent } from "./content/calcHelp";
import type {
  CalcHelpKey,
  DashboardResponse,
  DivisionPriceTrendPoint,
  MetaResponse,
  PriceLadderMode,
  PriceTrackingBootstrapResponse,
  ProjectResponse,
  ProjectRow,
  ProjectTrendPoint,
  ProjectTrendResponse,
  SummaryResponse,
  TrendGranularity,
  TrendPoint,
  TrendRange
} from "./types";
import { buildCanonicalQueryKey, buildDashboardFilterQuery, normalizeQueryValues } from "./utils/filters";
import { formatNumber, formatSummaryDateRange, formatThaiDateShort, getPaginationItems } from "./utils/format";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useDelayedFlag } from "../../hooks/useDelayedFlag";
import { fetchJson, isAbortError } from "../../services/api/fetchJson";
import { type AuthUser } from "../../services/auth/authUser";
import { APP_MENU_LABELS, type AppMenuKey, type CompanyCode } from "../../services/auth/localAuth";
import { appShellClass } from "../../components/ui/styles";
import { COMPANY_DASHBOARD_DIVISIONS } from "../../../shared/appConfig";

type PriceTrackingPageProps = {
  authUser: AuthUser;
  activeMenu: AppMenuKey;
  allowedMenus: AppMenuKey[];
  themeMode: "dark" | "light";
  dashboardDivision: CompanyCode;
  onToggleTheme: () => void;
  onMenuChange: (menu: AppMenuKey) => void;
  onLogout: () => void;
  onOpenChangePassword: () => void;
  hideSidebar?: boolean;
  hideUserActions?: boolean;
};

const dashboardDivisionAliases: Record<CompanyCode, string[]> = {
  CPAC: [...COMPANY_DASHBOARD_DIVISIONS.CPAC],
  QMIX: [...COMPANY_DASHBOARD_DIVISIONS.QMIX]
};

const bootstrapCacheByDivision = new Map<CompanyCode, PriceTrackingBootstrapResponse>();
const bootstrapQueryCache = new Map<string, PriceTrackingBootstrapResponse>();
const sharedDashboardCache = new Map<string, DashboardResponse>();
const sharedProjectsCache = new Map<string, ProjectResponse>();
const sharedSelectedTrendCache = new Map<string, ProjectTrendResponse>();
const BOOTSTRAP_REVALIDATE_DELAY_MS = 1_200;
const BOOTSTRAP_COLD_REVALIDATE_DELAY_MS = 2_500;
const BOOTSTRAP_MAX_REVALIDATE_ATTEMPTS = 24;
const BASELINE_STORAGE_KEY_PREFIX = "pricing-monitor-baseline";

function readStoredBaseline(dashboardDivision: CompanyCode) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(`${BASELINE_STORAGE_KEY_PREFIX}:${dashboardDivision}`);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as { start?: unknown; end?: unknown };
    const start = typeof parsedValue.start === "string" ? parsedValue.start : "";
    const end = typeof parsedValue.end === "string" ? parsedValue.end : "";
    return start && end && start <= end ? { start, end } : null;
  } catch {
    return null;
  }
}

function storeBaseline(dashboardDivision: CompanyCode, start: string, end: string) {
  if (typeof window === "undefined" || !start || !end || start > end) {
    return;
  }

  window.localStorage.setItem(
    `${BASELINE_STORAGE_KEY_PREFIX}:${dashboardDivision}`,
    JSON.stringify({ start, end })
  );
}

function getDashboardDivisions(availableDivisions: string[], dashboardDivision: CompanyCode) {
  const aliases = new Set(dashboardDivisionAliases[dashboardDivision].map((value) => value.toUpperCase()));
  return availableDivisions.filter((division) => aliases.has(division.toUpperCase()));
}

function areSameValues(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function orderCompanyDivisions(divisions: string[], dashboardDivision: CompanyCode) {
  const preferredOrder: readonly string[] = COMPANY_DASHBOARD_DIVISIONS[dashboardDivision] ?? [];
  const orderByDivision = new Map(preferredOrder.map((division, index) => [division, index]));

  return [...divisions].sort((left, right) => {
    const leftOrder = orderByDivision.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderByDivision.get(right) ?? Number.MAX_SAFE_INTEGER;

    return leftOrder === rightOrder ? left.localeCompare(right) : leftOrder - rightOrder;
  });
}

type QueryFilterState = {
  selectedDivisions: string[];
  selectedSegments: string[];
  selectedChannels: string[];
  selectedFcNames: string[];
  selectedDiscountTypes: string[];
  baselineStart: string;
  baselineEnd: string;
};

function normalizeFilterState(filterState: QueryFilterState): QueryFilterState {
  return {
    selectedDivisions: normalizeQueryValues(filterState.selectedDivisions),
    selectedSegments: normalizeQueryValues(filterState.selectedSegments),
    selectedChannels: normalizeQueryValues(filterState.selectedChannels),
    selectedFcNames: normalizeQueryValues(filterState.selectedFcNames),
    selectedDiscountTypes: normalizeQueryValues(filterState.selectedDiscountTypes),
    baselineStart: filterState.baselineStart,
    baselineEnd: filterState.baselineEnd
  };
}

function logClientTiming(
  metric: string,
  startedAt: number,
  details: Record<string, string | number | boolean | null> = {}
) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info(`[price-tracking-ui] ${metric}`, {
    durationMs: Math.round(performance.now() - startedAt),
    ...details
  });
}

export function PriceTrackingPage({
  authUser,
  activeMenu,
  allowedMenus,
  themeMode,
  dashboardDivision,
  onToggleTheme,
  onMenuChange,
  onLogout,
  onOpenChangePassword,
  hideSidebar = false,
  hideUserActions = false
}: PriceTrackingPageProps) {
  const cachedBootstrap = bootstrapCacheByDivision.get(dashboardDivision) ?? null;
  const cachedDefaultDivisions = dashboardDivisionAliases[dashboardDivision];
  const storedBaseline = readStoredBaseline(dashboardDivision);
  const hasCachedBootstrap = Boolean(cachedBootstrap);
  const [meta, setMeta] = useState<MetaResponse | null>(cachedBootstrap?.meta ?? null);
  const [summary, setSummary] = useState<SummaryResponse | null>(cachedBootstrap?.summary ?? null);
  const [trend, setTrend] = useState<TrendPoint[]>(cachedBootstrap?.trend ?? []);
  const [divisionPriceTrend, setDivisionPriceTrend] = useState<DivisionPriceTrendPoint[]>(
    cachedBootstrap?.divisionPriceTrend ?? []
  );
  const dashboardRequestIdRef = useRef(0);
  const projectRequestIdRef = useRef(0);
  const selectedTrendRequestIdRef = useRef(0);
  const hasMountedRef = useRef(false);
  const selectedSiteRef = useRef(cachedBootstrap?.selectedSite ?? "");
  const skipNextBootstrapRefreshRef = useRef(false);
  const skipNextSelectedTrendRefreshRef = useRef(false);
  const previousTableFilterResetKeyRef = useRef("");
  const pendingPageResetRef = useRef(false);
  const dashboardCacheRef = useRef(sharedDashboardCache);
  const projectsCacheRef = useRef(sharedProjectsCache);
  const selectedTrendCacheRef = useRef(sharedSelectedTrendCache);
  const [projectRows, setProjectRows] = useState<ProjectRow[]>(cachedBootstrap?.projects.rows ?? []);
  const [projectTotal, setProjectTotal] = useState(cachedBootstrap?.projects.total ?? 0);
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [search, setSearch] = useState("");
  const [baseDashboardDivisions, setBaseDashboardDivisions] = useState<string[]>(cachedDefaultDivisions);
  const [baseDashboardFcNamesByDivision, setBaseDashboardFcNamesByDivision] = useState<Record<string, string[]>>(
    cachedBootstrap?.meta.filters?.fcNamesByDivision ?? {}
  );
  const [baseDashboardSegments, setBaseDashboardSegments] = useState<string[]>(
    cachedBootstrap?.meta.filters?.segments ?? []
  );
  const [baseDashboardChannels, setBaseDashboardChannels] = useState<string[]>(
    cachedBootstrap?.meta.filters?.channels ?? []
  );
  const [baseDashboardDiscountTypes, setBaseDashboardDiscountTypes] = useState<string[]>(
    cachedBootstrap?.meta.filters?.discountTypes ?? []
  );
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>(cachedDefaultDivisions);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedFcNames, setSelectedFcNames] = useState<string[]>([]);
  const [selectedDiscountTypes, setSelectedDiscountTypes] = useState<string[]>([]);
  const [baselineStart, setBaselineStart] = useState(
    storedBaseline?.start ?? cachedBootstrap?.meta.config.baselineStart ?? ""
  );
  const [baselineEnd, setBaselineEnd] = useState(
    storedBaseline?.end ?? cachedBootstrap?.meta.config.baselineEnd ?? ""
  );
  const [selectedSite, setSelectedSite] = useState(cachedBootstrap?.selectedSite ?? "");
  const [selectedTrend, setSelectedTrend] = useState<ProjectTrendPoint[]>(
    cachedBootstrap?.selectedProjectTrend ?? []
  );
  const [isRefreshingSelectedTrend, setIsRefreshingSelectedTrend] = useState(false);
  const [trendRange, setTrendRange] = useState<TrendRange>("all");
  const [chartRangeStart, setChartRangeStart] = useState("");
  const [chartRangeEnd, setChartRangeEnd] = useState("");
  const [priceLadderMode, setPriceLadderMode] = useState<PriceLadderMode>("summary");
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>("daily");
  const [currentPage, setCurrentPage] = useState(1);
  const [hasLoadedProjects, setHasLoadedProjects] = useState(hasCachedBootstrap);
  const [activeHint, setActiveHint] = useState<TableColumnHelpKey | null>(null);
  const [activeCalcHelp, setActiveCalcHelp] = useState<CalcHelpKey | null>(null);
  const [adminNotificationSummary, setAdminNotificationSummary] = useState({
    pendingRequestCount: 0,
    dataOceanTokenAlert: false,
    dataOceanDaysRemaining: null as number | null
  });
  const [isBootstrapping, setIsBootstrapping] = useState(!hasCachedBootstrap);
  const [isRefreshingDashboard, setIsRefreshingDashboard] = useState(false);
  const [isRefreshingProjects, setIsRefreshingProjects] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [projectError, setProjectError] = useState("");
  const [hasDashboardData, setHasDashboardData] = useState(cachedBootstrap?.hasData !== false);
  const [dashboardBackendRefreshing, setDashboardBackendRefreshing] = useState(
    cachedBootstrap?.isRefreshing ?? false
  );
  const [dashboardRefreshError, setDashboardRefreshError] = useState(cachedBootstrap?.refreshError ?? "");
  const showDashboardSlowNotice = useDelayedFlag(isBootstrapping || isRefreshingDashboard, 1400);
  const showProjectSlowNotice = useDelayedFlag(isRefreshingProjects, 1400);
  const showSelectedTrendSlowNotice = useDelayedFlag(isRefreshingSelectedTrend, 1400);
  const dashboardDefaultDivisions = useMemo(
    () =>
      baseDashboardDivisions.length > 0
        ? baseDashboardDivisions
        : getDashboardDivisions(meta?.filters?.divisions ?? [], dashboardDivision),
    [baseDashboardDivisions, meta, dashboardDivision]
  );
  const queryFilterState = useMemo<QueryFilterState>(
    () => ({
      selectedDivisions,
      selectedSegments,
      selectedChannels,
      selectedFcNames,
      selectedDiscountTypes,
      baselineStart,
      baselineEnd
    }),
    [
      selectedDivisions,
      selectedSegments,
      selectedChannels,
      selectedFcNames,
      selectedDiscountTypes,
      baselineStart,
      baselineEnd
    ]
  );
  const canonicalQueryFilterState = useMemo(
    () => normalizeFilterState(queryFilterState),
    [queryFilterState]
  );
  const normalizedSelectedBuckets = useMemo(
    () => normalizeQueryValues(selectedBuckets),
    [selectedBuckets]
  );
  const debouncedQueryFilterState = useDebouncedValue(canonicalQueryFilterState, FILTER_DEBOUNCE_MS);
  const debouncedSelectedDay = useDebouncedValue(selectedDay, FILTER_DEBOUNCE_MS);
  const debouncedSelectedBuckets = useDebouncedValue(normalizedSelectedBuckets, FILTER_DEBOUNCE_MS);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const buildFilterQuery = (filterState: QueryFilterState) =>
    buildDashboardFilterQuery({
      divisions: filterState.selectedDivisions,
      segments: filterState.selectedSegments,
      channels: filterState.selectedChannels,
      fcNames: filterState.selectedFcNames,
      discountTypes: filterState.selectedDiscountTypes,
      baselineStart: filterState.baselineStart,
      baselineEnd: filterState.baselineEnd
    });

  const buildCompanyScopedQuery = (params = new URLSearchParams()) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("company", dashboardDivision);
    return nextParams;
  };
  const buildBootstrapQueryParams = (selectedSiteValue?: string) => {
    const params = buildCompanyScopedQuery(buildFilterQuery(debouncedQueryFilterState));
    params.set("page", "1");
    params.set("pageSize", String(PAGE_SIZE));
    if (selectedSiteValue) {
      params.set("selectedSite", selectedSiteValue);
    }
    return params;
  };
  const buildProjectsQueryParams = () => {
    const params = buildCompanyScopedQuery(buildFilterQuery(debouncedQueryFilterState));
    if (debouncedSelectedDay) {
      params.set("day", debouncedSelectedDay);
    }
    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    }
    if (debouncedSelectedBuckets.length > 0) {
      params.set("ladder", debouncedSelectedBuckets.join(","));
    }
    params.set("page", String(currentPage));
    params.set("pageSize", String(PAGE_SIZE));
    return params;
  };
  const buildBootstrapCacheKey = (params: URLSearchParams) => buildCanonicalQueryKey(params);
  const applyDashboardResponse = (response: {
    meta: MetaResponse;
    summary: SummaryResponse;
    trend: TrendPoint[];
    divisionPriceTrend: DivisionPriceTrendPoint[];
    hasData?: boolean;
    isRefreshing?: boolean;
    refreshError?: string | null;
  }) => {
    setMeta(response.meta);
    setBaselineStart(response.meta.config.baselineStart);
    setBaselineEnd(response.meta.config.baselineEnd);
    setSummary(response.summary);
    setTrend(response.trend);
    setDivisionPriceTrend(response.divisionPriceTrend ?? []);
    setHasDashboardData(response.hasData !== false);
    setDashboardBackendRefreshing(response.isRefreshing ?? false);
    setDashboardRefreshError(response.refreshError ?? "");
  };
  const applyProjectsResponse = (
    response: Pick<ProjectResponse, "rows" | "total">,
    preferredSite = selectedSite
  ) => {
    setProjectRows(response.rows);
    setProjectTotal(response.total);
    setHasLoadedProjects(true);

    const stillExists = response.rows.some((row) => row.siteNo === preferredSite);
    if (!stillExists) {
      setSelectedSite(response.rows[0]?.siteNo ?? "");
    }
  };

  const toggleValue = (value: string, setter: Dispatch<SetStateAction<string[]>>) => {
    setter((items) =>
      items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
    );
  };

  const clearDivisions = () => {
    setSelectedDivisions(dashboardDefaultDivisions);
    setSelectedFcNames([]);
  };

  const clearFcNames = () => {
    setSelectedFcNames([]);
    setSelectedDivisions((currentDivisions) =>
      currentDivisions.length > 0 ? currentDivisions : dashboardDefaultDivisions
    );
  };

  const toggleDivision = (value: string) => {
    if (!dashboardDefaultDivisions.includes(value)) {
      return;
    }

    const fcNamesInDivision = new Set(
      baseDashboardFcNamesByDivision[value] ?? meta?.filters?.fcNamesByDivision?.[value] ?? []
    );

    setSelectedFcNames((currentFcNames) =>
      currentFcNames.filter((fcName) => !fcNamesInDivision.has(fcName))
    );
    setSelectedDivisions((currentDivisions) => {
      const hasSelectedEveryDivision = areSameValues(currentDivisions, dashboardDefaultDivisions);

      if (hasSelectedEveryDivision) {
        return [value];
      }

      return currentDivisions.includes(value)
        ? currentDivisions.filter((division) => division !== value)
        : [...currentDivisions, value];
    });
  };

  const selectOnlyDivision = (value: string) => {
    if (!dashboardDefaultDivisions.includes(value)) {
      return;
    }

    const fcNamesInDivision = new Set(
      baseDashboardFcNamesByDivision[value] ?? meta?.filters?.fcNamesByDivision?.[value] ?? []
    );
    setSelectedFcNames((currentFcNames) =>
      currentFcNames.filter((fcName) => !fcNamesInDivision.has(fcName))
    );
    setSelectedDivisions([value]);
  };

  const toggleFcName = (division: string, fcName: string) => {
    if (!dashboardDefaultDivisions.includes(division)) {
      return;
    }

    setSelectedFcNames((currentFcNames) => {
      const isSelecting = !currentFcNames.includes(fcName);
      const nextFcNames = isSelecting
        ? [...currentFcNames, fcName]
        : currentFcNames.filter((value) => value !== fcName);

      setSelectedDivisions((currentDivisions) => {
        const hasSelectedEveryDivision = areSameValues(currentDivisions, dashboardDefaultDivisions);

        if (nextFcNames.length === 0 || hasSelectedEveryDivision) {
          return currentDivisions.length > 0 ? currentDivisions : dashboardDefaultDivisions;
        }

        const nextDivisions = currentDivisions.filter((value) => value !== division);
        return nextDivisions.length > 0 ? nextDivisions : dashboardDefaultDivisions;
      });

      return nextFcNames;
    });
  };

  const clearSharedFilters = () => {
    clearDivisions();
    setSelectedSegments([]);
    setSelectedChannels([]);
    setSelectedFcNames([]);
    setSelectedDiscountTypes([]);
  };

  const resetTableFilters = () => {
    setSearch("");
    setSelectedDay("");
    setSelectedBuckets([]);
    clearSharedFilters();
    setCurrentPage(1);
  };

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    setIsBootstrapping(true);
    setIsRefreshingDashboard(false);
    setIsRefreshingProjects(false);
    setIsRefreshingSelectedTrend(false);
    setDashboardError("");
    setProjectError("");
    setDashboardRefreshError("");
    setHasDashboardData(true);
    setMeta(null);
    setSummary(null);
    setTrend([]);
    setDivisionPriceTrend([]);
    setHasLoadedProjects(false);
    setBaseDashboardDivisions(cachedDefaultDivisions);
    setBaseDashboardFcNamesByDivision({});
    setBaseDashboardSegments([]);
    setBaseDashboardChannels([]);
    setBaseDashboardDiscountTypes([]);
    setSelectedDivisions(cachedDefaultDivisions);
    setSelectedSegments([]);
    setSelectedChannels([]);
    setSelectedFcNames([]);
    setSelectedDiscountTypes([]);
    setSelectedBuckets([]);
    setSelectedDay("");
    setSearch("");
    setCurrentPage(1);
    setSelectedSite("");
    setSelectedTrend([]);
    selectedSiteRef.current = "";
    skipNextBootstrapRefreshRef.current = false;
    skipNextSelectedTrendRefreshRef.current = false;
    previousTableFilterResetKeyRef.current = "";
    pendingPageResetRef.current = false;
  }, [dashboardDivision]);

  useEffect(() => {
    selectedSiteRef.current = selectedSite;
  }, [selectedSite]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      const startedAt = performance.now();
      try {
        if (!hasCachedBootstrap) {
          setIsBootstrapping(true);
        }
        setDashboardError("");
        setProjectError("");
        const initialParams = buildCompanyScopedQuery(new URLSearchParams({
          divisions: dashboardDivisionAliases[dashboardDivision].join(",")
        }));
        initialParams.set("page", "1");
        initialParams.set("pageSize", String(PAGE_SIZE));
        const fetchBootstrap = async (params: URLSearchParams) =>
          fetchJson<PriceTrackingBootstrapResponse>(`/api/price-tracking/bootstrap?${params.toString()}`, {
            signal: controller.signal
          });
        let bootstrapResponse = await fetchBootstrap(initialParams);
        let defaultDivisions = getDashboardDivisions(
          bootstrapResponse.meta.filters?.divisions ?? [],
          dashboardDivision
        );

        if (
          bootstrapResponse.hasData !== false &&
          defaultDivisions.length === 0 &&
          bootstrapResponse.summary.comparableSites === 0
        ) {
          const fallbackParams = buildCompanyScopedQuery();
          fallbackParams.set("page", "1");
          fallbackParams.set("pageSize", String(PAGE_SIZE));
          bootstrapResponse = await fetchBootstrap(fallbackParams);
          defaultDivisions = [];
        }

        if (controller.signal.aborted) {
          return;
        }

        setBaseDashboardDivisions(defaultDivisions);
        setBaseDashboardFcNamesByDivision(bootstrapResponse.meta.filters?.fcNamesByDivision ?? {});
        setBaseDashboardSegments(bootstrapResponse.meta.filters?.segments ?? []);
        setBaseDashboardChannels(bootstrapResponse.meta.filters?.channels ?? []);
        setBaseDashboardDiscountTypes(bootstrapResponse.meta.filters?.discountTypes ?? []);
        setSelectedDivisions(defaultDivisions);
        applyDashboardResponse(bootstrapResponse);
        setProjectRows(bootstrapResponse.projects.rows);
        setProjectTotal(bootstrapResponse.projects.total);
        setHasLoadedProjects(true);
        setSelectedSite(bootstrapResponse.selectedSite);
        setSelectedTrend(bootstrapResponse.selectedProjectTrend);
        bootstrapCacheByDivision.set(dashboardDivision, bootstrapResponse);
        const bootstrapKey = buildBootstrapCacheKey(initialParams);
        bootstrapQueryCache.set(bootstrapKey, bootstrapResponse);

        const bootstrapFilterState = normalizeFilterState({
          selectedDivisions: defaultDivisions,
          selectedSegments: [],
          selectedChannels: [],
          selectedFcNames: [],
          selectedDiscountTypes: [],
          baselineStart: bootstrapResponse.meta.config.baselineStart,
          baselineEnd: bootstrapResponse.meta.config.baselineEnd
        });
        const dashboardParams = buildCompanyScopedQuery(buildFilterQuery(bootstrapFilterState));
        const dashboardKey = buildCanonicalQueryKey(dashboardParams);
        const projectsParams = new URLSearchParams(dashboardParams);
        projectsParams.set("page", "1");
        projectsParams.set("pageSize", String(PAGE_SIZE));
        const projectsKey = buildCanonicalQueryKey(projectsParams);
        const selectedTrendKey = bootstrapResponse.selectedSite
          ? `${bootstrapResponse.selectedSite}?${dashboardKey}`
          : "";

        dashboardCacheRef.current.set(dashboardKey, {
          meta: bootstrapResponse.meta,
          summary: bootstrapResponse.summary,
          trend: bootstrapResponse.trend,
          divisionPriceTrend: bootstrapResponse.divisionPriceTrend,
          generatedAt: bootstrapResponse.generatedAt,
          snapshotFetchedAt: bootstrapResponse.snapshotFetchedAt
        });
        projectsCacheRef.current.set(projectsKey, {
          rows: bootstrapResponse.projects.rows,
          total: bootstrapResponse.projects.total,
          generatedAt: bootstrapResponse.generatedAt,
          snapshotFetchedAt: bootstrapResponse.snapshotFetchedAt
        });
        if (selectedTrendKey) {
          selectedTrendCacheRef.current.set(selectedTrendKey, {
            rows: bootstrapResponse.selectedProjectTrend,
            generatedAt: bootstrapResponse.generatedAt,
            snapshotFetchedAt: bootstrapResponse.snapshotFetchedAt
          });
        }
        skipNextBootstrapRefreshRef.current = true;
        skipNextSelectedTrendRefreshRef.current = true;
        logClientTiming("time_to_first_dashboard_render", startedAt, {
          company: dashboardDivision,
          projectCount: bootstrapResponse.projects.total
        });
      } catch (requestError) {
        if (controller.signal.aborted || isAbortError(requestError)) {
          return;
        }

        setDashboardError(requestError instanceof Error ? requestError.message : "Unknown error");
      } finally {
        if (!controller.signal.aborted) {
          setIsBootstrapping(false);
        }
      }
    }

    void loadInitialData();

    return () => controller.abort();
  }, [dashboardDivision, hasCachedBootstrap]);

  const bootstrapQueryParams = useMemo(
    () => buildBootstrapQueryParams(selectedSiteRef.current),
    [
      debouncedQueryFilterState,
      dashboardDivision
    ]
  );
  const bootstrapQueryKey = useMemo(
    () => buildBootstrapCacheKey(bootstrapQueryParams),
    [bootstrapQueryParams]
  );
  const projectsQueryParams = useMemo(
    () => buildProjectsQueryParams(),
    [
      debouncedQueryFilterState,
      debouncedSelectedDay,
      debouncedSearch,
      debouncedSelectedBuckets,
      currentPage,
      dashboardDivision
    ]
  );
  const projectsQueryKey = useMemo(
    () => buildCanonicalQueryKey(projectsQueryParams),
    [projectsQueryParams]
  );
  const selectedTrendQueryParams = useMemo(
    () => buildCompanyScopedQuery(buildFilterQuery(debouncedQueryFilterState)),
    [debouncedQueryFilterState, dashboardDivision]
  );
  const selectedTrendQueryKey = useMemo(() => {
    const queryKey = buildCanonicalQueryKey(selectedTrendQueryParams);
    return selectedSite ? `${selectedSite}?${queryKey}` : "";
  }, [selectedSite, selectedTrendQueryParams]);
  const tableFilterResetKey = useMemo(
    () =>
      JSON.stringify({
        search: debouncedSearch,
        selectedBuckets: debouncedSelectedBuckets,
        selectedDay: debouncedSelectedDay,
        filters: debouncedQueryFilterState
      }),
    [debouncedSearch, debouncedSelectedBuckets, debouncedSelectedDay, debouncedQueryFilterState]
  );

  useEffect(() => {
    if (!previousTableFilterResetKeyRef.current) {
      previousTableFilterResetKeyRef.current = tableFilterResetKey;
      pendingPageResetRef.current = false;
      return;
    }

    if (previousTableFilterResetKeyRef.current !== tableFilterResetKey && currentPage !== 1) {
      previousTableFilterResetKeyRef.current = tableFilterResetKey;
      pendingPageResetRef.current = true;
      setCurrentPage(1);
      return;
    }

    previousTableFilterResetKeyRef.current = tableFilterResetKey;
    pendingPageResetRef.current = false;
  }, [tableFilterResetKey, currentPage]);

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }
    if (skipNextBootstrapRefreshRef.current) {
      skipNextBootstrapRefreshRef.current = false;
      return;
    }
    if (pendingPageResetRef.current) {
      return;
    }

    const requestId = ++dashboardRequestIdRef.current;
    const controller = new AbortController();

    async function loadBootstrapData(remainingFollowups = BOOTSTRAP_MAX_REVALIDATE_ATTEMPTS) {
      try {
        const startedAt = performance.now();
        const cachedResponse = bootstrapQueryCache.get(bootstrapQueryKey);
        if (cachedResponse) {
          applyDashboardResponse(cachedResponse);
          if (
            cachedResponse.selectedSite &&
            cachedResponse.selectedSite === (selectedSiteRef.current || cachedResponse.selectedSite)
          ) {
            setSelectedSite(cachedResponse.selectedSite);
            setSelectedTrend(cachedResponse.selectedProjectTrend);
          }
        } else if (!summary) {
          setSelectedSite("");
          setSelectedTrend([]);
          selectedSiteRef.current = "";
        }
        setIsRefreshingDashboard(true);
        setDashboardError("");
        const bootstrapResponse = await fetchJson<PriceTrackingBootstrapResponse>(
          `/api/price-tracking/bootstrap?${bootstrapQueryParams.toString()}`,
          { signal: controller.signal }
        );

        if (requestId !== dashboardRequestIdRef.current || controller.signal.aborted) {
          return;
        }

        bootstrapQueryCache.set(bootstrapQueryKey, bootstrapResponse);
        dashboardCacheRef.current.set(
          buildCanonicalQueryKey(buildCompanyScopedQuery(buildFilterQuery(debouncedQueryFilterState))),
          {
            meta: bootstrapResponse.meta,
            summary: bootstrapResponse.summary,
            trend: bootstrapResponse.trend,
            divisionPriceTrend: bootstrapResponse.divisionPriceTrend,
            generatedAt: bootstrapResponse.generatedAt,
            snapshotFetchedAt: bootstrapResponse.snapshotFetchedAt,
            isStale: bootstrapResponse.isStale,
            isRefreshing: bootstrapResponse.isRefreshing,
            hasData: bootstrapResponse.hasData
          }
        );
        applyDashboardResponse(bootstrapResponse);
        if (
          bootstrapResponse.selectedSite &&
          bootstrapResponse.selectedSite === (selectedSiteRef.current || bootstrapResponse.selectedSite)
        ) {
          skipNextSelectedTrendRefreshRef.current = true;
          setSelectedSite(bootstrapResponse.selectedSite);
          setSelectedTrend(bootstrapResponse.selectedProjectTrend);
          selectedTrendCacheRef.current.set(`${bootstrapResponse.selectedSite}?${buildCanonicalQueryKey(selectedTrendQueryParams)}`, {
            rows: bootstrapResponse.selectedProjectTrend,
            generatedAt: bootstrapResponse.generatedAt,
            snapshotFetchedAt: bootstrapResponse.snapshotFetchedAt,
            isStale: bootstrapResponse.isStale,
            isRefreshing: bootstrapResponse.isRefreshing,
            hasData: bootstrapResponse.hasData
          });
        }
        logClientTiming("bootstrap_refresh", startedAt, {
          company: dashboardDivision,
          hasCachedData: Boolean(cachedResponse)
        });

        if (
          remainingFollowups > 0 &&
          !controller.signal.aborted &&
          (bootstrapResponse.isStale ||
            bootstrapResponse.isRefreshing ||
            (bootstrapResponse.hasData === false && !bootstrapResponse.refreshError))
        ) {
          const delay =
            bootstrapResponse.hasData === false
              ? BOOTSTRAP_COLD_REVALIDATE_DELAY_MS
              : BOOTSTRAP_REVALIDATE_DELAY_MS;
          window.setTimeout(() => {
            if (!controller.signal.aborted) {
              void loadBootstrapData(remainingFollowups - 1);
            }
          }, delay);
        }
      } catch (requestError) {
        if (
          requestId !== dashboardRequestIdRef.current ||
          controller.signal.aborted ||
          isAbortError(requestError)
        ) {
          return;
        }

        setDashboardError(requestError instanceof Error ? requestError.message : "Unknown error");
      } finally {
        if (requestId === dashboardRequestIdRef.current && !controller.signal.aborted) {
          setIsRefreshingDashboard(false);
        }
      }
    }

    void loadBootstrapData();

    return () => controller.abort();
  }, [
    isBootstrapping,
    pendingPageResetRef,
    bootstrapQueryKey,
    bootstrapQueryParams,
    dashboardDivision,
    debouncedQueryFilterState,
    selectedTrendQueryParams
  ]);

  useEffect(() => {
    if (isBootstrapping || pendingPageResetRef.current) {
      return;
    }

    const requestId = ++projectRequestIdRef.current;
    const controller = new AbortController();

    async function loadProjects() {
      try {
        const startedAt = performance.now();
        const cachedResponse = projectsCacheRef.current.get(projectsQueryKey);
        if (cachedResponse) {
          applyProjectsResponse(cachedResponse, selectedSiteRef.current);
        } else if (!hasLoadedProjects) {
          setProjectRows([]);
          setProjectTotal(0);
        }

        setIsRefreshingProjects(true);
        setProjectError("");

        const projectsResponse = await fetchJson<ProjectResponse>(
          `/api/projects?${projectsQueryParams.toString()}`,
          { signal: controller.signal }
        );

        if (requestId !== projectRequestIdRef.current || controller.signal.aborted) {
          return;
        }

        projectsCacheRef.current.set(projectsQueryKey, projectsResponse);
        applyProjectsResponse(projectsResponse, selectedSiteRef.current);
        logClientTiming("projects_refresh", startedAt, {
          company: dashboardDivision,
          hasCachedData: Boolean(cachedResponse),
          page: currentPage
        });
      } catch (requestError) {
        if (
          requestId !== projectRequestIdRef.current ||
          controller.signal.aborted ||
          isAbortError(requestError)
        ) {
          return;
        }

        setProjectError(requestError instanceof Error ? requestError.message : "Unknown error");
      } finally {
        if (requestId === projectRequestIdRef.current && !controller.signal.aborted) {
          setIsRefreshingProjects(false);
        }
      }
    }

    void loadProjects();

    return () => controller.abort();
  }, [
    isBootstrapping,
    pendingPageResetRef,
    projectsQueryKey,
    projectsQueryParams,
    dashboardDivision,
    currentPage
  ]);

  useEffect(() => {
    if (skipNextSelectedTrendRefreshRef.current) {
      skipNextSelectedTrendRefreshRef.current = false;
      return;
    }

    const controller = new AbortController();

    async function loadSelectedTrend() {
      if (!selectedSite) {
        selectedTrendRequestIdRef.current += 1;
        setSelectedTrend([]);
        setIsRefreshingSelectedTrend(false);
        return;
      }

      const requestId = ++selectedTrendRequestIdRef.current;
      const startedAt = performance.now();
      const cachedResponse = selectedTrendCacheRef.current.get(selectedTrendQueryKey);
      if (cachedResponse) {
        setSelectedTrend(cachedResponse.rows);
      }
      setIsRefreshingSelectedTrend(true);

      try {
        const projectTrendResponse = await fetchJson<ProjectTrendResponse>(
          `/api/projects/${encodeURIComponent(selectedSite)}/trend?${selectedTrendQueryParams.toString()}`,
          { signal: controller.signal }
        );

        if (requestId !== selectedTrendRequestIdRef.current || controller.signal.aborted) {
          return;
        }

        selectedTrendCacheRef.current.set(selectedTrendQueryKey, projectTrendResponse);
        setSelectedTrend(projectTrendResponse.rows);
        logClientTiming("selected_project_trend_refresh", startedAt, {
          siteNo: selectedSite,
          hasCachedData: Boolean(cachedResponse)
        });
      } catch (requestError) {
        if (
          requestId !== selectedTrendRequestIdRef.current ||
          controller.signal.aborted ||
          isAbortError(requestError)
        ) {
          return;
        }

        setDashboardError(requestError instanceof Error ? requestError.message : "Unknown error");
      } finally {
        if (requestId === selectedTrendRequestIdRef.current && !controller.signal.aborted) {
          setIsRefreshingSelectedTrend(false);
        }
      }
    }

    void loadSelectedTrend();

    return () => controller.abort();
  }, [
    selectedSite,
    selectedTrendQueryKey,
    selectedTrendQueryParams
  ]);

  const selectedTrendChartData = useMemo(
    () => buildSelectedTrendChartData({ meta, selectedSite, selectedTrend }),
    [meta, selectedSite, selectedTrend]
  );
  const postCampaignTrendData = useMemo(
    () => getPostCampaignTrendData(meta, trend),
    [meta, trend]
  );
  const chartRangeMinDay = postCampaignTrendData[0]?.day ?? "";
  const chartRangeMaxDay = postCampaignTrendData.at(-1)?.day ?? "";
  const effectiveChartRangeStart = chartRangeStart || chartRangeMinDay;
  const effectiveChartRangeEnd = chartRangeEnd || chartRangeMaxDay;
  const filteredPostCampaignTrendData = useMemo(
    () =>
      getFilteredAverageTrend({
        meta: null,
        trend: postCampaignTrendData,
        trendRange,
        customStart: effectiveChartRangeStart,
        customEnd: effectiveChartRangeEnd
      }),
    [postCampaignTrendData, trendRange, effectiveChartRangeStart, effectiveChartRangeEnd]
  );
  const groupedPostCampaignTrendData = useMemo(
    () =>
      getTrendPointsByGranularity({
        trend: filteredPostCampaignTrendData,
        granularity: trendGranularity
      }),
    [filteredPostCampaignTrendData, trendGranularity]
  );
  const proportionTrendData = useMemo(
    () => buildProportionTrendData(groupedPostCampaignTrendData),
    [groupedPostCampaignTrendData]
  );
  const activeTrendBucketSeries = useMemo(
    () => getActiveTrendBucketSeries(priceLadderMode),
    [priceLadderMode]
  );
  const filteredAverageTrend = useMemo(
    () =>
      getTrendPointsByGranularity({
        trend: getFilteredAverageTrend({
          meta,
          trend,
          trendRange,
          customStart: effectiveChartRangeStart,
          customEnd: effectiveChartRangeEnd
        }),
        granularity: trendGranularity
      }),
    [meta, trend, trendRange, effectiveChartRangeStart, effectiveChartRangeEnd, trendGranularity]
  );
  const divisionPriceTrendByGranularity = useMemo(
    () =>
      getDivisionPriceTrendByGranularity({
        trend: getFilteredDivisionPriceTrend({
          meta,
          trend: divisionPriceTrend,
          trendRange,
          customStart: effectiveChartRangeStart,
          customEnd: effectiveChartRangeEnd
        }),
        granularity: trendGranularity
      }),
    [meta, divisionPriceTrend, trendRange, effectiveChartRangeStart, effectiveChartRangeEnd, trendGranularity]
  );
  const availableDivisions =
    dashboardDefaultDivisions.length > 0
      ? dashboardDefaultDivisions
      : (meta?.filters?.divisions ?? []);
  const availableSegments =
    baseDashboardSegments.length > 0 ? baseDashboardSegments : (meta?.filters?.segments ?? []);
  const availableChannels =
    baseDashboardChannels.length > 0 ? baseDashboardChannels : (meta?.filters?.channels ?? []);
  const fcNamesByDivision =
    Object.keys(baseDashboardFcNamesByDivision).length > 0
      ? baseDashboardFcNamesByDivision
      : (meta?.filters?.fcNamesByDivision ?? {});
  const availableDiscountTypes =
    baseDashboardDiscountTypes.length > 0
      ? baseDashboardDiscountTypes
      : (meta?.filters?.discountTypes ?? []);
  const selectedFcDivisions = useMemo(
    () =>
      dashboardDefaultDivisions.filter((division) =>
        (fcNamesByDivision[division] ?? []).some((fcName) => selectedFcNames.includes(fcName))
      ),
    [dashboardDefaultDivisions, fcNamesByDivision, selectedFcNames]
  );
  const hasExplicitDivisionSelection =
    selectedDivisions.length > 0 && !areSameValues(selectedDivisions, dashboardDefaultDivisions);
  const divisionPriceChartDivisions = orderCompanyDivisions(
    hasExplicitDivisionSelection
      ? selectedDivisions
      : selectedFcDivisions.length > 0
        ? selectedFcDivisions
        : dashboardDefaultDivisions,
    dashboardDivision
  );
  const expandedDivisionPriceDivisions = useMemo(() => {
    if (divisionPriceChartDivisions.length !== 1) {
      return [];
    }

    return divisionPriceChartDivisions;
  }, [divisionPriceChartDivisions]);
  const divisionPriceChart = useMemo(
    () =>
      buildDivisionPriceChartData({
        trend: divisionPriceTrendByGranularity,
        divisions: divisionPriceChartDivisions,
        expandedDivisions: expandedDivisionPriceDivisions
      }),
    [divisionPriceTrendByGranularity, divisionPriceChartDivisions, expandedDivisionPriceDivisions]
  );
  const availableDays = useMemo(
    () => postCampaignTrendData.map((point) => point.day),
    [postCampaignTrendData]
  );

  const hasTrendData = postCampaignTrendData.length > 0;

  const totalPages = Math.max(1, Math.ceil(projectTotal / PAGE_SIZE));
  const firstProjectIndex = projectTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastProjectIndex = Math.min(currentPage * PAGE_SIZE, projectTotal);
  const paginationItems = getPaginationItems(currentPage, totalPages);
  const activeTableFilters = buildActiveTableFilters({
    selectedBuckets,
    selectedDayLabel: selectedDay ? formatThaiDateShort(selectedDay) : "",
    selectedDivisions,
    selectedSegments,
    selectedChannels,
    selectedFcNames,
    selectedDiscountTypes,
    search
  });

  if (!dashboardError && (isBootstrapping || !meta || !summary)) {
    return (
      <PriceTrackingShell
        authUser={authUser}
        activeMenu={activeMenu}
        allowedMenus={allowedMenus}
        themeMode={themeMode}
        onToggleTheme={onToggleTheme}
        onMenuChange={onMenuChange}
        onLogout={onLogout}
        onOpenChangePassword={onOpenChangePassword}
        hideSidebar={hideSidebar}
        hideUserActions={hideUserActions}
      >
        <div className={appShellClass}>
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center shadow-[0_24px_80px_rgba(2,8,20,0.24)]">
            <strong>กำลังโหลด dashboard...</strong>
            <span className="mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
              {showDashboardSlowNotice
                ? "ข้อมูลชุดนี้ใช้เวลานานกว่าปกติ ระบบยังโหลดต่ออยู่"
                : "กำลังเตรียมข้อมูลล่าสุด"}
            </span>
          </div>
        </div>
      </PriceTrackingShell>
    );
  }

  if (dashboardError || !meta || !summary) {
    return (
      <PriceTrackingShell
        authUser={authUser}
        activeMenu={activeMenu}
        allowedMenus={allowedMenus}
        themeMode={themeMode}
        onToggleTheme={onToggleTheme}
        onMenuChange={onMenuChange}
        onLogout={onLogout}
        onOpenChangePassword={onOpenChangePassword}
        hideSidebar={hideSidebar}
        hideUserActions={hideUserActions}
      >
        <div className={appShellClass}>
          <div className="rounded-[28px] border border-[var(--alert-error-border)] bg-[var(--alert-error-bg)] px-6 py-5 text-sm font-medium text-[var(--alert-error-text)]">
            Cannot load dashboard: {dashboardError || "missing data"}
          </div>
        </div>
      </PriceTrackingShell>
    );
  }

  const latestTrendDay = postCampaignTrendData.at(-1)?.day ?? meta.metadata.max_dp_date;
  const targetHitSites = summary.comparableSites - summary.belowTargetSites;
  const targetHitShare = Number.isFinite(summary.targetHitShare)
    ? summary.targetHitShare
    : summary.comparableSites > 0
      ? (targetHitSites / summary.comparableSites) * 100
      : 0;
  const summaryDateRange = formatSummaryDateRange(summary, latestTrendDay);
  const coldDataLoading = !hasDashboardData && !dashboardRefreshError;
  const calcHelpContent = buildCalcHelpContent({
    summary,
    summaryDateRange,
    targetHitSites
  });
  const activeCalcContent = activeCalcHelp ? calcHelpContent[activeCalcHelp] : null;
  const sharedFilterMenu = (
      <SharedFilterMenuBar
      selectedBaselineStart={baselineStart}
      selectedBaselineEnd={baselineEnd}
      availableDivisions={availableDivisions}
      availableSegments={availableSegments}
      availableChannels={availableChannels}
      availableDiscountTypes={availableDiscountTypes}
      fcNamesByDivision={fcNamesByDivision}
      selectedDivisions={selectedDivisions}
      selectedSegments={selectedSegments}
      selectedChannels={selectedChannels}
      selectedFcNames={selectedFcNames}
      selectedDiscountTypes={selectedDiscountTypes}
      onOpenBaselineHelp={() => setActiveCalcHelp("baselineDefinition")}
      onApplyBaseline={(start, end) => {
        setBaselineStart(start);
        setBaselineEnd(end);
        storeBaseline(dashboardDivision, start, end);
      }}
      onResetSharedFilters={clearSharedFilters}
      onSelectDivision={selectOnlyDivision}
      onToggleDivision={toggleDivision}
      onClearDivisions={clearDivisions}
      onToggleFcName={toggleFcName}
      onClearFcNames={clearFcNames}
      onToggleSegment={(value) => toggleValue(value, setSelectedSegments)}
      onClearSegments={() => setSelectedSegments([])}
      onToggleChannel={(value) => toggleValue(value, setSelectedChannels)}
      onClearChannels={() => setSelectedChannels([])}
      onToggleDiscountType={(value) => toggleValue(value, setSelectedDiscountTypes)}
      onClearDiscountTypes={() => setSelectedDiscountTypes([])}
    />
  );
  const hasDashboardAlert = !hasDashboardData || !hasTrendData || Boolean(dashboardError);
  const dashboardAlertLabel = !hasDashboardData
    ? dashboardRefreshError
      ? `refresh ข้อมูลไม่สำเร็จ: ${dashboardRefreshError}`
      : dashboardBackendRefreshing
        ? "กำลังโหลดข้อมูลล่าสุด"
        : "กำลังโหลดข้อมูลล่าสุด"
    : !hasTrendData
      ? "ยังไม่มีข้อมูลที่ตรงกับตัวกรอง"
      : dashboardError
        ? `โหลด dashboard ไม่สำเร็จ: ${dashboardError}`
        : "";
  const pendingNotificationCount =
    adminNotificationSummary.pendingRequestCount +
    (adminNotificationSummary.dataOceanTokenAlert ? 1 : 0) +
    (hasDashboardAlert ? 1 : 0);
  const dataOceanAlertLabel =
    adminNotificationSummary.dataOceanDaysRemaining !== null &&
    adminNotificationSummary.dataOceanDaysRemaining <= 0
      ? "DataOcean Token หมดอายุแล้ว"
      : adminNotificationSummary.dataOceanDaysRemaining === 1
        ? "DataOcean Token จะหมดอายุพรุ่งนี้"
        : adminNotificationSummary.dataOceanDaysRemaining !== null
          ? `DataOcean Token เหลือ ${adminNotificationSummary.dataOceanDaysRemaining} วัน`
          : "DataOcean Token ใกล้หมดอายุ";
  const notificationLabel =
    pendingNotificationCount > 0
      ? [
          hasDashboardAlert ? dashboardAlertLabel : null,
          adminNotificationSummary.pendingRequestCount > 0
            ? `มีคำขอสิทธิ์รออนุมัติ ${adminNotificationSummary.pendingRequestCount} รายการ`
            : null,
          adminNotificationSummary.dataOceanTokenAlert ? dataOceanAlertLabel : null
        ]
          .filter(Boolean)
          .join(" • ")
      : "ยังไม่มีคำขอสิทธิ์ใหม่";
  const openAdminNotifications = () => {
    if (hasDashboardAlert) {
      document.getElementById("dashboard-alert")?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      return;
    }

    const target = adminNotificationSummary.dataOceanTokenAlert ? "data-ocean" : "users";
    window.sessionStorage.setItem("admin-active-view", target);
    window.dispatchEvent(new CustomEvent("admin-view-change", { detail: target }));
    onMenuChange("admin");
  };

  return (
    <PriceTrackingShell
      authUser={authUser}
      activeMenu={activeMenu}
      allowedMenus={allowedMenus}
      themeMode={themeMode}
      onToggleTheme={onToggleTheme}
      onMenuChange={onMenuChange}
      onLogout={onLogout}
      onOpenChangePassword={onOpenChangePassword}
      filterMenu={sharedFilterMenu}
      hideSidebar={hideSidebar}
      hideUserActions={hideUserActions}
      onAdminNotificationChange={setAdminNotificationSummary}
    >
      <div onClick={() => setActiveHint(null)}>
        <section id="overview">
          <OverviewSection
            dashboardLabel={APP_MENU_LABELS[activeMenu] ?? `Dashboard ติดตามการขึ้นราคา (${dashboardDivision})`}
            baselineStart={meta.config.baselineStart}
            baselineEnd={meta.config.baselineEnd}
            campaignStart={meta.config.campaignStart}
            avgIncreaseLabel={formatNumber(summary.avgIncrease)}
            targetHitShareLabel={`${formatNumber(targetHitShare)}%`}
            summaryDateRange={summaryDateRange}
            dashboardLoading={coldDataLoading}
            coldDataLoading={coldDataLoading}
            showDashboardSlowNotice={showDashboardSlowNotice}
            themeMode={themeMode}
            pendingNotificationCount={pendingNotificationCount}
            notificationLabel={notificationLabel}
            hasDashboardAlert={hasDashboardAlert}
            onToggleTheme={onToggleTheme}
            onOpenNotifications={openAdminNotifications}
            onOpenCalcHelp={setActiveCalcHelp}
          />
        </section>

        {!hasDashboardData || !hasTrendData ? (
          <div className={appShellClass}>
            <div id="dashboard-alert" className="scroll-mt-28 rounded-[22px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 text-sm leading-6 text-[var(--muted-foreground)] shadow-[0_18px_40px_var(--shadow-color)]">
              <strong className="block text-[var(--foreground)]">
                {!hasDashboardData
                  ? dashboardBackendRefreshing
                    ? "กำลังโหลดข้อมูล"
                    : "กำลังโหลด dashboard..."
                  : "ยังไม่มีข้อมูลที่ตรงกับตัวกรอง"}
              </strong>
              {!hasDashboardData
                ? dashboardRefreshError
                  ? `refresh ข้อมูลไม่สำเร็จ: ${dashboardRefreshError}`
                  : dashboardBackendRefreshing
                    ? "ระบบกำลังดึงข้อมูลล่าสุดจาก DataOcean ใช้เวลาประมาณ 20-30 วินาทีในรอบแรก หน้านี้จะอัปเดตให้อัตโนมัติ"
                    : "ระบบกำลังเตรียมข้อมูลสำหรับ dashboard หน้านี้จะอัปเดตให้อัตโนมัติ"
                : "ลองปรับช่วง Baseline หรือรีเซ็ตตัวกรอง Division / FC, Segment, Channel และ Discount type"}
            </div>
          </div>
        ) : null}

        <section id="trends">
          <TrendChartsSection
            priceLadderMode={priceLadderMode}
            trendGranularity={trendGranularity}
            trendRange={trendRange}
            activeTrendBucketSeries={activeTrendBucketSeries}
            proportionTrendData={proportionTrendData}
            discountDropSeries={discountDropSeries}
            filteredAverageTrend={filteredAverageTrend}
            divisionPriceChartData={divisionPriceChart.data}
            divisionPriceTrendData={divisionPriceTrend}
            divisionPriceSeries={divisionPriceChart.divisions}
            showDivisionPriceChart
            dataLoading={coldDataLoading}
            baselineEnd={meta.config.baselineEnd}
            onSetPriceLadderMode={setPriceLadderMode}
            onSetTrendGranularity={setTrendGranularity}
            onSetTrendRange={setTrendRange}
            chartRangeStart={effectiveChartRangeStart}
            chartRangeEnd={effectiveChartRangeEnd}
            chartRangeMin={chartRangeMinDay}
            chartRangeMax={chartRangeMaxDay}
            onSetChartRangeStart={(value) => {
              setChartRangeStart(value);
              setTrendRange("custom");
            }}
            onSetChartRangeEnd={(value) => {
              setChartRangeEnd(value);
              setTrendRange("custom");
            }}
            onOpenCalcHelp={setActiveCalcHelp}
          />
        </section>

        <section id="project-trend">
          <ProjectTrendSection
            meta={meta}
            selectedSite={selectedSite}
            selectedTrend={selectedTrend}
            selectedTrendChartData={selectedTrendChartData}
            selectedTrendLoading={isRefreshingSelectedTrend}
            showSelectedTrendSlowNotice={showSelectedTrendSlowNotice}
            onOpenCalcHelp={setActiveCalcHelp}
          />
        </section>

        <section id="projects">
          <ProjectsTableSection
            search={search}
            selectedDay={selectedDay}
            selectedBuckets={selectedBuckets}
            availableDays={availableDays}
            activeTableFilters={activeTableFilters}
            projectRows={projectRows}
            projectTotal={projectTotal}
            currentPage={currentPage}
            totalPages={totalPages}
            firstProjectIndex={firstProjectIndex}
            lastProjectIndex={lastProjectIndex}
            paginationItems={paginationItems}
            selectedSite={selectedSite}
            activeHint={activeHint}
            projectError={projectError}
            projectLoading={isRefreshingProjects}
            hasLoadedProjects={hasLoadedProjects}
            showProjectSlowNotice={showProjectSlowNotice}
            onOpenCalcHelp={setActiveCalcHelp}
            onSearchChange={setSearch}
            onSelectDay={setSelectedDay}
            onToggleBucket={(value) =>
              setSelectedBuckets((current) =>
                current.includes(value)
                  ? current.filter((key) => key !== value)
                  : [...current, value]
              )
            }
            onClearBuckets={() => setSelectedBuckets([])}
            onResetTableFilters={resetTableFilters}
            onSelectSite={setSelectedSite}
            onToggleHint={(key) => setActiveHint((current) => (current === key ? null : key))}
            onSetCurrentPage={setCurrentPage}
          />
        </section>

        <CalcHelpModal content={activeCalcContent} onClose={() => setActiveCalcHelp(null)} />
      </div>
    </PriceTrackingShell>
  );
}
