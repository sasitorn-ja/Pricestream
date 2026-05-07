import { X } from "lucide-react";
import { Button } from "../../../components/ui/button";

type CalcHelpModalProps = {
  content: { title: string; lines: string[] } | null;
  onClose: () => void;
};

export function CalcHelpModal({ content, onClose }: CalcHelpModalProps) {
  if (!content) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] px-4 py-6 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <section
        className="w-full max-w-2xl rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_32px_100px_rgba(2,8,20,0.46)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calc-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-text)]">
              Calculation Notes
            </p>
            <h2 id="calc-modal-title" className="text-2xl font-semibold text-[var(--foreground)]">
              {content.title}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="ปิดวิธีคำนวณ">
            <X className="size-5" />
          </Button>
        </div>
        <div className="space-y-3 text-sm leading-7 text-[var(--muted-foreground)]">
          {content.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
