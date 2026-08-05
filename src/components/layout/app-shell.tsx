"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, LogOut, Menu, Search, Store, User } from "lucide-react";

import { SidebarNav, type NavNodeView } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ShellStore {
  id: string;
  name: string;
  code: string;
}

export interface ShellUser {
  name: string;
  email: string;
  roleLabel: string;
}

export interface ShellLicense {
  planName: string;
  status: string;
  daysRemaining: number | null;
  billingMode: string;
}

export interface AppShellProps {
  businessName: string;
  navigation: NavNodeView[];
  user: ShellUser;
  stores: ShellStore[];
  activeStoreId: string | null;
  license: ShellLicense | null;
  unreadCount: number;
  children: React.ReactNode;
}

export function AppShell({
  businessName,
  navigation,
  user,
  stores,
  activeStoreId,
  license,
  unreadCount,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Collapse automatically on narrow desktops so tables keep their width.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1180px)");
    const apply = (matches: boolean) => setCollapsed(matches);
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const activeStore = stores.find((s) => s.id === activeStoreId) ?? null;

  const sidebar = (
    <Rail
      businessName={businessName}
      navigation={navigation}
      collapsed={collapsed}
      license={license}
    />
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop rail */}
      <div className="sticky top-0 z-20 hidden h-screen shrink-0 self-start md:flex">
        {sidebar}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-2.5 top-[52px] z-20 flex size-5 items-center justify-center rounded-full border border-shell-border bg-shell text-shell-foreground transition-colors hover:bg-shell-foreground/15"
        >
          <ChevronLeft
            className={cn("size-3 transition-transform", collapsed && "rotate-180")}
          />
        </button>
      </div>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[248px] border-r-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Rail
            businessName={businessName}
            navigation={navigation}
            collapsed={false}
            license={license}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onOpenMobile={() => setMobileOpen(true)}
          user={user}
          stores={stores}
          activeStore={activeStore}
          unreadCount={unreadCount}
        />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6 md:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function Rail({
  businessName,
  navigation,
  collapsed,
  license,
}: {
  businessName: string;
  navigation: NavNodeView[];
  collapsed: boolean;
  license: ShellLicense | null;
}) {
  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-shell-border bg-shell text-shell-foreground transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-[248px]",
      )}
    >
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-shell-border px-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xs bg-parchment font-bold text-bark">
          S
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight">
              StoqBook
            </div>
            <div className="truncate text-[11px] leading-tight text-shell-muted">
              {businessName}
            </div>
          </div>
        )}
      </div>

      <SidebarNav items={navigation} collapsed={collapsed} />

      {/* Licence status footer */}
      {!collapsed && license ? (
        <div className="shrink-0 border-t border-shell-border px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wide text-shell-muted">
              Plan
            </span>
            <span className="text-xs font-semibold">{license.planName}</span>
          </div>
          {license.daysRemaining !== null ? (
            <div
              className={cn(
                "mt-1.5 text-[11px]",
                license.daysRemaining <= 7 ? "text-copper" : "text-shell-muted",
              )}
            >
              {license.daysRemaining > 0
                ? `${license.daysRemaining} day${license.daysRemaining === 1 ? "" : "s"} remaining`
                : "Licence expired"}
            </div>
          ) : (
            <div className="mt-1.5 text-[11px] capitalize text-shell-muted">
              {license.billingMode.replace("_", " ")}
            </div>
          )}
        </div>
      ) : null}
    </aside>
  );
}

function Header({
  onOpenMobile,
  user,
  stores,
  activeStore,
  unreadCount,
}: {
  onOpenMobile: () => void;
  user: ShellUser;
  stores: ShellStore[];
  activeStore: ShellStore | null;
  unreadCount: number;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/95 backdrop-blur px-3 md:px-5">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={onOpenMobile}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      <GlobalSearch />
      <div className="flex-1" />

      {/* A single-store business has nothing to switch between. */}
      {stores.length > 1 ? (
        <StoreSwitcher stores={stores} active={activeStore} />
      ) : null}

      <Link
        href="/notifications"
        className="relative flex size-8 items-center justify-center rounded-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex min-w-[15px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-[15px] text-accent-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Link>

      <UserMenu user={user} />
    </header>
  );
}

function GlobalSearch() {
  return (
    <form action="/search" className="hidden max-w-sm flex-1 md:block">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          placeholder="Search products, invoices, customers…"
          className="h-8 w-full rounded-xs border border-input bg-background pl-8 pr-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
        />
      </div>
    </form>
  );
}

function StoreSwitcher({
  stores,
  active,
}: {
  stores: ShellStore[];
  active: ShellStore | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Store className="size-3.5" />
          <span className="max-w-[140px] truncate">
            {active?.name ?? "Select store"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Switch store</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {stores.map((store) => (
          <DropdownMenuItem key={store.id} asChild>
            {/* A GET link keeps this shareable and avoids a client mutation. */}
            <a
              href={`/api/session/store?id=${store.id}`}
              className={cn(
                "flex w-full items-center justify-between gap-2 text-sm",
                store.id === active?.id && "font-semibold",
              )}
            >
              <span className="truncate">{store.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {store.code}
              </span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-xs px-1.5 py-1 transition-colors hover:bg-muted"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-bark text-[11px] font-semibold text-parchment">
            {initials(user.name)}
          </span>
          <span className="hidden text-left leading-tight lg:block">
            <span className="block max-w-[140px] truncate text-xs font-medium">
              {user.name}
            </span>
            <span className="block max-w-[140px] truncate text-[10px] text-muted-foreground">
              {user.roleLabel}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/preferences" className="gap-2">
            <User className="size-3.5" />
            My preferences
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          {/* Logout is a POST via a form so it cannot be triggered by a GET. */}
          <form action="/api/session/logout" method="post" className="w-full">
            <button
              type="submit"
              className="flex w-full items-center gap-2 text-destructive"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
