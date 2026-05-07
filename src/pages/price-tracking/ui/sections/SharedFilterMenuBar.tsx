import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { cn } from "../../../../lib/utils";
import { DivisionFcFilter } from "../filters/DivisionFcFilter";
import { MultiSelectDropdown } from "../filters/MultiSelectDropdown";
import { summarizeMultiSelect } from "../../utils/filters";

type SharedFilterMenuBarProps = {
  className?: string;
  selectedBaselineStart: string;
  selectedBaselineEnd: string;
  availableDivisions: string[];
  availableSegments: string[];
  availableChannels: string[];
  availableDiscountTypes: string[];
  fcNamesByDivision: Record<string, string[]>;
  selectedDivisions: string[];
  selectedSegments: string[];
  selectedChannels: string[];
  selectedFcNames: string[];
  selectedDiscountTypes: string[];
  onOpenBaselineHelp: () => void;
  onApplyBaseline: (start: string, end: string) => void;
  onResetSharedFilters: () => void;
  onSelectDivision: (value: string) => void;
  onToggleDivision: (value: string) => void;
  onClearDivisions: () => void;
  onToggleFcName: (division: string, value: string) => void;
  onClearFcNames: () => void;
  onToggleSegment: (value: string) => void;
  onClearSegments: () => void;
  onToggleChannel: (value: string) => void;
  onClearChannels: () => void;
  onToggleDiscountType: (value: string) => void;
  onClearDiscountTypes: () => void;
};

export function SharedFilterMenuBar({
  className,
  selectedBaselineStart,
  selectedBaselineEnd,
  availableDivisions,
  availableSegments,
  availableChannels,
  availableDiscountTypes,
  fcNamesByDivision,
  selectedDivisions,
  selectedSegments,
  selectedChannels,
  selectedFcNames,
  selectedDiscountTypes,
  onOpenBaselineHelp,
  onApplyBaseline,
  onResetSharedFilters,
  onSelectDivision,
  onToggleDivision,
  onClearDivisions,
  onToggleFcName,
  onClearFcNames,
  onToggleSegment,
  onClearSegments,
  onToggleChannel,
  onClearChannels,
  onToggleDiscountType,
  onClearDiscountTypes
}: SharedFilterMenuBarProps) {
  const baselineStartInputRef = useRef<HTMLInputElement | null>(null);
  const baselineEndInputRef = useRef<HTMLInputElement | null>(null);
  const [draftBaselineStart, setDraftBaselineStart] = useState(selectedBaselineStart);
  const [draftBaselineEnd, setDraftBaselineEnd] = useState(selectedBaselineEnd);
  const hasSelectedEveryDivision =
    availableDivisions.length > 0 &&
    selectedDivisions.length === availableDivisions.length &&
    availableDivisions.every((division) => selectedDivisions.includes(division));
  const shouldTreatDivisionsAsAll =
    selectedDivisions.length === 0 || hasSelectedEveryDivision;
  const divisionSummary =
    selectedFcNames.length > 0
      ? summarizeMultiSelect(
          shouldTreatDivisionsAsAll
            ? selectedFcNames
            : [...selectedDivisions, ...selectedFcNames],
          "ไม่เลือก FC"
        )
      : shouldTreatDivisionsAsAll
        ? "ทั้งหมด"
        : summarizeMultiSelect(selectedDivisions, "ทั้งหมด");
  const hasBaselineDraftChanges =
    draftBaselineStart !== selectedBaselineStart || draftBaselineEnd !== selectedBaselineEnd;
  const canApplyBaseline =
    hasBaselineDraftChanges &&
    Boolean(draftBaselineStart) &&
    Boolean(draftBaselineEnd) &&
    draftBaselineStart <= draftBaselineEnd;

  useEffect(() => {
    setDraftBaselineStart(selectedBaselineStart);
    setDraftBaselineEnd(selectedBaselineEnd);
  }, [selectedBaselineStart, selectedBaselineEnd]);

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
    <div
      data-filter-root
      className={cn(
        "p-0",
        className
      )}
      aria-label="ตัวกรองกราฟ"
    >
      <div className="min-w-0 overflow-x-auto overflow-y-visible min-[1080px]:overflow-x-visible">
        <div className="flex min-w-max items-center gap-2 min-[1080px]:min-w-0 min-[1080px]:w-full min-[1080px]:flex-nowrap">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 shrink-0 rounded-[14px] px-3 text-[11px] font-semibold xl:h-10 xl:px-4 xl:text-xs" onClick={onOpenBaselineHelp}>
              Baseline
            </Button>
            <label className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                เริ่ม
              </span>
              <div className="relative min-w-0 flex-1">
                <Input
                  ref={baselineStartInputRef}
                  type="date"
                  value={draftBaselineStart}
                  onChange={(event) => setDraftBaselineStart(event.target.value)}
                  className="pricing-date-input h-9 w-[138px] rounded-[14px] pr-8 text-[11px] xl:h-10 xl:w-[148px] xl:pr-10 xl:text-[12px]"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-7 w-7 rounded-[10px] xl:h-8 xl:w-8"
                  aria-label="เลือกวันที่เริ่ม"
                  onClick={() => openDatePicker(baselineStartInputRef.current)}
                >
                  <CalendarDays className="size-3" />
                </Button>
              </div>
            </label>
            <label className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                ถึง
              </span>
              <div className="relative min-w-0 flex-1">
                <Input
                  ref={baselineEndInputRef}
                  type="date"
                  value={draftBaselineEnd}
                  onChange={(event) => setDraftBaselineEnd(event.target.value)}
                  className="pricing-date-input h-9 w-[138px] rounded-[14px] pr-8 text-[11px] xl:h-10 xl:w-[148px] xl:pr-10 xl:text-[12px]"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-7 w-7 rounded-[10px] xl:h-8 xl:w-8"
                  aria-label="เลือกวันที่สิ้นสุด"
                  onClick={() => openDatePicker(baselineEndInputRef.current)}
                >
                  <CalendarDays className="size-3" />
                </Button>
              </div>
            </label>
            <Button
              variant="chip"
              size="sm"
              className="h-9 shrink-0 rounded-[14px] px-3 text-[11px] xl:h-10 xl:text-xs"
              data-active={canApplyBaseline}
              disabled={!canApplyBaseline}
              onClick={() => onApplyBaseline(draftBaselineStart, draftBaselineEnd)}
            >
              {hasBaselineDraftChanges ? "ใช้ Baseline" : "ใช้แล้ว"}
            </Button>
          </div>

          <details
            className="relative min-w-0 flex-[1_1_160px]"
            onToggle={(event) => {
              const currentDropdown = event.currentTarget;

              if (!currentDropdown.open) {
                return;
              }

              document.querySelectorAll<HTMLDetailsElement>("[data-filter-root] details[open]").forEach((details) => {
                if (details !== currentDropdown) {
                  details.open = false;
                }
              });
            }}
          >
            <summary className="flex h-9 min-w-0 list-none cursor-pointer items-center justify-between gap-1.5 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-left text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] xl:h-10 xl:px-3.5 xl:text-[12px] [&::-webkit-details-marker]:hidden">
              <span className="shrink-0 truncate text-[var(--muted-foreground)]">Division / FC</span>
              <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <strong className="min-w-0 truncate">{divisionSummary}</strong>
                <ChevronDown className="size-4 text-[var(--muted-foreground)]" />
              </span>
            </summary>
            <div className="absolute z-30 mt-2 w-[min(100vw-2rem,34rem)] rounded-[20px] border border-[var(--border)] bg-[var(--surface-strong)] p-3 shadow-[0_24px_60px_rgba(2,8,20,0.38)]">
              <DivisionFcFilter
                divisions={availableDivisions}
                fcNamesByDivision={fcNamesByDivision}
                selectedDivisions={selectedDivisions}
                selectedFcNames={selectedFcNames}
                onSelectDivision={onSelectDivision}
                onToggleDivision={onToggleDivision}
                onClearDivisions={onClearDivisions}
                onToggleFcName={onToggleFcName}
                onClearFcNames={onClearFcNames}
              />
            </div>
          </details>

          <MultiSelectDropdown
            label="Segment"
            options={availableSegments}
            selectedValues={selectedSegments}
            fallbackLabel="ทุก segment"
            className="min-w-0 flex-[1_1_132px]"
            onToggle={onToggleSegment}
            onClear={onClearSegments}
          />
          <MultiSelectDropdown
            label="Channel"
            options={availableChannels}
            selectedValues={selectedChannels}
            fallbackLabel="ทุก channel"
            className="min-w-0 flex-[1_1_132px]"
            onToggle={onToggleChannel}
            onClear={onClearChannels}
          />
          <MultiSelectDropdown
            label="Discount"
            options={availableDiscountTypes}
            selectedValues={selectedDiscountTypes}
            fallbackLabel="ทุก discount"
            className="min-w-0 flex-[1_1_150px]"
            menuClassName="min-w-[320px]"
            onToggle={onToggleDiscountType}
            onClear={onClearDiscountTypes}
          />

          <Button
            variant="outline"
            className="h-9 shrink-0 rounded-[16px] px-3 text-[11px] xl:h-10 xl:px-4 xl:text-xs"
            onClick={onResetSharedFilters}
          >
            ล้าง
          </Button>
        </div>
      </div>
    </div>
  );
}
