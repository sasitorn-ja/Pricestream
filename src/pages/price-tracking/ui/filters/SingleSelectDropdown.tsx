import { ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../../../components/ui/button";

type SingleSelectDropdownProps = {
  label: string;
  options: Array<{ value: string; label: string }>;
  selectedValue: string;
  fallbackLabel: string;
  onSelect: (value: string) => void;
};

export function SingleSelectDropdown({
  label,
  options,
  selectedValue,
  fallbackLabel,
  onSelect
}: SingleSelectDropdownProps) {
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

  const selectedLabel =
    options.find((option) => option.value === selectedValue)?.label ?? fallbackLabel;

  const closeDropdown = () => {
    if (dropdownRef.current) {
      dropdownRef.current.open = false;
    }
  };

  return (
    <details
      ref={dropdownRef}
      className="relative min-w-[180px]"
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
      <summary className="flex h-8 list-none cursor-pointer items-center justify-between gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-left text-[13px] text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[var(--border-strong)] [&::-webkit-details-marker]:hidden">
        <span className="truncate text-[var(--muted-foreground)]">{label}</span>
        <span className="flex min-w-0 items-center gap-2">
          <strong className="truncate font-semibold text-[var(--foreground)]">{selectedLabel}</strong>
          <ChevronDown className="size-3.5 text-[var(--muted-foreground)]" />
        </span>
      </summary>
      <div className="absolute z-30 mt-2 flex max-h-80 min-w-full flex-col gap-2 overflow-auto rounded-[24px] border border-[var(--border)] bg-[var(--surface-strong)] p-3 shadow-[0_24px_60px_rgba(2,8,20,0.38)]">
        <Button
          variant="chip"
          size="sm"
          data-active={selectedValue === ""}
          className="justify-start"
          onClick={() => {
            onSelect("");
            closeDropdown();
          }}
        >
          {fallbackLabel}
        </Button>
        {options.map((option) => (
          <Button
            key={option.value}
            variant="chip"
            size="sm"
            data-active={selectedValue === option.value}
            className="justify-start"
            onClick={() => {
              onSelect(option.value);
              closeDropdown();
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </details>
  );
}
