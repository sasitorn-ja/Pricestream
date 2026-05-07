import type { TableColumnHelpKey } from "../../constants";
import { cn } from "../../../../lib/utils";

type HeaderWithHintProps = {
  hintKey: TableColumnHelpKey;
  label: string;
  hint: string;
  popupAlign?: "start" | "center" | "end";
  activeHint: TableColumnHelpKey | null;
  onToggle: (key: TableColumnHelpKey) => void;
};

export function HeaderWithHint({
  hintKey,
  label,
  hint,
  popupAlign = "start",
  activeHint,
  onToggle
}: HeaderWithHintProps) {
  const isOpen = activeHint === hintKey;
  const toggleHint = () => onToggle(hintKey);

  return (
    <span className="relative inline-flex items-center gap-2">
      <span>{label}</span>
      <button
        type="button"
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-full border text-[10px] font-bold transition",
          isOpen
            ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
        )}
        aria-label={hint}
        aria-expanded={isOpen}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleHint();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        i
      </button>
      {isOpen ? (
        <span
          className={cn(
            "absolute top-full z-20 mt-2 w-64 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-left text-xs font-medium leading-6 text-[var(--foreground)] shadow-[0_20px_50px_rgba(2,8,20,0.32)]",
            popupAlign === "start" && "left-0",
            popupAlign === "center" && "left-1/2 -translate-x-1/2",
            popupAlign === "end" && "right-0"
          )}
        >
          {hint}
        </span>
      ) : null}
    </span>
  );
}
