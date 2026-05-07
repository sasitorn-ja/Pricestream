import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide transition",
  {
    variants: {
      variant: {
        default: "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)]",
        secondary: "border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)]",
        outline: "border-[var(--border)] bg-transparent text-[var(--muted-foreground)]",
        success: "border-[var(--alert-success-border)] bg-[var(--alert-success-bg)] text-[var(--alert-success-text)]",
        warning: "border-amber-400/30 bg-amber-400/12 text-amber-100",
        destructive: "border-[var(--alert-error-border)] bg-[var(--alert-error-bg)] text-[var(--alert-error-text)]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
