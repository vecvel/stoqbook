"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Opens the print dialog automatically when the receipt loads in a new tab,
 * which is what a cashier expects after completing a sale.
 */
export function PrintTrigger() {
  useEffect(() => {
    // A short delay lets fonts settle so the first print is not blank.
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="no-print mb-4 flex items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        Sized for 80 mm thermal paper.
      </p>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="size-3.5" />
        Print again
      </Button>
    </div>
  );
}
