"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Icon } from "@/components/layout/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface NavNodeView {
  label: string;
  href: string;
  icon?: string;
  badge?: number;
  children?: { label: string; href: string; badge?: number }[];
}

function isActiveHref(pathname: string, href: string, exact = false): boolean {
  if (exact || href === "/dashboard") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  items,
  collapsed,
}: {
  items: NavNodeView[];
  collapsed: boolean;
}) {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={50}>
      <nav className="flex flex-1 min-h-0 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-3 scrollbar-thin">
        {items.map((item) => (
          <NavItem
            key={item.href + item.label}
            item={item}
            collapsed={collapsed}
            pathname={pathname}
          />
        ))}
      </nav>
    </TooltipProvider>
  );
}

function NavItem({
  item,
  collapsed,
  pathname,
}: {
  item: NavNodeView;
  collapsed: boolean;
  pathname: string;
}) {
  const hasChildren = Boolean(item.children?.length);
  const sectionActive = isActiveHref(pathname, item.href);
  const childActive = item.children?.some((c) => isActiveHref(pathname, c.href, true));
  const active = sectionActive || Boolean(childActive);

  const [override, setOverride] = useState<boolean | null>(null);
  const [lastActive, setLastActive] = useState(active);

  if (lastActive !== active) {
    setLastActive(active);
    setOverride(null);
  }

  const open = override ?? active;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            aria-label={item.label}
            className={cn(
              "flex h-9 w-full items-center justify-center rounded-xs transition-colors",
              active
                ? "bg-shell-active text-shell-active-foreground"
                : "text-shell-muted hover:bg-shell-foreground/10 hover:text-shell-foreground",
            )}
          >
            <Icon name={item.icon} className="size-4 shrink-0" />
          </Link>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={8}
          className="z-50 shadow-md p-1 min-w-[170px] pointer-events-auto bg-popover text-popover-foreground border border-border"
        >
          {/* Main Item Link */}
          <Link
            href={item.href}
            className={cn(
              "flex items-center justify-between gap-2 px-2 py-1 text-xs font-medium rounded-xs transition-colors",
              !hasChildren && active
                ? "bg-shell-active text-shell-active-foreground font-semibold"
                : "hover:bg-muted/80 text-foreground",
            )}
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span className="rounded-full bg-copper/20 text-copper border border-copper/30 px-1.5 py-0.2 text-[10px] font-bold">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </Link>

          {/* Collapsible Sublinks */}
          {hasChildren && item.children && item.children.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border/60">
              {item.children.map((child) => {
                const childIsActive = isActiveHref(pathname, child.href, true);
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={cn(
                      "flex items-center justify-between gap-2 px-2 py-1 text-[11px] rounded-xs transition-colors",
                      childIsActive
                        ? "bg-shell-active text-shell-active-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
                    )}
                  >
                    <span className="truncate">{child.label}</span>
                    {child.badge ? (
                      <span className="text-[10px] font-semibold text-copper">
                        {child.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      {hasChildren ? (
        <button
          type="button"
          onClick={() => setOverride(!open)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xs px-2.5 py-2 text-left text-sm font-medium transition-colors",
            active
              ? "bg-shell-foreground/10 text-shell-foreground"
              : "text-shell-muted hover:bg-shell-foreground/10 hover:text-shell-foreground",
          )}
          aria-expanded={open}
        >
          <Icon name={item.icon} className="size-4 shrink-0" />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge ? (
            <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-accent-foreground">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          ) : null}
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 opacity-60" />
          )}
        </button>
      ) : (
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-2.5 rounded-xs px-2.5 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-shell-active text-shell-active-foreground"
              : "text-shell-muted hover:bg-shell-foreground/10 hover:text-shell-foreground",
          )}
        >
          <Icon name={item.icon} className="size-4 shrink-0" />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge ? (
            <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-accent-foreground">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          ) : null}
        </Link>
      )}

      {hasChildren && open ? (
        <div className="relative ml-[19px] mt-0.5 space-y-px">
          <span className="absolute bottom-2 left-0 top-0 w-px bg-shell-foreground/15" />
          {item.children!.map((child) => {
            const childIsActive = isActiveHref(pathname, child.href, true);
            return (
              <div key={child.href} className="relative pl-3.5">
                <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-shell-foreground/15" />
                <Link
                  href={child.href}
                  className={cn(
                    "flex items-center rounded-xs px-2.5 py-1.5 text-[13px] transition-colors",
                    childIsActive
                      ? "bg-shell-active text-shell-active-foreground font-medium"
                      : "text-shell-muted hover:bg-shell-foreground/10 hover:text-shell-foreground",
                  )}
                >
                  <span className="truncate">{child.label}</span>
                  {child.badge ? (
                    <span className="ml-1 rounded-full bg-accent/90 px-1 text-[9px] font-bold text-accent-foreground">
                      {child.badge}
                    </span>
                  ) : null}
                </Link>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
