import Link from "next/link";

import { Icon } from "@/components/layout/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-border bg-card px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon name={icon} className="size-5 text-muted-foreground" />
        </div>
      ) : null}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <Button asChild variant="accent" size="sm" className="mt-2">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}

/** Inline notice used for licence limits, warnings and read-only states. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const styles = {
    info: "border-border bg-muted/60 text-foreground",
    warning: "border-warning/40 bg-warning/10 text-foreground",
    danger: "border-destructive/40 bg-destructive/10 text-foreground",
    success: "border-success/40 bg-success/10 text-foreground",
  }[tone];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xs border px-3.5 py-2.5 text-sm",
        styles,
      )}
    >
      <div className="min-w-0">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? (
          <div className={cn(title && "mt-0.5", "text-muted-foreground")}>
            {children}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
