import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_16px_40px_rgba(48,117,255,0.28)] hover:-translate-y-0.5 hover:bg-[var(--primary-strong)]",
        secondary:
          "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:-translate-y-0.5 hover:bg-[var(--secondary-strong)]",
        outline:
          "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-strong)]",
        ghost:
          "text-[var(--foreground)] hover:bg-[var(--surface-strong)]",
        destructive:
          "bg-[var(--destructive)] text-white shadow-[0_16px_32px_rgba(220,38,38,0.26)] hover:-translate-y-0.5 hover:bg-[var(--destructive-strong)]",
        chip:
          "rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)] data-[active=true]:border-[var(--primary)] data-[active=true]:bg-[var(--primary-soft)] data-[active=true]:text-[var(--foreground)]"
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-xl px-3 text-xs",
        lg: "h-12 px-5 text-base",
        icon: "size-11 rounded-2xl"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button };
