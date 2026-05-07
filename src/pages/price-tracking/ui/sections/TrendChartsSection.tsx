import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { appShellClass, emptyStateClass, sectionClass } from "../../../../components/ui/styles";
import { cn } from "../../../../lib/utils";
import { renderPercentBarLabel } from "../charts/PercentBarLabel";
import type {
  CalcHelpKey,
  DivisionPriceChartPoint,
  DivisionPriceTrendPoint,
  PriceLadderMode,
  ShareTrendPoint,
  TrendGranularity,
  TrendPoint,
  TrendRange
} from "../../types";
import {
  formatBaht,
  formatDateRangeShort,
  formatNumber,
  formatPercentTick,
  formatShortDate,
  formatThaiDateShort
} from "../../utils/format";

const AVERAGE_INCREASE_Y_AXIS_TICKS = [0, 100, 200, 300, 600, 900, 1200, 1500];
const DAILY_POINT_WIDTH = 68;
const MIN_SCROLLABLE_CHART_WIDTH = 960;
const MIN_RESPONSIVE_CHART_WIDTH = 320;
const CHART_CONTENT_HEIGHT = 320;
const CHART_SIDE_PADDING = 24;
const DIVISION_PRICE_Y_AXIS_DOMAIN: [number, number] = [1500, 3000];
const DIVISION_PRICE_Y_AXIS_TICKS = [1500, 1750, 2000, 2250, 2500, 3000];
const DIVISION_PRICE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#9333ea",
  "#ea580c",
  "#0891b2"
] as const;
const DIVISION_PRICE_LABEL_OFFSETS = [-30, -20, -10, 12, 22, 32] as const;

type AveragePointLabelProps = {
  x?: unknown;
  y?: unknown;
  value?: unknown;
};

type DivisionPricePointLabelProps = AveragePointLabelProps & {
  index?: unknown;
};

type TrendChartsSectionProps = {
  priceLadderMode: PriceLadderMode;
  trendGranularity: TrendGranularity;
  trendRange: TrendRange;
  activeTrendBucketSeries: ReadonlyArray<{ shareKey: string; name: string; fill: string }>;
  proportionTrendData: ShareTrendPoint[];
  discountDropSeries: ReadonlyArray<{ shareKey: string; name: string; fill: string }>;
  filteredAverageTrend: TrendPoint[];
  divisionPriceChartData: DivisionPriceChartPoint[];
  divisionPriceTrendData: DivisionPriceTrendPoint[];
  divisionPriceSeries: string[];
  showDivisionPriceChart: boolean;
  baselineEnd: string;
  chartRangeStart: string;
  chartRangeEnd: string;
  chartRangeMin: string;
  chartRangeMax: string;
  onSetPriceLadderMode: (mode: PriceLadderMode) => void;
  onSetTrendGranularity: (granularity: TrendGranularity) => void;
  onSetTrendRange: (range: TrendRange) => void;
  onSetChartRangeStart: (day: string) => void;
  onSetChartRangeEnd: (day: string) => void;
  onOpenCalcHelp: (key: CalcHelpKey) => void;
};

const tooltipStyle = {
  backgroundColor: "var(--surface-strong)",
  border: "1px solid var(--border)",
  borderRadius: "18px",
  color: "var(--foreground)"
};

type DivisionPriceTrendTableColumn = {
  key: string;
  monthKey: string;
  monthLabel: string;
  weekLabel: string;
};

type DivisionPriceTrendTableRow = {
  divisionName: string;
  values: Record<string, number | null>;
};

function getMonthKey(day: string) {
  return day.slice(0, 7);
}

function getMonthLabel(monthKey: string) {
  const date = new Date(`${monthKey}-01T00:00:00Z`);
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${month}${String(date.getUTCFullYear()).slice(-2)}`;
}

function getMonthWeekKey(day: string) {
  const dayOfMonth = Number(day.slice(8, 10));
  const week = Math.min(5, Math.max(1, Math.ceil(dayOfMonth / 7)));
  return {
    monthKey: getMonthKey(day),
    weekLabel: `W${week}`
  };
}

function buildDivisionPriceTrendTable({
  trend,
  divisions,
  baselineEnd
}: {
  trend: DivisionPriceTrendPoint[];
  divisions: string[];
  baselineEnd: string;
}): {
  baselineMonthLabel: string;
  columns: DivisionPriceTrendTableColumn[];
  rows: DivisionPriceTrendTableRow[];
} {
  const baselineMonthKey = baselineEnd ? getMonthKey(baselineEnd) : getMonthKey(trend[0]?.day ?? "");
  const baselineMonthLabel = baselineMonthKey ? getMonthLabel(baselineMonthKey) : "-";
  const selectedDivisions = divisions.length > 0 ? divisions : [...new Set(trend.map((point) => point.divisionName))];
  const selectedDivisionSet = new Set(selectedDivisions);
  const scopedTrend = trend.filter((point) => !point.fcName && selectedDivisionSet.has(point.divisionName));
  const baselineByDivision = new Map<string, { total: number; sites: number }>();
  const weeklyByDivision = new Map<string, { total: number; sites: number }>();
  const columnByKey = new Map<string, DivisionPriceTrendTableColumn>();

  scopedTrend.forEach((point) => {
    const sites = Number(point.siteCount);

    if (!Number.isFinite(sites) || sites <= 0 || !Number.isFinite(point.avgNetPrice)) {
      return;
    }

    const monthKey = getMonthKey(point.day);
    const { weekLabel } = getMonthWeekKey(point.day);
    const columnKey = `${monthKey}-${weekLabel}`;
    columnByKey.set(columnKey, {
      key: columnKey,
      monthKey,
      monthLabel: getMonthLabel(monthKey),
      weekLabel
    });

    const weeklyKey = `${point.divisionName}__${columnKey}`;
    const currentWeekly = weeklyByDivision.get(weeklyKey) ?? { total: 0, sites: 0 };
    currentWeekly.total += point.avgNetPrice * sites;
    currentWeekly.sites += sites;
    weeklyByDivision.set(weeklyKey, currentWeekly);

    if (monthKey === baselineMonthKey) {
      const currentBaseline = baselineByDivision.get(point.divisionName) ?? { total: 0, sites: 0 };
      currentBaseline.total += point.avgNetPrice * sites;
      currentBaseline.sites += sites;
      baselineByDivision.set(point.divisionName, currentBaseline);
    }
  });

  const columns = [...columnByKey.values()].sort((left, right) => left.key.localeCompare(right.key));
  const rows = selectedDivisions.map((divisionName) => {
    const baseline = baselineByDivision.get(divisionName);
    const baselineValue = baseline && baseline.sites > 0 ? baseline.total / baseline.sites : null;

    return {
      divisionName,
      values: Object.fromEntries(
        columns.map((column) => {
          const weekly = weeklyByDivision.get(`${divisionName}__${column.key}`);
          const weeklyValue = weekly && weekly.sites > 0 ? weekly.total / weekly.sites : null;
          const value = weeklyValue !== null && baselineValue !== null ? weeklyValue - baselineValue : null;
          return [column.key, value === null ? null : Math.round(value)];
        })
      )
    };
  });

  return { baselineMonthLabel, columns, rows };
}

function getTrendCellClass(value: number | null) {
  if (value === null) {
    return "bg-[var(--surface)] text-[var(--muted-foreground)]";
  }

  if (value >= 250) {
    return "bg-emerald-500/55 text-emerald-950";
  }

  if (value >= 150) {
    return "bg-emerald-400/45 text-emerald-950";
  }

  if (value >= 80) {
    return "bg-cyan-300/45 text-cyan-950";
  }

  if (value >= 0) {
    return "bg-yellow-200/50 text-yellow-950";
  }

  if (value <= -100) {
    return "bg-rose-300/55 text-rose-950";
  }

  return "bg-slate-200/45 text-slate-900";
}

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
  ariaLabel
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex shrink-0 gap-1 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-1"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          size="sm"
          aria-pressed={value === option.value}
          className="min-w-16 rounded-[14px] px-3 text-xs shadow-none hover:translate-y-0 aria-pressed:bg-[var(--primary)] aria-pressed:text-[var(--primary-foreground)] aria-pressed:hover:bg-[var(--primary-strong)]"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function ChartLegend({
  series
}: {
  series: ReadonlyArray<{ shareKey: string; name: string; fill: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)]">
      {series.map((item) => (
        <span key={item.shareKey} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5">
          <i className="size-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
          {item.name}
        </span>
      ))}
    </div>
  );
}

function ChartEmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={cn(emptyStateClass, "h-full min-h-0")}>
      <strong className="text-lg text-[var(--foreground)]">{title}</strong>
      <span className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">
        {description}
      </span>
    </div>
  );
}

export function TrendChartsSection({
  priceLadderMode,
  trendGranularity,
  trendRange,
  activeTrendBucketSeries,
  proportionTrendData,
  discountDropSeries,
  filteredAverageTrend,
  divisionPriceChartData,
  divisionPriceTrendData,
  divisionPriceSeries,
  showDivisionPriceChart,
  baselineEnd,
  chartRangeStart,
  chartRangeEnd,
  chartRangeMin,
  chartRangeMax,
  onSetPriceLadderMode,
  onSetTrendGranularity,
  onSetTrendRange,
  onSetChartRangeStart,
  onSetChartRangeEnd,
  onOpenCalcHelp
}: TrendChartsSectionProps) {
  const isDailyGranularity = trendGranularity === "daily";
  const shouldShowEveryAverageTick = isDailyGranularity || filteredAverageTrend.length <= 14;
  const shouldShowEveryProportionTick = isDailyGranularity || proportionTrendData.length <= 14;
  const averageChartWidth = isDailyGranularity
    ? Math.max(MIN_SCROLLABLE_CHART_WIDTH, filteredAverageTrend.length * DAILY_POINT_WIDTH)
    : null;
  const proportionChartWidth = isDailyGranularity
    ? Math.max(MIN_SCROLLABLE_CHART_WIDTH, proportionTrendData.length * DAILY_POINT_WIDTH)
    : null;
  const divisionPriceChartWidth = isDailyGranularity
    ? Math.max(MIN_SCROLLABLE_CHART_WIDTH, divisionPriceChartData.length * DAILY_POINT_WIDTH)
    : null;
  const divisionPriceYAxisDomain = DIVISION_PRICE_Y_AXIS_DOMAIN;
  const divisionPriceYAxisTicks = DIVISION_PRICE_Y_AXIS_TICKS;
  const shouldShowEveryDivisionPriceTick = isDailyGranularity || divisionPriceChartData.length <= 14;
  const shouldRenderAveragePointLabels = filteredAverageTrend.length <= 18;
  const shouldRenderDivisionPricePointLabels =
    divisionPriceChartData.length <= 14 && divisionPriceSeries.length <= 3;
  const divisionPriceTrendTable = buildDivisionPriceTrendTable({
    trend: divisionPriceTrendData,
    divisions: divisionPriceSeries,
    baselineEnd
  });
  const divisionPriceTrendTableMonthGroups = [...new Set(divisionPriceTrendTable.columns.map((column) => column.monthKey))]
    .map((monthKey) => {
      const columns = divisionPriceTrendTable.columns.filter((column) => column.monthKey === monthKey);
      return {
        monthKey,
        monthLabel: columns[0]?.monthLabel ?? monthKey,
        colSpan: columns.length
      };
    });
  const divisionPriceLegendSeries = divisionPriceSeries.map((divisionName, index) => ({
    shareKey: divisionName,
    name: divisionName,
    fill: DIVISION_PRICE_COLORS[index % DIVISION_PRICE_COLORS.length]
  }));
  const formatTrendXAxis = (day: string, periodEnd?: string) =>
    trendGranularity === "weekly" ? formatDateRangeShort(day, periodEnd) : formatShortDate(day);

  const formatTrendTooltipLabel = (point: { day: string; periodEnd?: string }, siteCount?: number) =>
    `${formatDateRangeShort(point.day, point.periodEnd)}${
      typeof siteCount === "number" ? ` • ${formatNumber(siteCount)} โครงการ` : ""
    }`;

  const formatTrendTick = (
    tickDay: string | number,
    points: Array<{ day: string; periodEnd?: string }>
  ) => {
    const point = points.find((item) => item.day === String(tickDay));
    return point ? formatTrendXAxis(point.day, point.periodEnd) : formatShortDate(String(tickDay));
  };

  const renderAveragePointLabel = ({ x, y, value }: AveragePointLabelProps) => {
    if (typeof x !== "number" || typeof y !== "number" || value === null || value === undefined) {
      return null;
    }

    return (
      <text
        x={x}
        y={y - 12}
        fill="#fb7185"
        fontSize={12}
        fontWeight={700}
        textAnchor="middle"
      >
        {formatNumber(Number(value))}
      </text>
    );
  };

  const renderDivisionPricePointLabel =
    (seriesIndex: number, color: string) =>
    ({ x, y, value }: DivisionPricePointLabelProps) => {
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        value === null ||
        value === undefined ||
        !Number.isFinite(Number(value))
      ) {
        return null;
      }

      const labelOffset = DIVISION_PRICE_LABEL_OFFSETS[seriesIndex % DIVISION_PRICE_LABEL_OFFSETS.length];

      return (
        <text
          x={x}
          y={y + labelOffset}
          fill={color}
          fontSize={10}
          fontWeight={700}
          paintOrder="stroke"
          stroke="var(--surface)"
          strokeWidth={3}
          textAnchor="middle"
        >
          {formatNumber(Number(value))}
        </text>
      );
    };
  const renderDivisionPriceTooltip = ({
    payload
  }: {
    payload?: ReadonlyArray<{ payload?: DivisionPriceChartPoint }>;
  }) => {
    const point = payload?.[0]?.payload;

    if (!point) {
      return null;
    }

    return (
      <div
        className="min-w-[260px] rounded-[18px] border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-sm shadow-[0_18px_40px_var(--shadow-color)]"
        style={{ color: "var(--foreground)" }}
      >
        <div className="mb-2 font-semibold">{formatTrendTooltipLabel(point)}</div>
        <div className="space-y-1.5">
          {divisionPriceSeries.map((divisionName, index) => {
            const color = DIVISION_PRICE_COLORS[index % DIVISION_PRICE_COLORS.length];
            const value = Number(point[divisionName]);
            const siteCount = Number(point[`${divisionName}SiteCount`] ?? 0);
            const hasValue = Number.isFinite(value) && siteCount > 0;

            return (
              <div key={divisionName} className="flex items-center gap-2" style={{ color }}>
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span>
                  {divisionName} :{" "}
                  {hasValue
                    ? `${formatBaht(value)} • ${formatNumber(siteCount)} site`
                    : "ไม่มีข้อมูล"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const chartBoxClass = "h-[360px] rounded-[24px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 md:p-4";
  const getInitialChartDimension = (width: number | null) => ({
    width: width ?? MIN_SCROLLABLE_CHART_WIDTH,
    height: CHART_CONTENT_HEIGHT
  });
  const renderRangeControls = () => (
    <>
      <select
        value={trendRange}
        onChange={(event) => onSetTrendRange(event.target.value as TrendRange)}
        className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <option value="all">ทั้งหมด</option>
        <option value="post25">หลัง Baseline</option>
        <option value="last14">14 วันล่าสุด</option>
        <option value="last7">7 วันล่าสุด</option>
        <option value="custom">กำหนดเอง</option>
      </select>
      {trendRange === "custom" ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-[22px] border border-[var(--border)] bg-[var(--surface-muted)] p-1.5">
          <label className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              เริ่ม
            </span>
            <Input
              type="date"
              value={chartRangeStart}
              min={chartRangeMin || undefined}
              max={chartRangeEnd || chartRangeMax || undefined}
              onChange={(event) => onSetChartRangeStart(event.target.value)}
              className="h-8 w-[136px] rounded-xl text-[13px]"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              ถึง
            </span>
            <Input
              type="date"
              value={chartRangeEnd}
              min={chartRangeStart || chartRangeMin || undefined}
              max={chartRangeMax || undefined}
              onChange={(event) => onSetChartRangeEnd(event.target.value)}
              className="h-8 w-[136px] rounded-xl text-[13px]"
            />
          </label>
        </div>
      ) : null}
    </>
  );

  return (
    <div className={appShellClass}>
      <section className={sectionClass}>
        <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0 space-y-2">
            <h2 className="text-2xl font-semibold text-[var(--foreground)]">ค่าเฉลี่ยการขึ้นราคาเทียบ Baseline รายวัน</h2>
            <p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
              เส้นนี้ยังคงช่วยดู momentum ว่าค่าเฉลี่ยการขึ้นราคาเคลื่อนไปทางไหน ภายใต้ฟิลเตอร์เดียวกับกราฟสัดส่วนด้านล่าง
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-start gap-3 xl:justify-end">
            <ToggleGroup
              value={trendGranularity}
              onChange={onSetTrendGranularity}
              ariaLabel="ระดับช่วงเวลาของกราฟ"
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" }
              ]}
            />
            {renderRangeControls()}
            <Button variant="outline" size="sm" onClick={() => onOpenCalcHelp("averageTrend")}>
              วิธีคำนวณ
            </Button>
          </div>
        </div>

        <div className={chartBoxClass}>
          {filteredAverageTrend.length === 0 ? (
            <ChartEmptyState
              title="ยังไม่มีข้อมูลค่าเฉลี่ยการขึ้นราคา"
              description="ลองตรวจสอบช่วง Baseline หรือปรับตัวกรอง Division / FC, Segment, Channel และ Discount type"
            />
          ) : (
            <div className={cn("h-full min-w-0", isDailyGranularity && "overflow-x-auto")}>
              <div className="h-full min-w-0" style={averageChartWidth ? { width: `${averageChartWidth}px` } : undefined}>
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={MIN_RESPONSIVE_CHART_WIDTH}
                  minHeight={280}
                  initialDimension={getInitialChartDimension(averageChartWidth)}
                >
                <LineChart
                  data={filteredAverageTrend}
                  margin={{
                    top: 36,
                    right: CHART_SIDE_PADDING,
                    left: CHART_SIDE_PADDING / 2,
                    bottom: isDailyGranularity ? 12 : 0
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(value) => formatTrendTick(value, filteredAverageTrend)}
                    stroke="var(--chart-label)"
                    interval={shouldShowEveryAverageTick ? 0 : "preserveStartEnd"}
                    padding={{ left: CHART_SIDE_PADDING / 2, right: CHART_SIDE_PADDING }}
                    minTickGap={shouldShowEveryAverageTick ? 6 : 12}
                    height={36}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    domain={[0, 1500]}
                    ticks={AVERAGE_INCREASE_Y_AXIS_TICKS}
                    interval={0}
                    stroke="var(--chart-label)"
                    width={58}
                    tick={{ fontSize: 13 }}
                    tickFormatter={formatNumber}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(_, payload) => {
                      const point = payload?.[0]?.payload as TrendPoint | undefined;
                      return point ? formatTrendTooltipLabel(point) : "";
                    }}
                    formatter={(value, name) => [formatBaht(Number(value ?? 0)), String(name)]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avgIncrease"
                    stroke="#fb7185"
                    strokeWidth={3}
                    dot
                    label={shouldRenderAveragePointLabels ? renderAveragePointLabel : undefined}
                    name="Average increase"
                  />
                </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </section>

      {showDivisionPriceChart ? (
        <section className={sectionClass}>
          <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="min-w-0 space-y-2">
              <h2 className="text-2xl font-semibold text-[var(--foreground)]">
                ราคาขายเฉลี่ยตาม Division ราย{isDailyGranularity ? "วัน" : "Week"}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
                กราฟนี้ใช้ช่วงเวลาเดียวกับกราฟอื่น เพื่อเปรียบเทียบราคาขายเฉลี่ยของแต่ละ Division แบบเส้นแยกกัน
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-start gap-3 xl:justify-end">
              <ToggleGroup
                value={trendGranularity}
                onChange={onSetTrendGranularity}
                ariaLabel="ระดับช่วงเวลาของกราฟราคาขายตาม Division"
                options={[
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" }
                ]}
              />
              {renderRangeControls()}
            </div>
          </div>

          <div className={chartBoxClass}>
            {divisionPriceChartData.length === 0 || divisionPriceSeries.length === 0 ? (
              <ChartEmptyState
                title="ยังไม่มีข้อมูลราคาขายเฉลี่ยตาม Division"
                description="ข้อมูลส่วนนี้จะแสดงเมื่อมีรายการขายใน Division ที่ตรงกับตัวกรองปัจจุบัน"
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <ChartLegend series={divisionPriceLegendSeries} />
                <div className={cn("min-h-0 flex-1 min-w-0", isDailyGranularity && "overflow-x-auto")}>
                  <div className="h-full min-w-0" style={divisionPriceChartWidth ? { width: `${divisionPriceChartWidth}px` } : undefined}>
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={MIN_RESPONSIVE_CHART_WIDTH}
                      minHeight={250}
                      initialDimension={getInitialChartDimension(divisionPriceChartWidth)}
                    >
                    <LineChart
                      data={divisionPriceChartData}
                      margin={{
                        top: 36,
                        right: CHART_SIDE_PADDING,
                        left: CHART_SIDE_PADDING / 2,
                        bottom: 0
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis
                        dataKey="day"
                        tickFormatter={(value) => formatTrendTick(value, divisionPriceChartData)}
                        stroke="var(--chart-label)"
                        interval={shouldShowEveryDivisionPriceTick ? 0 : "preserveStartEnd"}
                        padding={{ left: CHART_SIDE_PADDING / 2, right: CHART_SIDE_PADDING }}
                        minTickGap={shouldShowEveryDivisionPriceTick ? 6 : 12}
                        height={36}
                        tickMargin={8}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        stroke="var(--chart-label)"
                        width={78}
                        tick={{ fontSize: 13 }}
                        tickFormatter={formatNumber}
                        allowDecimals={false}
                        domain={divisionPriceYAxisDomain}
                        ticks={divisionPriceYAxisTicks}
                      />
                      <Tooltip content={renderDivisionPriceTooltip} />
                      {divisionPriceSeries.map((divisionName, index) => {
                        const color = DIVISION_PRICE_COLORS[index % DIVISION_PRICE_COLORS.length];

                        return (
                          <Line
                            key={divisionName}
                            type="monotone"
                            dataKey={divisionName}
                            stroke={color}
                            strokeWidth={3}
                            dot
                            connectNulls
                            label={
                              shouldRenderDivisionPricePointLabels
                                ? renderDivisionPricePointLabel(index, color)
                                : undefined
                            }
                            name={divisionName}
                          />
                        );
                      })}
                    </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>

          {divisionPriceTrendTable.columns.length > 0 && divisionPriceTrendTable.rows.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                <div>
                  <h3 className="text-base font-semibold text-[var(--foreground)]">
                    Net Price trend เทียบกับฐานราคาในเดือน {divisionPriceTrendTable.baselineMonthLabel}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                    Heatmap ส่วนต่างราคาเฉลี่ยรายสัปดาห์เทียบเดือนฐาน แยกตาม Division
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onOpenCalcHelp("divisionPriceTrendTable")}>
                  วิธีคำนวณ
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-[var(--muted-foreground)]">
                      <th className="sticky left-0 z-20 border-b border-r border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left align-bottom font-semibold">
                        Area
                      </th>
                      {divisionPriceTrendTableMonthGroups.map((group) => (
                        <th
                          key={group.monthKey}
                          colSpan={group.colSpan}
                          className="border-b border-r border-[var(--border)] px-4 py-2 text-center text-base font-semibold text-[var(--foreground)]"
                        >
                          {group.monthLabel}
                        </th>
                      ))}
                    </tr>
                    <tr className="text-xs text-[var(--muted-foreground)]">
                      <th className="sticky left-0 z-20 border-b border-r border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-left font-semibold">
                        Division
                      </th>
                      {divisionPriceTrendTable.columns.map((column) => (
                        <th
                          key={column.key}
                          className="min-w-20 border-b border-r border-[var(--border)] px-3 py-2 text-center font-semibold"
                        >
                          {column.weekLabel}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {divisionPriceTrendTable.rows.map((row) => (
                      <tr key={row.divisionName}>
                        <th className="sticky left-0 z-10 border-b border-r border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-left font-semibold text-[var(--foreground)]">
                          {row.divisionName}
                        </th>
                        {divisionPriceTrendTable.columns.map((column) => {
                          const value = row.values[column.key] ?? null;

                          return (
                            <td
                              key={column.key}
                              className={cn(
                                "border-b border-r border-[var(--border)] px-3 py-2 text-center font-semibold",
                                getTrendCellClass(value)
                              )}
                            >
                              {value === null ? "-" : formatNumber(value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={sectionClass}>
        <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0 space-y-2">
            <h2 className="text-2xl font-semibold text-[var(--foreground)]">% สัดส่วนโครงการตามระดับการขึ้นราคา</h2>
            <p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
              มุมมองนี้แสดงเป็น 100% stacked bar เพื่อให้เห็นสัดส่วนแต่ละ ladder ต่อวัน หลังช่วง Baseline และเปลี่ยนตามฟิลเตอร์ที่เลือก
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-start gap-3 xl:justify-end">
            <ToggleGroup
              value={trendGranularity}
              onChange={onSetTrendGranularity}
              ariaLabel="ระดับช่วงเวลาของกราฟสัดส่วน"
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" }
              ]}
            />
            <ToggleGroup
              value={priceLadderMode}
              onChange={onSetPriceLadderMode}
              ariaLabel="รูปแบบการแสดงช่วง 300 บาทขึ้นไป"
              options={[
                { value: "summary", label: "สรุป 300+" },
                { value: "detail", label: "แยก 300+" }
              ]}
            />
            {renderRangeControls()}
            <Button variant="outline" size="sm" onClick={() => onOpenCalcHelp("proportionChart")}>
              วิธีคำนวณ
            </Button>
          </div>
        </div>

        <div className={chartBoxClass}>
          {proportionTrendData.length === 0 ? (
            <ChartEmptyState
              title="ยังไม่มีข้อมูลสัดส่วนโครงการ"
              description="ลองขยายช่วงวันที่หรือรีเซ็ตตัวกรอง หาก backend มีข้อมูล ระบบจะแสดงกราฟทันทีหลังโหลดเสร็จ"
            />
          ) : (
            <div className={cn("h-full min-w-0", isDailyGranularity && "overflow-x-auto")}>
              <div className="h-full" style={proportionChartWidth ? { width: `${proportionChartWidth}px` } : undefined}>
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={MIN_RESPONSIVE_CHART_WIDTH}
                  minHeight={280}
                  initialDimension={getInitialChartDimension(proportionChartWidth)}
                >
                <BarChart
                  data={proportionTrendData}
                  barCategoryGap="10%"
                  margin={{
                    top: 0,
                    right: CHART_SIDE_PADDING,
                    left: CHART_SIDE_PADDING / 2,
                    bottom: isDailyGranularity ? 12 : 0
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(value) => formatTrendTick(value, proportionTrendData)}
                    stroke="var(--chart-label)"
                    interval={shouldShowEveryProportionTick ? 0 : "preserveStartEnd"}
                    padding={{ left: CHART_SIDE_PADDING / 2, right: CHART_SIDE_PADDING }}
                    minTickGap={shouldShowEveryProportionTick ? 6 : 12}
                    height={36}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis domain={[0, 100]} tickFormatter={formatPercentTick} stroke="var(--chart-label)" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(label, payload) => {
                      const point = payload?.[0]?.payload as ShareTrendPoint | undefined;
                      return point
                        ? formatTrendTooltipLabel(point, point.siteCount)
                        : formatThaiDateShort(String(label));
                    }}
                    formatter={(value, name, item) => {
                      const countKey = String(item.dataKey).replace("Share", "") as keyof ShareTrendPoint;
                      const point = item.payload as ShareTrendPoint;
                      return [
                        `${formatNumber(Number(value))}% (${formatNumber(Number(point[countKey] ?? 0))} โครงการ)`,
                        String(name)
                      ];
                    }}
                  />
                  <Legend content={() => <ChartLegend series={activeTrendBucketSeries} />} />
                  {activeTrendBucketSeries.map((series) => (
                    <Bar
                      key={series.shareKey}
                      dataKey={series.shareKey}
                      stackId="share"
                      fill={series.fill}
                      name={series.name}
                    >
                      <LabelList dataKey={series.shareKey} content={renderPercentBarLabel} />
                    </Bar>
                  ))}
                </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0 space-y-2">
            <h2 className="text-2xl font-semibold text-[var(--foreground)]">% สัดส่วน Disc ที่ลดลง</h2>
            <p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
              แสดงสัดส่วนโครงการที่ Discount ลดลงจาก Baseline กี่ % แล้วแบ่งช่วงลดลงทีละ 3%; สีเทาคือโครงการที่ไม่มีข้อมูลก่อนปรับให้เทียบ
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-start gap-3 xl:justify-end">
            <ToggleGroup
              value={trendGranularity}
              onChange={onSetTrendGranularity}
              ariaLabel="ระดับช่วงเวลาของกราฟสัดส่วน Disc ที่ลดลง"
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" }
              ]}
            />
            <ToggleGroup
              value={priceLadderMode}
              onChange={onSetPriceLadderMode}
              ariaLabel="รูปแบบการแสดงช่วง 300 บาทขึ้นไปของกราฟสัดส่วน Disc ที่ลดลง"
              options={[
                { value: "summary", label: "สรุป 300+" },
                { value: "detail", label: "แยก 300+" }
              ]}
            />
            {renderRangeControls()}
            <Button variant="outline" size="sm" onClick={() => onOpenCalcHelp("discountDropChart")}>
              วิธีคำนวณ
            </Button>
          </div>
        </div>

        <div className={chartBoxClass}>
          {proportionTrendData.length === 0 ? (
            <ChartEmptyState
              title="ยังไม่มีข้อมูลสัดส่วน Disc ที่ลดลง"
              description="ลองขยายช่วงวันที่หรือรีเซ็ตตัวกรอง เพื่อให้มีข้อมูลหลัง Baseline สำหรับคำนวณสัดส่วน"
            />
          ) : (
            <div className={cn("h-full min-w-0", isDailyGranularity && "overflow-x-auto")}>
              <div className="h-full" style={proportionChartWidth ? { width: `${proportionChartWidth}px` } : undefined}>
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={MIN_RESPONSIVE_CHART_WIDTH}
                  minHeight={280}
                  initialDimension={getInitialChartDimension(proportionChartWidth)}
                >
                <BarChart
                  data={proportionTrendData}
                  barCategoryGap="10%"
                  margin={{
                    top: 0,
                    right: CHART_SIDE_PADDING,
                    left: CHART_SIDE_PADDING / 2,
                    bottom: isDailyGranularity ? 12 : 0
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(value) => formatTrendTick(value, proportionTrendData)}
                    stroke="var(--chart-label)"
                    interval={shouldShowEveryProportionTick ? 0 : "preserveStartEnd"}
                    padding={{ left: CHART_SIDE_PADDING / 2, right: CHART_SIDE_PADDING }}
                    minTickGap={shouldShowEveryProportionTick ? 6 : 12}
                    height={36}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis domain={[0, 100]} tickFormatter={formatPercentTick} stroke="var(--chart-label)" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(label, payload) => {
                      const point = payload?.[0]?.payload as ShareTrendPoint | undefined;
                      return point
                        ? formatTrendTooltipLabel(point, point.siteCount)
                        : formatThaiDateShort(String(label));
                    }}
                    formatter={(value, name, item) => {
                      const countKey = String(item.dataKey).replace("Share", "") as keyof ShareTrendPoint;
                      const point = item.payload as ShareTrendPoint;
                      return [
                        `${formatNumber(Number(value))}% (${formatNumber(Number(point[countKey] ?? 0))} โครงการ)`,
                        String(name)
                      ];
                    }}
                  />
                  <Legend content={() => <ChartLegend series={discountDropSeries} />} />
                  {discountDropSeries.map((series) => (
                    <Bar
                      key={series.shareKey}
                      dataKey={series.shareKey}
                      stackId="share"
                      fill={series.fill}
                      name={series.name}
                    >
                      <LabelList dataKey={series.shareKey} content={renderPercentBarLabel} />
                    </Bar>
                  ))}
                </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
