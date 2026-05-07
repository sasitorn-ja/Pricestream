import { CalendarDays, LoaderCircle, Search, SlidersHorizontal } from "lucide-react";
import { useRef } from "react";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import {
  appShellClass,
  emptyStateClass,
  sectionClass,
  tableBaseClass,
  tableWrapClass
} from "../../../../components/ui/styles";
import { cn } from "../../../../lib/utils";
import { HeaderWithHint } from "../table/HeaderWithHint";
import { bucketLabels, tableColumnHelp, type TableColumnHelpKey } from "../../constants";
import type { CalcHelpKey, ProjectRow } from "../../types";
import {
  formatDiscountDropPoints,
  formatNumber,
  formatPercent
} from "../../utils/format";

type ProjectsTableSectionProps = {
  search: string;
  selectedDay: string;
  selectedBuckets: string[];
  availableDays: string[];
  activeTableFilters: Array<{ label: string; value: string }>;
  projectRows: ProjectRow[];
  projectTotal: number;
  currentPage: number;
  totalPages: number;
  firstProjectIndex: number;
  lastProjectIndex: number;
  paginationItems: Array<number | "ellipsis">;
  selectedSite: string;
  activeHint: TableColumnHelpKey | null;
  projectError: string;
  projectLoading: boolean;
  hasLoadedProjects: boolean;
  showProjectSlowNotice: boolean;
  onOpenCalcHelp: (key: CalcHelpKey) => void;
  onSearchChange: (value: string) => void;
  onSelectDay: (value: string) => void;
  onToggleBucket: (value: string) => void;
  onClearBuckets: () => void;
  onResetTableFilters: () => void;
  onSelectSite: (siteNo: string) => void;
  onToggleHint: (key: TableColumnHelpKey) => void;
  onSetCurrentPage: (page: number) => void;
};

export function ProjectsTableSection({
  search,
  selectedDay,
  selectedBuckets,
  availableDays,
  activeTableFilters,
  projectRows,
  projectTotal,
  currentPage,
  totalPages,
  firstProjectIndex,
  lastProjectIndex,
  paginationItems,
  selectedSite,
  activeHint,
  projectError,
  projectLoading,
  hasLoadedProjects,
  showProjectSlowNotice,
  onOpenCalcHelp,
  onSearchChange,
  onSelectDay,
  onToggleBucket,
  onClearBuckets,
  onResetTableFilters,
  onSelectSite,
  onToggleHint,
  onSetCurrentPage
}: ProjectsTableSectionProps) {
  const selectedDayInputRef = useRef<HTMLInputElement | null>(null);
  const availableDayMin = availableDays[0] ?? "";
  const availableDayMax = availableDays.at(-1) ?? "";
  const hasTableFilters =
    activeTableFilters.length > 0 || selectedBuckets.length > 0 || Boolean(selectedDay) || Boolean(search.trim());

  const openDatePicker = (input: HTMLInputElement | null) => {
    if (!input) {
      return;
    }

    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };

    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  return (
    <div className={appShellClass}>
      <section className={sectionClass}>
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-[var(--foreground)]">Project table</h2>
            <p className="text-sm leading-6 text-[var(--muted-foreground)]">
              คลิกแถวเพื่อดูกราฟรายโครงการ และกรองข้อมูลด้วยวันร่วมกับ ladder ได้
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenCalcHelp("projectTable")}>
            วิธีคำนวณ
          </Button>
        </div>

        <div data-filter-root className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 md:p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--primary-soft)] text-[var(--primary)]">
                <SlidersHorizontal className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--foreground)]">ตัวกรองรายการโครงการ</div>
                <div className="truncate text-xs text-[var(--muted-foreground)]">
                  ค้นหาไซต์ เลือกวัน และจัดกลุ่มตาม ladder
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {projectLoading && hasLoadedProjects ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)]">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  กำลังอัปเดต
                </span>
              ) : null}
              <Button variant="outline" size="sm" onClick={onResetTableFilters} disabled={!hasTableFilters}>
                ล้างตัวกรอง
              </Button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(360px,1fr)_280px] xl:items-end">
            <label className="min-w-0 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                ค้นหา
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <Input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="ค้นหา SITE_NAME, SITE_NO, division, segment"
                  className="pl-11"
                />
              </div>
            </label>

            <label className="min-w-0 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                วันที่
              </span>
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Input
                    ref={selectedDayInputRef}
                    type="date"
                    value={selectedDay}
                    min={availableDayMin}
                    max={availableDayMax}
                    onChange={(event) => onSelectDay(event.target.value)}
                    className="pricing-date-input h-9 rounded-[14px] pr-9 text-[13px]"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1 right-1 h-7 w-7 rounded-lg"
                    aria-label="เลือกวันที่"
                    onClick={() => openDatePicker(selectedDayInputRef.current)}
                  >
                    <CalendarDays className="size-3.5" />
                  </Button>
                </div>
                <Button
                  variant="chip"
                  size="sm"
                  className="h-9 shrink-0 rounded-[14px] px-3"
                  data-active={!selectedDay}
                  onClick={() => onSelectDay("")}
                >
                  ทุกวัน
                </Button>
              </div>
            </label>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                LADDER
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {selectedBuckets.length > 0 ? `${selectedBuckets.length} selected` : "ทั้งหมด"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="chip"
                size="sm"
                className="shrink-0"
                data-active={selectedBuckets.length === 0}
                onClick={onClearBuckets}
              >
                ทั้งหมด
              </Button>
              {bucketLabels.map((bucket) => (
                <Button
                  key={bucket.key}
                  variant="chip"
                  size="sm"
                  className="shrink-0"
                  data-active={selectedBuckets.includes(bucket.key)}
                  onClick={() => onToggleBucket(bucket.key)}
                >
                  {bucket.key}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-[var(--border)] pt-3">
            {activeTableFilters.length > 0 ? (
              <div className="flex min-w-0 flex-wrap gap-2">
                {activeTableFilters.map((filter) => (
                  <span
                    key={`${filter.label}-${filter.value}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--foreground)] shadow-sm md:max-w-[520px]"
                  >
                    <strong className="shrink-0 font-bold">{filter.label}</strong>
                    <span className="truncate">{filter.value}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
                ยังไม่ได้เลือก filter ตาราง
              </div>
            )}
          </div>
        </div>

        <div className="mt-5">
          {projectError ? (
            <div className={cn(emptyStateClass, "min-h-[180px]")}>โหลดรายการโครงการไม่สำเร็จ: {projectError}</div>
          ) : projectLoading && !hasLoadedProjects ? (
            <div className={cn(emptyStateClass, "min-h-[180px]")}>
              {showProjectSlowNotice
                ? "กำลังโหลดรายการโครงการ ข้อมูลชุดนี้อาจใช้เวลานาน"
                : "กำลังโหลดรายการโครงการ..."}
            </div>
          ) : (
            <>
              <div className={cn(tableWrapClass, "shadow-[0_18px_36px_var(--shadow-color)]")}>
                <div className="max-h-[680px] overflow-auto">
                  <table className={tableBaseClass}>
                    <thead className="sticky top-0 z-10 bg-[var(--surface-strong)] text-left shadow-[0_1px_0_var(--border)]">
                      <tr className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                        <th className="px-4 py-4">SITE_NO</th>
                        <th className="min-w-[260px] px-4 py-4">SITE_NAME</th>
                        <th className="px-4 py-4">Division</th>
                        <th className="px-4 py-4">Segment</th>
                        <th className="px-4 py-4">Ladder</th>
                        <th className="px-4 py-4">
                          <HeaderWithHint
                            hintKey="baseline"
                            label="Baseline"
                            hint={tableColumnHelp.baseline}
                            activeHint={activeHint}
                            onToggle={onToggleHint}
                          />
                        </th>
                        <th className="px-4 py-4">
                          <HeaderWithHint
                            hintKey="current"
                            label="Current"
                            hint={tableColumnHelp.current}
                            activeHint={activeHint}
                            onToggle={onToggleHint}
                          />
                        </th>
                        <th className="px-4 py-4">
                          <HeaderWithHint
                            hintKey="increase"
                            label="Increase vs Baseline"
                            hint={tableColumnHelp.increase}
                            activeHint={activeHint}
                            onToggle={onToggleHint}
                          />
                        </th>
                        <th className="px-4 py-4">
                          <HeaderWithHint
                            hintKey="baselineDisc"
                            label="Disc Baseline (%)"
                            hint={tableColumnHelp.baselineDisc}
                            popupAlign="end"
                            activeHint={activeHint}
                            onToggle={onToggleHint}
                          />
                        </th>
                        <th className="px-4 py-4">
                          <HeaderWithHint
                            hintKey="currentDisc"
                            label="Disc Current (%)"
                            hint={tableColumnHelp.currentDisc}
                            popupAlign="end"
                            activeHint={activeHint}
                            onToggle={onToggleHint}
                          />
                        </th>
                        <th className="px-4 py-4">
                          <HeaderWithHint
                            hintKey="discount"
                            label="Discount Drop (%)"
                            hint={tableColumnHelp.discount}
                            popupAlign="end"
                            activeHint={activeHint}
                            onToggle={onToggleHint}
                          />
                        </th>
                        <th className="px-4 py-4">
                          <HeaderWithHint
                            hintKey="latestDay"
                            label={selectedDay ? "Selected day" : "Day"}
                            hint={selectedDay ? "วันที่ที่ใช้กรองในตารางนี้" : tableColumnHelp.latestDay}
                            popupAlign="end"
                            activeHint={activeHint}
                            onToggle={onToggleHint}
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectRows.map((row) => (
                        <tr
                          key={row.siteNo}
                          onClick={() => onSelectSite(row.siteNo)}
                          className={cn(
                            "group cursor-pointer border-t border-[var(--border)] transition hover:bg-[var(--surface-strong)]",
                            selectedSite === row.siteNo && "bg-[var(--primary-soft)]"
                          )}
                        >
                          <td className="px-4 py-4 align-top">
                            <span className="font-semibold text-[var(--foreground)]">{row.siteNo}</span>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="space-y-1">
                              <strong className="block text-sm font-semibold text-[var(--foreground)]">{row.siteName}</strong>
                              <span className="text-xs text-[var(--muted-foreground)]">
                                {row.divisionName} / {row.fcName}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">{row.divisionName || "-"}</td>
                          <td className="px-4 py-4 align-top">{row.segment || "-"}</td>
                          <td className="px-4 py-4 align-top">
                            <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-bold text-[var(--foreground)]">
                              {row.ladder}
                            </span>
                          </td>
                          <td className="px-4 py-4 align-top tabular-nums">{formatNumber(row.baselineNetPrice)}</td>
                          <td className="px-4 py-4 align-top tabular-nums">{formatNumber(row.currentNetPrice)}</td>
                          <td className="px-4 py-4 align-top tabular-nums">{formatNumber(row.increaseAmount)}</td>
                          <td className="px-4 py-4 align-top tabular-nums">{formatPercent(row.baselineDisc)}</td>
                          <td className="px-4 py-4 align-top tabular-nums">{formatPercent(row.currentDisc)}</td>
                          <td className="px-4 py-4 align-top tabular-nums">
                            {formatDiscountDropPoints(row.baselineDisc, row.currentDisc)}
                          </td>
                          <td className="px-4 py-4 align-top tabular-nums">{row.latestDay}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-[var(--muted-foreground)]">
            แสดง {formatNumber(firstProjectIndex)}-{formatNumber(lastProjectIndex)} จาก {formatNumber(projectTotal)} sites
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSetCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            {paginationItems.map((item, index) =>
              item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="px-2 text-sm text-[var(--muted-foreground)]">
                  ...
                </span>
              ) : (
                <Button
                  key={item}
                  variant="chip"
                  size="sm"
                  data-active={currentPage === item}
                  onClick={() => onSetCurrentPage(item)}
                  aria-current={currentPage === item ? "page" : undefined}
                >
                  {formatNumber(item)}
                </Button>
              )
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSetCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
