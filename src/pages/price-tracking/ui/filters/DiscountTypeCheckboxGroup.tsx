import { cn } from "../../../../lib/utils";

type DiscountTypeCheckboxGroupProps = {
  options: string[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
};

export function DiscountTypeCheckboxGroup({
  options,
  selectedValues,
  onToggle,
  onClear
}: DiscountTypeCheckboxGroupProps) {
  if (options.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-full border px-4 py-2 text-sm transition",
          selectedValues.length === 0
            ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
        )}
      >
        <input
          type="checkbox"
          checked={selectedValues.length === 0}
          onChange={onClear}
          className="size-4 accent-[var(--primary)]"
        />
        <span>ทั้งหมด</span>
      </label>
      {options.map((option) => (
        <label
          key={option}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-full border px-4 py-2 text-sm transition",
            selectedValues.includes(option)
              ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
          )}
        >
          <input
            type="checkbox"
            checked={selectedValues.includes(option)}
            onChange={() => onToggle(option)}
            className="size-4 accent-[var(--primary)]"
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}
