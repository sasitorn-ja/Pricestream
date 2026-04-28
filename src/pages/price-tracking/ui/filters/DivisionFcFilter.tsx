import { useEffect, useRef, useState } from "react";

type DivisionFcFilterProps = {
  divisions: string[];
  fcNamesByDivision: Record<string, string[]>;
  selectedDivisions: string[];
  selectedFcNames: string[];
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
    <div ref={dropdownRef} className="divisionFcSplit">
      <div className="divisionDropdownRow">
        <button
          type="button"
          className={`compactFilterChip ${hasSelectedEveryDivision && selectedFcNames.length === 0 ? "selected" : ""}`}
          onClick={() => {
            onClearDivisions();
            onClearFcNames();
            setOpenDivision(null);
          }}
        >
          ทั้งหมด
        </button>
        {selectedFcNames.length > 0 ? (
          <button type="button" className="clearFilterButton mini" onClick={onClearFcNames}>
            ล้าง FC
          </button>
        ) : null}
        {divisions.map((division) => {
          const fcNames = fcNamesByDivision[division] ?? [];
          const isDivisionSelected = !hasSelectedEveryDivision && selectedDivisions.includes(division);
          const selectedFcCount = fcNames.filter((fcName) =>
            selectedFcNames.includes(fcName)
          ).length;

          return (
            <button
              key={division}
              type="button"
              className={`divisionInlineButton ${
                isDivisionSelected || selectedFcCount > 0 || openDivision === division ? "selected" : ""
              }`}
              onClick={() => setOpenDivision((current) => (current === division ? null : division))}
            >
              <span>{division}</span>
              {selectedFcCount > 0 ? <em>{selectedFcCount}</em> : null}
              <i aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {openDivision ? (
        <div className="divisionInlineMenu">
          <label className={`divisionCheck ${isActiveDivisionChecked || isActiveDivisionIndeterminate ? "selected" : ""}`}>
            <input
              ref={activeDivisionCheckboxRef}
              type="checkbox"
              checked={isActiveDivisionChecked}
              onChange={() => onToggleDivision(openDivision)}
            />
            <span>ทั้งหมดใน {openDivision}</span>
          </label>
          <div className="fcCheckboxGrid">
            {activeFcNames.map((fcName) => (
              <label
                key={fcName}
                className={`fcCheck ${selectedFcNames.includes(fcName) ? "selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selectedFcNames.includes(fcName)}
                  onChange={() => onToggleFcName(openDivision, fcName)}
                />
                <span>{fcName}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
