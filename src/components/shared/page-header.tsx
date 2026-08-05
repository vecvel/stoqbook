import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Every page opens with this block, so titles, breadcrumbs and action placement
 * are identical across the application.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          {breadcrumbs.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
              {i > 0 ? <ChevronRight className="size-3 opacity-50" /> : null}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
