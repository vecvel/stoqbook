"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { formatMoney, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Product lookup field shared by every line-item editor and the POS.
 *
 * Typing searches by name, SKU or barcode. An exact barcode match selects
 * immediately, which is what makes scanner input work without extra keystrokes.
 */

export interface ProductHit {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sellingPrice: string;
  wholesalePrice: string | null;
  discountPrice: string | null;
  discountStartsAt: string | null;
  discountEndsAt: string | null;
  costPrice: string;
  trackInventory: boolean;
  unitShort: string;
  allowDecimal: boolean | null;
  taxGroupId: string | null;
  taxRate: string;
  taxMode: "inclusive" | "exclusive" | null;
  available: string | null;
  averageCost: string;
}

export function ProductSearch({
  warehouseId,
  onSelect,
  placeholder = "Scan a barcode or search by name / SKU…",
  sellableOnly = false,
  currency = "INR",
  autoFocus = false,
  className,
}: {
  warehouseId?: string | null;
  onSelect: (product: ProductHit) => void;
  placeholder?: string;
  sellableOnly?: boolean;
  currency?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow earlier response overwriting a newer one.
  const requestId = useRef(0);

  /* Clearing on an empty box is handled by whoever emptied it (`changeTerm` and
     `select`), not here. The effect exists only to fetch — an effect that also
     resets state synchronously runs a render behind the keystroke that caused
     it, so the stale dropdown is visible for a frame. */
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (term.trim().length === 0) return;

    debounce.current = setTimeout(async () => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const url = new URL("/api/v1/products/search", window.location.origin);
        url.searchParams.set("q", term.trim());
        if (warehouseId) url.searchParams.set("warehouse", warehouseId);
        if (sellableOnly) url.searchParams.set("sellable", "1");

        const response = await fetch(url, { headers: { accept: "application/json" } });
        const payload = await response.json();
        if (id !== requestId.current) return;

        const results: ProductHit[] = payload.data ?? [];
        setHits(results);
        setHighlight(0);

        // A scanned barcode resolves to exactly one product — take it.
        const exactId = payload.meta?.exactMatchId;
        const exact = exactId ? results.find((r) => r.id === exactId) : null;
        if (exact) {
          select(exact);
          return;
        }
        setOpen(results.length > 0);
      } catch {
        if (id === requestId.current) setHits([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 220);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // `select` is stable enough for this effect's purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, warehouseId, sellableOnly]);

  // Dismiss the dropdown on an outside click.
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(product: ProductHit) {
    onSelect(product);
    setTerm("");
    setHits([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  /** Typing. Emptying the box closes the dropdown here, in the same event. */
  function changeTerm(next: string) {
    setTerm(next);
    if (next.trim().length === 0) {
      setHits([]);
      setOpen(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (h + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => (h - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(hits[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={term}
        onChange={(e) => changeTerm(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => hits.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className="h-10 w-full rounded-xs border border-input bg-background pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
      />
      {loading ? (
        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : null}

      {open ? (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xs border border-border bg-popover shadow-lg scrollbar-thin">
          {hits.map((hit, index) => {
            const outOfStock =
              hit.trackInventory &&
              hit.available !== null &&
              Number(hit.available) <= 0;

            return (
              <li key={hit.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => select(hit)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                    index === highlight ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{hit.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {hit.sku}
                      {hit.barcode ? ` · ${hit.barcode}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium tabular">
                      {formatMoney(hit.sellingPrice, { currency })}
                    </span>
                    {hit.available !== null ? (
                      <span
                        className={cn(
                          "block text-[11px]",
                          outOfStock ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {outOfStock
                          ? "Out of stock"
                          : `${formatQuantity(hit.available, { unit: hit.unitShort })} on hand`}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
