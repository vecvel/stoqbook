import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Icon } from "@/components/layout/icon";
import { cn } from "@/lib/utils";

export type TileTone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONE_BAR: Record<TileTone, string> = {
  neutral: "bg-bark-muted",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

const TONE_VALUE: Record<TileTone, string> = {
  neutral: "text-foreground",
  accent: "text-copper-deep",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/**
 * KPI tile. A flat surface with a single colour accent bar — no gradients, no
 * nested shadows, so a row of tiles reads as one system.
 */
export function StatTile({
  label,
  value,
  sublabel,
  icon,
  tone = "neutral",
  delta,
  href,
  className,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: string;
  tone?: TileTone;
  /** Percentage change against the comparison period. */
  delta?: number | null;
  href?: string;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "relative flex h-full flex-col gap-1 overflow-hidden rounded-xs border border-border bg-card px-3.5 py-3 transition-colors",
        href && "hover:border-accent/50",
        className,
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_BAR[tone])}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon ? (
          <Icon name={icon} className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </div>
      <div
        className={cn(
          "pl-1.5 text-2xl font-semibold leading-none tabular",
          TONE_VALUE[tone],
        )}
      >
        {value}
      </div>
      <div className="flex items-center gap-2 pl-1.5">
        {sublabel ? (
          <span className="text-[11px] text-muted-foreground">{sublabel}</span>
        ) : null}
        {delta !== undefined && delta !== null ? (
          <span
            className={cn(
              "flex items-center gap-0.5 text-[11px] font-medium",
              delta >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {delta >= 0 ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Responsive grid that keeps tile widths consistent everywhere. */
export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
