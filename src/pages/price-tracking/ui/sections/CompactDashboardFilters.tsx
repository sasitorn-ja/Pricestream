import { Button } from "../../../../components/ui/button";
import { DivisionFcFilter } from "../filters/DivisionFcFilter";
import { DiscountTypeCheckboxGroup } from "../filters/DiscountTypeCheckboxGroup";

type CompactDashboardFiltersProps = {
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

export function CompactDashboardFilters({
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
}: CompactDashboardFiltersProps) {
  return (
    <div className="space-y-5 rounded-[24px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div className="space-y-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Division
        </span>
        <DivisionFcFilter
          divisions={availableDivisions}
          fcNamesByDivision={fcNamesByDivision}
          selectedDivisions={selectedDivisions}
          selectedFcNames={selectedFcNames}
          onToggleDivision={onToggleDivision}
          onClearDivisions={onClearDivisions}
          onToggleFcName={onToggleFcName}
          onClearFcNames={onClearFcNames}
        />
      </div>

      <div className="space-y-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Segment
        </span>
        <div className="flex flex-wrap gap-2">
          <Button variant="chip" size="sm" data-active={selectedSegments.length === 0} onClick={onClearSegments}>
            ทั้งหมด
          </Button>
          {availableSegments.map((segment) => (
            <Button
              key={segment}
              variant="chip"
              size="sm"
              data-active={selectedSegments.includes(segment)}
              onClick={() => onToggleSegment(segment)}
            >
              {segment}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Channel
        </span>
        <div className="flex flex-wrap gap-2">
          <Button variant="chip" size="sm" data-active={selectedChannels.length === 0} onClick={onClearChannels}>
            ทั้งหมด
          </Button>
          {availableChannels.map((channel) => (
            <Button
              key={channel}
              variant="chip"
              size="sm"
              data-active={selectedChannels.includes(channel)}
              onClick={() => onToggleChannel(channel)}
            >
              {channel}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Discount Type
        </span>
        <DiscountTypeCheckboxGroup
          options={availableDiscountTypes}
          selectedValues={selectedDiscountTypes}
          onToggle={onToggleDiscountType}
          onClear={onClearDiscountTypes}
        />
      </div>
    </div>
  );
}
