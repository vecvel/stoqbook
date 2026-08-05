"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Icon } from "@/components/layout/icon";
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

  /* Expansion is derived from the route, with a manual override.
     `null` means "follow the route", so an active section is open without any
     effect having to push it open after the fact. Navigating into a section
     clears the override, which is what keeps the active section expanded — the
     comparison runs during render rather than in an effect, so the sidebar never
     paints collapsed for a frame before correcting itself. */
  const [override, setOverride] = useState<boolean | null>(null);
  const [lastActive, setLastActive] = useState(active);

  if (lastActive !== active) {
    setLastActive(active);
    setOverride(null);
  }

  const open = override ?? active;

  if (collapsed) {
    return (
      <Link
        href={item.href}
        title={item.label}
        className={cn(
          "flex h-9 items-center justify-center rounded-xs transition-colors",
          active
            ? "bg-shell-active text-shell-active-foreground"
            : "text-shell-muted hover:bg-shell-foreground/10 hover:text-shell-foreground",
        )}
      >
        <Icon name={item.icon} />
        {item.badge ? (
          <span className="ml-1 rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <div>
      {hasChildren ? (
        <button
          type="button"
          /* Toggles against the derived value, not the override: `!override`
             would read `!null` as "open" and leave an already-open section
             open on the first click. */
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
          {/* Vertical rail connecting the child links to their parent. */}
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
                  {child.label}
                </Link>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
