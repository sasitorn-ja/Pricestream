import { CalendarDays, ChevronDown } from "lucide-react";
import { useRef } from "react";
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
  onBaselineStartChange: (value: string) => void;
  onBaselineEndChange: (value: string) => void;
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
  onBaselineStartChange,
  onBaselineEndChange,
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
  const hasSelectedEveryDivision =
    availableDivisions.length > 0 &&
    selectedDivisions.length === availableDivisions.length &&
    availableDivisions.every((division) => selectedDivisions.includes(division));
  const divisionSummary =
    selectedFcNames.length > 0
      ? summarizeMultiSelect(
          hasSelectedEveryDivision
            ? selectedFcNames
            : [...selectedDivisions, ...selectedFcNames],
          "ไม่เลือก FC"
        )
      : hasSelectedEveryDivision
        ? "ทั้งหมด"
        : summarizeMultiSelect(selectedDivisions, "ไม่เลือก");

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
      <div className="min-w-0 overflow-x-auto overflow-y-visible min-[1280px]:overflow-x-visible">
        <div className="flex min-w-max flex-wrap items-center gap-2 min-[1280px]:min-w-full min-[1280px]:flex-nowrap">
          <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 min-[1280px]:basis-auto min-[1280px]:flex-nowrap min-[1280px]:shrink-0">
            <Button variant="outline" size="sm" className="h-10 shrink-0 rounded-[14px] px-4 text-xs font-semibold" onClick={onOpenBaselineHelp}>
              Baseline
            </Button>
            <label className="flex min-w-0 items-center gap-1.5 max-sm:w-full">
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                เริ่ม
              </span>
              <div className="relative min-w-0 flex-1">
                <Input
                  ref={baselineStartInputRef}
                  type="date"
                  value={selectedBaselineStart}
                  onChange={(event) => onBaselineStartChange(event.target.value)}
                  className="pricing-date-input h-10 w-full min-w-[136px] rounded-[14px] pr-10 text-[12px] md:min-w-[148px]"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-8 w-8 rounded-[10px]"
                  aria-label="เลือกวันที่เริ่ม"
                  onClick={() => openDatePicker(baselineStartInputRef.current)}
                >
                  <CalendarDays className="size-3" />
                </Button>
              </div>
            </label>
            <label className="flex min-w-0 items-center gap-1.5 max-sm:w-full">
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                ถึง
              </span>
              <div className="relative min-w-0 flex-1">
                <Input
                  ref={baselineEndInputRef}
                  type="date"
                  value={selectedBaselineEnd}
                  onChange={(event) => onBaselineEndChange(event.target.value)}
                  className="pricing-date-input h-10 w-full min-w-[136px] rounded-[14px] pr-10 text-[12px] md:min-w-[148px]"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-8 w-8 rounded-[10px]"
                  aria-label="เลือกวันที่สิ้นสุด"
                  onClick={() => openDatePicker(baselineEndInputRef.current)}
                >
                  <CalendarDays className="size-3" />
                </Button>
              </div>
            </label>
          </div>

          <details
            className="relative min-w-0 basis-full sm:basis-[220px] min-[1280px]:basis-[220px] min-[1280px]:shrink-0"
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
            <summary className="flex h-10 min-w-0 list-none cursor-pointer items-center justify-between gap-1.5 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-left text-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] [&::-webkit-details-marker]:hidden">
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
            className="min-w-0 basis-full sm:basis-[180px] min-[1280px]:shrink-0"
            onToggle={onToggleSegment}
            onClear={onClearSegments}
          />
          <MultiSelectDropdown
            label="Channel"
            options={availableChannels}
            selectedValues={selectedChannels}
            fallbackLabel="ทุก channel"
            className="min-w-0 basis-full sm:basis-[180px] min-[1280px]:shrink-0"
            onToggle={onToggleChannel}
            onClear={onClearChannels}
          />
          <MultiSelectDropdown
            label="Discount"
            options={availableDiscountTypes}
            selectedValues={selectedDiscountTypes}
            fallbackLabel="ทุก discount"
            className="min-w-0 basis-full sm:basis-[200px] min-[1280px]:shrink-0"
            menuClassName="min-w-[320px]"
            onToggle={onToggleDiscountType}
            onClear={onClearDiscountTypes}
          />

          <Button
            variant="outline"
            className="h-10 w-full shrink-0 rounded-[16px] px-4 text-xs sm:w-auto min-[1280px]:w-auto"
            onClick={onResetSharedFilters}
          >
            ล้าง
          </Button>
        </div>
      </div>
    </div>
  );
}
