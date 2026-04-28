import type { TableColumnHelpKey } from "../../constants";

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
    <span className={`thLabel ${isOpen ? "open" : ""}`}>
      {label}
      <button
        type="button"
        className={`hintDot ${isOpen ? "open" : ""}`}
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
      {isOpen ? <span className={`hintPopup ${popupAlign}`}>{hint}</span> : null}
    </span>
  );
}
