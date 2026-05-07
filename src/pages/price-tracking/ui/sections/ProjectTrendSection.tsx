import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Button } from "../../../../components/ui/button";
import { appShellClass, emptyStateClass, sectionClass } from "../../../../components/ui/styles";
import { bucketColors } from "../../constants";
import type {
  CalcHelpKey,
  MetaResponse,
  ProjectTrendChartPoint,
  ProjectTrendPoint
} from "../../types";
import { formatBaht, formatNumber, formatShortDate } from "../../utils/format";

type ProjectTrendSectionProps = {
  meta: MetaResponse | null;
  selectedSite: string;
  selectedTrend: ProjectTrendPoint[];
  selectedTrendChartData: ProjectTrendChartPoint[];
  selectedTrendLoading: boolean;
  showSelectedTrendSlowNotice: boolean;
  onOpenCalcHelp: (key: CalcHelpKey) => void;
};

const tooltipStyle = {
  backgroundColor: "var(--surface-strong)",
  border: "1px solid var(--border)",
  borderRadius: "18px",
  color: "var(--foreground)"
};

type ProjectTrendPointLabelProps = {
  x?: unknown;
  y?: unknown;
  value?: unknown;
};

function renderProjectTrendPointLabel(color: string, offsetY = -12) {
  return ({ x, y, value }: ProjectTrendPointLabelProps) => {
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value)) ||
      Number(value) <= 0
    ) {
      return null;
    }

    return (
      <text
        x={x}
        y={y + offsetY}
        fill={color}
        fontSize={11}
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
}

const renderPricePointLabel = renderProjectTrendPointLabel("var(--price-line)", -12);
const renderIncreasePointLabel = renderProjectTrendPointLabel(bucketColors.top, -12);

export function ProjectTrendSection({
  meta,
  selectedSite,
  selectedTrend,
  selectedTrendChartData,
  selectedTrendLoading,
  showSelectedTrendSlowNotice,
  onOpenCalcHelp
}: ProjectTrendSectionProps) {
  return (
    <div className={appShellClass}>
      <section className={sectionClass}>
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-[var(--foreground)]">แนวโน้มรายโครงการ</h2>
            <p className="text-sm text-[var(--foreground)]">
              {selectedTrend[0]?.siteName ?? "เลือกไซต์จากตารางด้านล่าง"} {selectedSite ? `(${selectedSite})` : ""}
            </p>
            <p className="text-sm leading-6 text-[var(--muted-foreground)]">
              {meta
                ? `${meta.config.baselineStart} ถึง ${meta.config.baselineEnd} = ช่วง Baseline; หลัง ${meta.config.baselineEnd} = ช่วงติดตามผล`
                : "ช่วง Baseline = ช่วงราคาอ้างอิง; หลัง Baseline = ช่วงติดตามผล"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenCalcHelp("projectTrend")}>
            วิธีคำนวณ
          </Button>
        </div>

        <div className="h-[380px] rounded-[24px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 md:p-4">
          {!selectedSite ? (
            <div className={emptyStateClass}>
              <strong className="text-lg text-[var(--foreground)]">เลือกไซต์จากตารางด้านล่าง</strong>
              <span className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">
                เมื่อเลือกโครงการแล้ว กราฟแนวโน้มรายโครงการจะแสดงที่นี่
              </span>
            </div>
          ) : selectedTrendLoading ? (
            <div className={emptyStateClass}>
              <strong className="text-lg text-[var(--foreground)]">กำลังโหลดแนวโน้มรายโครงการ...</strong>
              <span className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">
                {showSelectedTrendSlowNotice
                  ? "ข้อมูลชุดนี้ใช้เวลานานกว่าปกติ ระบบยังโหลดต่ออยู่"
                  : "กำลังอัปเดตกราฟตามตัวกรองล่าสุด"}
              </span>
            </div>
          ) : selectedTrendChartData.length === 0 ? (
            <div className={emptyStateClass}>
              <strong className="text-lg text-[var(--foreground)]">ยังไม่มีข้อมูลแนวโน้มของโครงการนี้</strong>
              <span className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">
                ลองปรับช่วงเวลา หรือเลือกไซต์อื่นเพื่อดูข้อมูลเพิ่มเติม
              </span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
              <LineChart data={selectedTrendChartData} margin={{ top: 36, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatShortDate}
                  stroke="var(--chart-label)"
                  tick={{ fontSize: 12 }}
                  tickMargin={8}
                />
                <YAxis
                  yAxisId="price"
                  stroke="var(--price-line)"
                  tick={{ fill: "var(--price-line)", fontWeight: 700 }}
                  tickFormatter={formatNumber}
                  width={84}
                  tickCount={5}
                  allowDecimals={false}
                  label={{
                    value: "ราคาขาย",
                    angle: -90,
                    position: "insideLeft",
                    fill: "var(--price-line)",
                    fontSize: 12,
                    fontWeight: 700
                  }}
                />
                <YAxis
                  yAxisId="increase"
                  orientation="right"
                  stroke={bucketColors.top}
                  tick={{ fill: bucketColors.top, fontWeight: 700 }}
                  tickFormatter={formatNumber}
                  width={84}
                  tickCount={5}
                  allowDecimals={false}
                  label={{
                    value: "ขึ้นราคา",
                    angle: 90,
                    position: "insideRight",
                    fill: bucketColors.top,
                    fontSize: 12,
                    fontWeight: 700
                  }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name, item) => {
                    const point = item.payload as ProjectTrendChartPoint;

                    if (!point.hasRecord) {
                      return [
                        name === "ราคาขาย (บาท)"
                          ? "0 บาท (ไม่มีข้อมูลขาย)"
                          : "ไม่มีข้อมูลขาย (นับเป็น 0)",
                        String(name)
                      ];
                    }

                    if (point.isBaselinePeriod && name === "ขึ้นราคา (บาท)") {
                      return ["ช่วง Baseline ยังไม่คำนวณการขึ้นราคา", String(name)];
                    }

                    if (value === null || value === undefined) {
                      return ["ไม่มีข้อมูล", String(name)];
                    }

                    return [formatBaht(Number(value)), String(name)];
                  }}
                />
                <Legend />
                {meta ? (
                  <ReferenceLine
                    x={meta.config.baselineEnd}
                    yAxisId="price"
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="6 5"
                    label={{
                      value: formatShortDate(meta.config.baselineEnd),
                      position: "insideTop",
                      offset: 8,
                      fill: "#ef4444",
                      fontSize: 13,
                      fontWeight: 700
                    }}
                  />
                ) : null}
                <Line
                  type="monotone"
                  yAxisId="price"
                  dataKey="postNetPrice"
                  stroke="var(--price-line)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={false}
                  label={renderPricePointLabel}
                  name="ราคาขาย (บาท)"
                />
                <Line
                  type="monotone"
                  yAxisId="increase"
                  dataKey="increaseAmount"
                  stroke={bucketColors.top}
                  strokeWidth={3}
                  dot
                  label={renderIncreasePointLabel}
                  name="ขึ้นราคา (บาท)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}
