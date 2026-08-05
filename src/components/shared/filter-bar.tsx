"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * URL-driven filters. Changing a control rewrites the query string, so the
 * server component re-renders with the new filter — no client-side data layer.
 */

function useQueryWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const write = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === "all") params.delete(key);
      else params.set(key, value);
    }
    // Any filter change returns to the first page.
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return { write, pending, searchParams };
}

export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xs border border-border bg-card px-3 py-2.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SearchFilter({
  placeholder = "Search…",
  paramName = "search",
  className,
}: {
  placeholder?: string;
  paramName?: string;
  className?: string;
}) {
  const { write, pending, searchParams } = useQueryWriter();
  const fromUrl = searchParams.get(paramName) ?? "";

  /* The URL is the source of truth; local state only exists to keep typing
     responsive ahead of the debounced write.

     Reconciled during render rather than in an effect: when the URL changes from
     elsewhere — Reset, a back button, a link — the input must already show the
     new value on the first paint, not one render later. Comparing against the
     previous URL value is what distinguishes "someone else changed it" from
     "our own debounced write landed". */
  const [typed, setTyped] = useState(fromUrl);
  const [lastFromUrl, setLastFromUrl] = useState(fromUrl);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (lastFromUrl !== fromUrl) {
    setLastFromUrl(fromUrl);
    setTyped(fromUrl);
  }

  const value = typed;
  const setValue = setTyped;

  const onChange = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => write({ [paramName]: next || null }), 350);
  };

  return (
    <div className={cn("relative min-w-[200px] flex-1 md:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-xs border border-input bg-background pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
      />
      {pending ? (
        <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            write({ [paramName]: null });
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function SelectFilter({
  paramName,
  label,
  options,
  allLabel = "All",
  className,
}: {
  paramName: string;
  label?: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  const { write, searchParams } = useQueryWriter();
  const current = searchParams.get(paramName) ?? "all";

  return (
    <label className={cn("flex items-center gap-1.5", className)}>
      {label ? (
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      ) : null}
      <select
        value={current}
        onChange={(e) => write({ [paramName]: e.target.value })}
        className="h-8 rounded-xs border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring"
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateRangeFilter({
  fromParam = "from",
  toParam = "to",
}: {
  fromParam?: string;
  toParam?: string;
}) {
  const { write, searchParams } = useQueryWriter();

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={searchParams.get(fromParam) ?? ""}
        onChange={(e) => write({ [fromParam]: e.target.value || null })}
        aria-label="From date"
        className="h-8 rounded-xs border border-input bg-background px-2 text-sm outline-none focus:border-ring"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <input
        type="date"
        value={searchParams.get(toParam) ?? ""}
        onChange={(e) => write({ [toParam]: e.target.value || null })}
        aria-label="To date"
        className="h-8 rounded-xs border border-input bg-background px-2 text-sm outline-none focus:border-ring"
      />
    </div>
  );
}

/** Quick period presets used by reports and dashboards. */
export function RangePresetFilter({
  paramName = "range",
  presets = [
    { value: "today", label: "Today" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "quarter", label: "Quarter" },
    { value: "year", label: "Year" },
  ],
}: {
  paramName?: string;
  presets?: { value: string; label: string }[];
}) {
  const { write, searchParams } = useQueryWriter();
  const current = searchParams.get(paramName) ?? presets[0].value;

  return (
    <div className="flex items-center overflow-hidden rounded-xs border border-border">
      {presets.map((preset, i) => (
        <button
          key={preset.value}
          type="button"
          onClick={() => write({ [paramName]: preset.value })}
          className={cn(
            "px-2.5 py-1.5 text-xs font-medium transition-colors",
            i > 0 && "border-l border-border",
            current === preset.value
              ? "bg-accent text-accent-foreground"
              : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

export function ResetFilters({ keep = [] }: { keep?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hasFilters = [...searchParams.keys()].some((k) => !keep.includes(k));
  if (!hasFilters) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const params = new URLSearchParams();
        for (const k of keep) {
          const v = searchParams.get(k);
          if (v) params.set(k, v);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <X className="size-3" />
      Reset
    </button>
  );
}
