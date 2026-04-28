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
  buildProportionTrendData,
  buildSelectedTrendChartData,
  getActiveTrendBucketSeries,
  getFilteredAverageTrend,
  getPostCampaignTrendData,
  getTrendPointsByGranularity
} from "./calculations/priceTracking";
import {
  type TableColumnHelpKey,
  discountDropSeries,
  FILTER_DEBOUNCE_MS,
  MULTI_LADDER_FETCH_SIZE,
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS
} from "./constants";
import { buildCalcHelpContent } from "./content/calcHelp";
import type {
  CalcHelpKey,
  DashboardResponse,
  MetaResponse,
  PriceLadderMode,
  ProjectResponse,
  ProjectRow,
  ProjectTrendPoint,
  SummaryResponse,
  TrendGranularity,
  TrendPoint,
  TrendRange
} from "./types";
import { buildDashboardFilterQuery } from "./utils/filters";
import { formatNumber, formatSummaryDateRange, formatThaiDateShort, getPaginationItems } from "./utils/format";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useDelayedFlag } from "../../hooks/useDelayedFlag";
import { fetchJson, isAbortError } from "../../services/api/fetchJson";
import { type AuthUser } from "../../services/auth/authUser";
import { APP_MENU_LABELS, type AppMenuKey, type CompanyCode } from "../../services/auth/localAuth";

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
  CPAC: [
    "CPAC East",
    "CPAC Metro",
    "CPAC North",
    "CPAC Northeast",
    "CPAC West",
    "RMC - South Chain"
  ],
  QMIX: [
    "QMix Bangkok",
    "QMix Central",
    "QMix East",
    "QMix North",
    "QMix Northeast",
    "QMix South"
  ]
};

function getDashboardDivisions(availableDivisions: string[], dashboardDivision: CompanyCode) {
  const aliases = new Set(dashboardDivisionAliases[dashboardDivision].map((value) => value.toUpperCase()));
  return availableDivisions.filter((division) => aliases.has(division.toUpperCase()));
}

function areSameValues(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
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
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const defaultMetaRef = useRef<MetaResponse | null>(null);
  const defaultSummaryRef = useRef<SummaryResponse | null>(null);
  const defaultTrendRef = useRef<TrendPoint[]>([]);
  const defaultBaselineStartRef = useRef("");
  const defaultBaselineEndRef = useRef("");
  const dashboardRequestIdRef = useRef(0);
  const projectRequestIdRef = useRef(0);
  const selectedTrendRequestIdRef = useRef(0);
  const [projectRows, setProjectRows] = useState<ProjectRow[]>([]);
  const [projectTotal, setProjectTotal] = useState(0);
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [search, setSearch] = useState("");
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedFcNames, setSelectedFcNames] = useState<string[]>([]);
  const [selectedDiscountTypes, setSelectedDiscountTypes] = useState<string[]>([]);
  const [baselineStart, setBaselineStart] = useState("");
  const [baselineEnd, setBaselineEnd] = useState("");
  const [selectedSite, setSelectedSite] = useState("");
  const [selectedTrend, setSelectedTrend] = useState<ProjectTrendPoint[]>([]);
  const [selectedTrendLoading, setSelectedTrendLoading] = useState(false);
  const [trendRange, setTrendRange] = useState<TrendRange>("all");
  const [priceLadderMode, setPriceLadderMode] = useState<PriceLadderMode>("summary");
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>("daily");
  const [currentPage, setCurrentPage] = useState(1);
  const [hasLoadedSummary, setHasLoadedSummary] = useState(false);
  const [hasLoadedProjects, setHasLoadedProjects] = useState(false);
  const [activeHint, setActiveHint] = useState<TableColumnHelpKey | null>(null);
  const [activeCalcHelp, setActiveCalcHelp] = useState<CalcHelpKey | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [projectLoading, setProjectLoading] = useState(false);
  const [error, setError] = useState("");
  const [projectError, setProjectError] = useState("");
  const showDashboardSlowNotice = useDelayedFlag(metaLoading || dashboardLoading, 1400);
  const showProjectSlowNotice = useDelayedFlag(projectLoading, 1400);
  const showSelectedTrendSlowNotice = useDelayedFlag(selectedTrendLoading, 1400);
  const dashboardDefaultDivisions = useMemo(
    () => getDashboardDivisions(meta?.filters?.divisions ?? [], dashboardDivision),
    [meta, dashboardDivision]
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
  const debouncedQueryFilterState = useDebouncedValue(queryFilterState, FILTER_DEBOUNCE_MS);
  const debouncedSelectedDay = useDebouncedValue(selectedDay, FILTER_DEBOUNCE_MS);
  const debouncedSelectedBuckets = useDebouncedValue(selectedBuckets, FILTER_DEBOUNCE_MS);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const buildFilterQuery = (filterState: QueryFilterState) =>
    buildDashboardFilterQuery({
      divisions:
        filterState.selectedDivisions.length > 0 || filterState.selectedFcNames.length > 0
          ? filterState.selectedDivisions
          : ["__none__"],
      segments: filterState.selectedSegments,
      channels: filterState.selectedChannels,
      fcNames: filterState.selectedFcNames,
      discountTypes: filterState.selectedDiscountTypes,
      baselineStart: filterState.baselineStart,
      baselineEnd: filterState.baselineEnd
    });

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

    const fcNamesInDivision = new Set(meta?.filters?.fcNamesByDivision?.[value] ?? []);

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
        let nextDivisions = currentDivisions;

        if (isSelecting) {
          if (hasSelectedEveryDivision) {
            nextDivisions = [];
          } else if (currentDivisions.includes(division)) {
            nextDivisions = currentDivisions.filter((value) => value !== division);
          }
        }

        if (nextFcNames.length === 0 && nextDivisions.length === 0) {
          return dashboardDefaultDivisions;
        }

        return nextDivisions;
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
    setMetaLoading(true);
    setDashboardLoading(false);
    setProjectLoading(false);
    setError("");
    setProjectError("");
    setMeta(null);
    setSummary(null);
    setTrend([]);
    setHasLoadedSummary(false);
    setHasLoadedProjects(false);
    setSelectedDivisions([]);
    setSelectedSegments([]);
    setSelectedChannels([]);
    setSelectedFcNames([]);
    setSelectedDiscountTypes([]);
    setSelectedBuckets([]);
    setSelectedDay("");
    setSearch("");
    setCurrentPage(1);
    setSelectedTrendLoading(false);
  }, [dashboardDivision]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialDashboard() {
      try {
        setMetaLoading(true);
        setError("");
        const initialParams = new URLSearchParams({
          divisions: dashboardDivisionAliases[dashboardDivision].join(",")
        });
        let dashboardResponse = await fetchJson<DashboardResponse>(
          `/api/dashboard?${initialParams.toString()}`,
          { signal: controller.signal }
        );
        let defaultDivisions = getDashboardDivisions(
          dashboardResponse.meta.filters?.divisions ?? [],
          dashboardDivision
        );

        if (defaultDivisions.length === 0 && dashboardResponse.summary.comparableSites === 0) {
          dashboardResponse = await fetchJson<DashboardResponse>("/api/dashboard", {
            signal: controller.signal
          });
          defaultDivisions = [];
        }

        if (controller.signal.aborted) {
          return;
        }

        setMeta(dashboardResponse.meta);
        defaultMetaRef.current = dashboardResponse.meta;
        setSelectedDivisions(defaultDivisions);
        setBaselineStart(dashboardResponse.meta.config.baselineStart);
        setBaselineEnd(dashboardResponse.meta.config.baselineEnd);
        defaultBaselineStartRef.current = dashboardResponse.meta.config.baselineStart;
        defaultBaselineEndRef.current = dashboardResponse.meta.config.baselineEnd;
        setSummary(dashboardResponse.summary);
        setTrend(dashboardResponse.trend);
        defaultSummaryRef.current = dashboardResponse.summary;
        defaultTrendRef.current = dashboardResponse.trend;
        setHasLoadedSummary(true);
      } catch (requestError) {
        if (controller.signal.aborted || isAbortError(requestError)) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Unknown error");
      } finally {
        if (!controller.signal.aborted) {
          setMetaLoading(false);
        }
      }
    }

    void loadInitialDashboard();

    return () => controller.abort();
  }, [dashboardDivision]);

  useEffect(() => {
    if (!meta) {
      return;
    }

    const requestId = ++dashboardRequestIdRef.current;
    const controller = new AbortController();

    async function loadFilteredDashboard() {
      const isDefaultBaseline =
        debouncedQueryFilterState.baselineStart === defaultBaselineStartRef.current &&
        debouncedQueryFilterState.baselineEnd === defaultBaselineEndRef.current;
      const isDefaultDashboardView =
        !debouncedSelectedDay &&
        areSameValues(debouncedQueryFilterState.selectedDivisions, dashboardDefaultDivisions) &&
        debouncedQueryFilterState.selectedSegments.length === 0 &&
        debouncedQueryFilterState.selectedChannels.length === 0 &&
        debouncedQueryFilterState.selectedFcNames.length === 0 &&
        debouncedQueryFilterState.selectedDiscountTypes.length === 0 &&
        isDefaultBaseline;

      if (hasLoadedSummary && isDefaultDashboardView) {
        if (requestId === dashboardRequestIdRef.current && defaultSummaryRef.current) {
          setSummary(defaultSummaryRef.current);
          setTrend(defaultTrendRef.current);
          if (defaultMetaRef.current) {
            setMeta(defaultMetaRef.current);
          }
          setDashboardLoading(false);
        }
        return;
      }

      try {
        setDashboardLoading(true);
        setError("");
        const params = buildFilterQuery(debouncedQueryFilterState);
        if (debouncedSelectedDay) {
          params.set("day", debouncedSelectedDay);
        }
        const query = params.toString();
        const suffix = query ? `?${query}` : "";

        const dashboardResponse = await fetchJson<DashboardResponse>(`/api/dashboard${suffix}`, {
          signal: controller.signal
        });

        if (requestId !== dashboardRequestIdRef.current || controller.signal.aborted) {
          return;
        }

        setMeta((currentMeta) => {
          if (
            currentMeta &&
            currentMeta.config.baselineStart === dashboardResponse.meta.config.baselineStart &&
            currentMeta.config.baselineEnd === dashboardResponse.meta.config.baselineEnd &&
            currentMeta.config.campaignStart === dashboardResponse.meta.config.campaignStart
          ) {
            return currentMeta;
          }

          return dashboardResponse.meta;
        });
        setBaselineStart(dashboardResponse.meta.config.baselineStart);
        setBaselineEnd(dashboardResponse.meta.config.baselineEnd);
        setSummary(dashboardResponse.summary);
        setTrend(dashboardResponse.trend);
        setHasLoadedSummary(true);
      } catch (requestError) {
        if (
          requestId !== dashboardRequestIdRef.current ||
          controller.signal.aborted ||
          isAbortError(requestError)
        ) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Unknown error");
      } finally {
        if (requestId === dashboardRequestIdRef.current && !controller.signal.aborted) {
          setDashboardLoading(false);
        }
      }
    }

    void loadFilteredDashboard();

    return () => controller.abort();
  }, [
    hasLoadedSummary,
    meta,
    debouncedQueryFilterState,
    debouncedSelectedDay,
    dashboardDefaultDivisions
  ]);

  useEffect(() => {
    if (!hasLoadedSummary || !meta) {
      return;
    }

    const requestId = ++projectRequestIdRef.current;
    const controller = new AbortController();

    async function loadProjects() {

      try {
        setProjectLoading(true);
        setProjectError("");
        const baseParams = buildFilterQuery(debouncedQueryFilterState);

        if (debouncedSelectedDay) {
          baseParams.set("day", debouncedSelectedDay);
        }

        if (debouncedSearch) {
          baseParams.set("search", debouncedSearch);
        }

        let projectResponse: ProjectResponse;

        if (debouncedSelectedBuckets.length > 1) {
          const responses = await Promise.all(
            debouncedSelectedBuckets.map((bucket) => {
              const params = new URLSearchParams(baseParams);
              params.set("ladder", bucket);
              params.set("page", "1");
              params.set("pageSize", String(MULTI_LADDER_FETCH_SIZE));
              return fetchJson<ProjectResponse>(`/api/projects?${params.toString()}`, {
                signal: controller.signal
              });
            })
          );
          const rows = responses
            .flatMap((response) => response.rows)
            .sort((a, b) => {
              if (a.latestDay === b.latestDay) {
                if (a.increaseAmount === b.increaseAmount) {
                  return a.siteName.localeCompare(b.siteName);
                }

                return a.increaseAmount - b.increaseAmount;
              }

              return a.latestDay.localeCompare(b.latestDay);
            });
          const startIndex = (currentPage - 1) * PAGE_SIZE;

          projectResponse = {
            rows: rows.slice(startIndex, startIndex + PAGE_SIZE),
            total: rows.length
          };
        } else {
          const params = new URLSearchParams(baseParams);

          if (debouncedSelectedBuckets.length === 1) {
            params.set("ladder", debouncedSelectedBuckets[0]);
          }

          params.set("page", String(currentPage));
          params.set("pageSize", String(PAGE_SIZE));
          const query = params.toString();
          projectResponse = await fetchJson<ProjectResponse>(
            `/api/projects${query ? `?${query}` : ""}`,
            { signal: controller.signal }
          );
        }

        if (requestId !== projectRequestIdRef.current || controller.signal.aborted) {
          return;
        }

        setProjectRows(projectResponse.rows);
        setProjectTotal(projectResponse.total);
        setHasLoadedProjects(true);

        const stillExists = projectResponse.rows.some((row) => row.siteNo === selectedSite);
        if (!stillExists) {
          setSelectedSite(projectResponse.rows[0]?.siteNo ?? "");
        }
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
          setProjectLoading(false);
        }
      }
    }

    void loadProjects();

    return () => controller.abort();
  }, [
    currentPage,
    debouncedSearch,
    hasLoadedSummary,
    meta,
    debouncedQueryFilterState,
    debouncedSelectedDay,
    debouncedSelectedBuckets
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    selectedBuckets,
    selectedDay,
    baselineStart,
    baselineEnd,
    selectedDivisions,
    selectedSegments,
    selectedChannels,
    selectedFcNames,
    selectedDiscountTypes
  ]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSelectedTrend() {
      if (!selectedSite) {
        selectedTrendRequestIdRef.current += 1;
        setSelectedTrend([]);
        setSelectedTrendLoading(false);
        return;
      }

      const requestId = ++selectedTrendRequestIdRef.current;
      setSelectedTrendLoading(true);

      try {
        const query = buildFilterQuery(debouncedQueryFilterState).toString();
        const projectTrend = await fetchJson<ProjectTrendPoint[]>(
          `/api/projects/${encodeURIComponent(selectedSite)}/trend${query ? `?${query}` : ""}`,
          { signal: controller.signal }
        );

        if (requestId !== selectedTrendRequestIdRef.current || controller.signal.aborted) {
          return;
        }

        setSelectedTrend(projectTrend);
      } catch (requestError) {
        if (
          requestId !== selectedTrendRequestIdRef.current ||
          controller.signal.aborted ||
          isAbortError(requestError)
        ) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Unknown error");
      } finally {
        if (requestId === selectedTrendRequestIdRef.current && !controller.signal.aborted) {
          setSelectedTrendLoading(false);
        }
      }
    }

    void loadSelectedTrend();

    return () => controller.abort();
  }, [
    selectedSite,
    debouncedQueryFilterState
  ]);

  const selectedTrendChartData = useMemo(
    () => buildSelectedTrendChartData({ meta, selectedSite, selectedTrend }),
    [meta, selectedSite, selectedTrend]
  );
  const postCampaignTrendData = useMemo(
    () => getPostCampaignTrendData(meta, trend),
    [meta, trend]
  );
  const groupedPostCampaignTrendData = useMemo(
    () =>
      getTrendPointsByGranularity({
        trend: postCampaignTrendData,
        granularity: trendGranularity
      }),
    [postCampaignTrendData, trendGranularity]
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
        trend: getFilteredAverageTrend({ meta, trend, trendRange }),
        granularity: trendGranularity
      }),
    [meta, trend, trendRange, trendGranularity]
  );
  const availableDays = useMemo(
    () => postCampaignTrendData.map((point) => point.day),
    [postCampaignTrendData]
  );

  const availableDivisions =
    dashboardDefaultDivisions.length > 0
      ? dashboardDefaultDivisions
      : (meta?.filters?.divisions ?? []);
  const availableSegments = meta?.filters?.segments ?? [];
  const availableChannels = meta?.filters?.channels ?? [];
  const fcNamesByDivision = meta?.filters?.fcNamesByDivision ?? {};
  const availableDiscountTypes = meta?.filters?.discountTypes ?? [];

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

  if (!error && (metaLoading || !hasLoadedSummary)) {
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
        <div className="shell">
          <div className="loadingScreen">
            <strong>กำลังโหลด dashboard...</strong>
            <span>
              {showDashboardSlowNotice
                ? "ข้อมูลชุดนี้ใช้เวลานานกว่าปกติ ระบบยังโหลดต่ออยู่"
                : "กำลังเตรียมข้อมูลล่าสุด"}
            </span>
          </div>
        </div>
      </PriceTrackingShell>
    );
  }

  if (error || !meta || !summary) {
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
        <div className="shell">Cannot load dashboard: {error || "missing data"}</div>
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
  const calcHelpContent = buildCalcHelpContent({
    summary,
    summaryDateRange,
    targetHitSites
  });
  const activeCalcContent = activeCalcHelp ? calcHelpContent[activeCalcHelp] : null;
  const sharedFilterMenu = (
      <SharedFilterMenuBar
      className="topbarSharedFilter"
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
      onBaselineStartChange={setBaselineStart}
      onBaselineEndChange={setBaselineEnd}
      onResetSharedFilters={clearSharedFilters}
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
    >
      <div className="shell" onClick={() => setActiveHint(null)}>
        <section id="overview" className="sectionAnchor">
          <OverviewSection
            dashboardLabel={APP_MENU_LABELS[activeMenu] ?? `Dashboard ติดตามการขึ้นราคา (${dashboardDivision})`}
            baselineStart={meta.config.baselineStart}
            baselineEnd={meta.config.baselineEnd}
            campaignStart={meta.config.campaignStart}
            avgIncreaseLabel={formatNumber(summary.avgIncrease)}
            targetHitShareLabel={`${formatNumber(targetHitShare)}%`}
            summaryDateRange={summaryDateRange}
            dashboardLoading={dashboardLoading}
            showDashboardSlowNotice={showDashboardSlowNotice}
            onOpenCalcHelp={setActiveCalcHelp}
          />
        </section>

        <section id="trends" className="sectionAnchor">
          <TrendChartsSection
            priceLadderMode={priceLadderMode}
            trendGranularity={trendGranularity}
            trendRange={trendRange}
            activeTrendBucketSeries={activeTrendBucketSeries}
            proportionTrendData={proportionTrendData}
            discountDropSeries={discountDropSeries}
            filteredAverageTrend={filteredAverageTrend}
            onSetPriceLadderMode={setPriceLadderMode}
            onSetTrendGranularity={setTrendGranularity}
            onSetTrendRange={setTrendRange}
            onOpenCalcHelp={setActiveCalcHelp}
          />
        </section>

        <section id="project-trend" className="sectionAnchor">
          <ProjectTrendSection
            meta={meta}
            selectedSite={selectedSite}
            selectedTrend={selectedTrend}
            selectedTrendChartData={selectedTrendChartData}
            selectedTrendLoading={selectedTrendLoading}
            showSelectedTrendSlowNotice={showSelectedTrendSlowNotice}
            onOpenCalcHelp={setActiveCalcHelp}
          />
        </section>

        <section id="projects" className="sectionAnchor">
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
            projectLoading={projectLoading}
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
