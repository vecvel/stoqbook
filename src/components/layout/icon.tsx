import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  Blocks,
  Boxes,
  Building2,
  CalendarDays,
  ChartColumn,
  CheckCircle2,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  Coins,
  CreditCard,
  FileText,
  Hourglass,
  IdCard,
  KeyRound,
  Layers,
  LayoutDashboard,
  Megaphone,
  Package,
  PackageCheck,
  PackageSearch,
  Plane,
  Receipt,
  ScanLine,
  ScrollText,
  Search,
  SearchX,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  ToggleRight,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCheck,
  UserX,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Icons are referenced by name in the module registry, which is plain data and
 * cannot hold a component. This map is the single resolution point.
 */
const ICONS: Record<string, LucideIcon> = {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  Blocks,
  Boxes,
  Building2,
  CalendarDays,
  ChartColumn,
  CheckCircle2,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  Coins,
  CreditCard,
  FileText,
  Hourglass,
  IdCard,
  KeyRound,
  Layers,
  LayoutDashboard,
  Megaphone,
  Package,
  PackageCheck,
  PackageSearch,
  Plane,
  Receipt,
  ScanLine,
  ScrollText,
  Search,
  SearchX,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  ToggleRight,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCheck,
  UserX,
  Users,
  Wallet,
  Warehouse,
};

export function Icon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  const Component = name ? ICONS[name] : undefined;
  if (!Component) {
    // Unknown names render a neutral placeholder rather than breaking layout.
    return <span className={cn("inline-block size-4", className)} aria-hidden />;
  }
  return <Component className={cn("size-4", className)} aria-hidden />;
}

export function hasIcon(name?: string | null): boolean {
  return Boolean(name && ICONS[name]);
}
