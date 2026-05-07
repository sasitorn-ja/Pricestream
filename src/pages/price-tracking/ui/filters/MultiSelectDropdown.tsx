import { ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../../../components/ui/button";
import { cn } from "../../../../lib/utils";
import { summarizeMultiSelect } from "../../utils/filters";

type MultiSelectDropdownProps = {
  label: string;
  options: string[];
  selectedValues: string[];
  fallbackLabel: string;
  getOptionLabel?: (value: string) => string;
  className?: string;
  menuClassName?: string;
  optionClassName?: string;
  onToggle: (value: string) => void;
  onClear: () => void;
};

export function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  fallbackLabel,
  getOptionLabel = (value) => value,
  className,
  menuClassName,
  optionClassName,
  onToggle,
  onClear
}: MultiSelectDropdownProps) {
  const dropdownRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!dropdownRef.current?.open) {
        return;
      }

      if (!dropdownRef.current.contains(event.target as Node)) {
        dropdownRef.current.open = false;
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && dropdownRef.current?.open) {
        dropdownRef.current.open = false;
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const closeDropdown = () => {
    if (dropdownRef.current) {
      dropdownRef.current.open = false;
    }
  };

  return (
    <details
      ref={dropdownRef}
      className={cn("relative", className)}
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
      <summary className="flex h-9 min-w-0 list-none cursor-pointer items-center justify-between gap-1.5 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-left text-[11px] text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[var(--border-strong)] xl:h-10 xl:px-3.5 xl:text-[12px] [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 truncate text-[var(--muted-foreground)]">{label}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <strong className="min-w-0 truncate font-semibold text-[var(--foreground)]">
            {summarizeMultiSelect(selectedValues.map(getOptionLabel), fallbackLabel)}
          </strong>
          <ChevronDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
        </span>
      </summary>
      <div
        className={cn(
          "absolute z-30 mt-2 flex max-h-80 min-w-full flex-col gap-2 overflow-auto rounded-[24px] border border-[var(--border)] bg-[var(--surface-strong)] p-3 shadow-[0_24px_60px_rgba(2,8,20,0.38)]",
          menuClassName
        )}
      >
        <Button
          variant="chip"
          size="sm"
          data-active={selectedValues.length === 0}
          className={cn("justify-start", optionClassName)}
          onClick={() => {
            onClear();
            closeDropdown();
          }}
        >
          ทั้งหมด
        </Button>
        {options.map((option) => (
          <Button
            key={option}
            variant="chip"
            size="sm"
            data-active={selectedValues.includes(option)}
            className={cn("justify-start", optionClassName)}
            onClick={() => {
              onToggle(option);
              closeDropdown();
            }}
          >
            {getOptionLabel(option)}
          </Button>
        ))}
      </div>
    </details>
  );
}
