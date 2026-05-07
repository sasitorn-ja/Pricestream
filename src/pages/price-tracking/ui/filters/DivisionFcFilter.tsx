import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../components/ui/button";
import { cn } from "../../../../lib/utils";

type DivisionFcFilterProps = {
  divisions: string[];
  fcNamesByDivision: Record<string, string[]>;
  selectedDivisions: string[];
  selectedFcNames: string[];
  onSelectDivision?: (value: string) => void;
  onToggleDivision: (value: string) => void;
  onClearDivisions: () => void;
  onToggleFcName: (division: string, value: string) => void;
  onClearFcNames: () => void;
};

export function DivisionFcFilter({
  divisions,
  fcNamesByDivision,
  selectedDivisions,
  selectedFcNames,
  onSelectDivision,
  onToggleDivision,
  onClearDivisions,
  onToggleFcName,
  onClearFcNames
}: DivisionFcFilterProps) {
  const [openDivision, setOpenDivision] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const activeDivisionCheckboxRef = useRef<HTMLInputElement | null>(null);
  const activeFcNames = openDivision ? (fcNamesByDivision[openDivision] ?? []) : [];
  const hasSelectedEveryDivision =
    divisions.length > 0 &&
    selectedDivisions.length === divisions.length &&
    divisions.every((division) => selectedDivisions.includes(division));
  const selectedActiveFcCount = activeFcNames.filter((fcName) => selectedFcNames.includes(fcName)).length;
  const hasActiveFcSelection = selectedActiveFcCount > 0;
  const hasSelectedEveryActiveFc = activeFcNames.length > 0 && selectedActiveFcCount === activeFcNames.length;
  const isActiveDivisionExplicitlySelected =
    openDivision !== null &&
    !hasSelectedEveryDivision &&
    selectedDivisions.includes(openDivision) &&
    !hasActiveFcSelection;
  const isActiveDivisionChecked = hasActiveFcSelection
    ? hasSelectedEveryActiveFc
    : isActiveDivisionExplicitlySelected;
  const isActiveDivisionIndeterminate = hasActiveFcSelection
    ? !hasSelectedEveryActiveFc
    : hasSelectedEveryDivision;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!dropdownRef.current || dropdownRef.current.contains(event.target as Node)) {
        return;
      }

      setOpenDivision(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenDivision(null);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!activeDivisionCheckboxRef.current) {
      return;
    }

    activeDivisionCheckboxRef.current.indeterminate = isActiveDivisionIndeterminate;
  }, [isActiveDivisionIndeterminate, openDivision]);

  return (
    <div ref={dropdownRef} className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button
          variant="chip"
          size="sm"
          data-active={hasSelectedEveryDivision && selectedFcNames.length === 0}
          className="h-8 justify-center px-2 text-[11px]"
          onClick={() => {
            onClearDivisions();
            onClearFcNames();
            setOpenDivision(null);
          }}
        >
          ทั้งหมด
        </Button>
        {selectedFcNames.length > 0 ? (
          <Button variant="outline" size="sm" className="h-8 justify-center px-2 text-[11px]" onClick={onClearFcNames}>
            ล้าง FC
          </Button>
        ) : null}
        {divisions.map((division) => {
          const fcNames = fcNamesByDivision[division] ?? [];
          const isDivisionSelected = !hasSelectedEveryDivision && selectedDivisions.includes(division);
          const selectedFcCount = fcNames.filter((fcName) => selectedFcNames.includes(fcName)).length;

          return (
            <Button
              key={division}
              variant="chip"
              size="sm"
              data-active={isDivisionSelected || selectedFcCount > 0}
              className="h-8 justify-between gap-1.5 px-2 text-[11px]"
              onClick={() => {
                if (hasSelectedEveryDivision) {
                  (onSelectDivision ?? onToggleDivision)(division);
                } else if (!selectedDivisions.includes(division)) {
                  onToggleDivision(division);
                }

                setOpenDivision((current) => (current === division ? null : division));
              }}
            >
              <span className="truncate">{division}</span>
              {selectedFcCount > 0 ? (
                <span className="shrink-0 rounded-full bg-[var(--surface-strong)] px-1.5 py-0.5 text-[10px] text-[var(--foreground)]">
                  {selectedFcCount}
                </span>
              ) : null}
              <ChevronDown className={cn("size-3 shrink-0 transition", openDivision === division && "rotate-180")} />
            </Button>
          );
        })}
      </div>

      {openDivision ? (
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 shadow-[0_20px_50px_rgba(2,8,20,0.24)]">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="truncate text-xs font-semibold text-[var(--foreground)]">{openDivision}</span>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
              <input
                ref={activeDivisionCheckboxRef}
                type="checkbox"
                checked={isActiveDivisionChecked}
                onChange={() => onToggleDivision(openDivision)}
                className="size-3.5 accent-[var(--primary)]"
              />
              <span>เลือกทั้งหมด</span>
            </label>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {activeFcNames.map((fcName) => (
              <label
                key={fcName}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-2 rounded-[12px] border px-2.5 text-xs transition",
                  selectedFcNames.includes(fcName)
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-strong)]"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedFcNames.includes(fcName)}
                  onChange={() => onToggleFcName(openDivision, fcName)}
                  className="size-3.5 accent-[var(--primary)]"
                />
                <span className="truncate">{fcName}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
