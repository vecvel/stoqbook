import { Badge, type BadgeProps } from "@/components/ui/badge";
import { humanise } from "@/lib/format";

type Tone = NonNullable<BadgeProps["variant"]>;

/**
 * Central mapping from domain status values to badge tones, so the same status
 * always looks the same wherever it appears.
 */
const TONES: Record<string, Tone> = {
  /* Generic */
  active: "soft-success",
  inactive: "soft-neutral",
  pending: "soft-warning",
  archived: "soft-neutral",
  blocked: "soft-destructive",
  suspended: "soft-destructive",
  cancelled: "soft-destructive",
  deleted: "soft-destructive",
  draft: "soft-neutral",
  completed: "soft-success",
  approved: "soft-success",
  rejected: "soft-destructive",
  expired: "soft-destructive",

  /* Business lifecycle */
  created: "soft-neutral",
  pending_verification: "soft-warning",

  /* Products */
  discontinued: "soft-warning",

  /* Payment */
  unpaid: "soft-destructive",
  partially_paid: "soft-warning",
  paid: "soft-success",
  overpaid: "soft-accent",
  refunded: "soft-neutral",

  /* Sales */
  returned: "soft-neutral",
  partially_returned: "soft-warning",

  /* Purchase orders */
  pending_approval: "soft-warning",
  sent: "soft-accent",
  partially_received: "soft-warning",

  /* Transfers */
  dispatched: "soft-accent",
  in_transit: "soft-accent",
  received: "soft-success",

  /* Counts */
  counting: "soft-accent",
  review: "soft-warning",

  /* Approvals */
  not_required: "soft-neutral",

  /* Attendance */
  present: "soft-success",
  absent: "soft-destructive",
  late: "soft-warning",
  half_day: "soft-warning",
  leave: "soft-neutral",
  holiday: "soft-neutral",

  /* Notifications */
  critical: "soft-destructive",
  high: "soft-warning",
  medium: "soft-accent",
  low: "soft-neutral",
  silent: "soft-neutral",

  /* Background jobs */
  running: "soft-accent",
  failed: "soft-destructive",

  /* Stock levels */
  in_stock: "soft-success",
  low_stock: "soft-warning",
  out_of_stock: "soft-destructive",
  overstock: "soft-accent",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string | null | undefined;
  label?: string;
  className?: string;
}) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const tone = TONES[status] ?? "soft-neutral";
  return (
    <Badge variant={tone} className={className}>
      {label ?? humanise(status)}
    </Badge>
  );
}

/** Derives a stock status from quantity against the configured minimum. */
export function stockStatus(
  available: string | number,
  minStock: string | number,
): "in_stock" | "low_stock" | "out_of_stock" {
  const qty = Number(available);
  const min = Number(minStock);
  if (qty <= 0) return "out_of_stock";
  if (min > 0 && qty <= min) return "low_stock";
  return "in_stock";
}
