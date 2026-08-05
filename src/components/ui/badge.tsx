import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 text-nowrap rounded-xs border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        accent: "border-transparent bg-accent text-accent-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
        /* Low-emphasis tinted variants for dense tables */
        "soft-accent": "border-accent/30 bg-accent/10 text-copper-deep",
        "soft-success": "border-success/30 bg-success/10 text-success",
        "soft-warning": "border-warning/30 bg-warning/10 text-warning",
        "soft-destructive":
          "border-destructive/30 bg-destructive/10 text-destructive",
        "soft-neutral": "border-border bg-muted/70 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
