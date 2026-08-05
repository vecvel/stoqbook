import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { label: "Modules", href: "/admin/registry" },
  { label: "Features", href: "/admin/registry/features" },
  { label: "Permissions", href: "/admin/registry/permissions" },
];

/**
 * The active tab is passed in rather than read from the pathname so this stays a
 * server component and the strip renders with the page, without client JS.
 */
export function RegistryTabs({ active }: { active: string }) {
  return (
    <nav
      aria-label="Registry sections"
      className="flex w-fit items-center overflow-hidden rounded-xs border border-border bg-card"
    >
      {TABS.map((tab, i) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === active ? "page" : undefined}
          className={cn(
            "px-3 py-1.5 text-sm font-medium transition-colors",
            i > 0 && "border-l border-border",
            tab.href === active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
