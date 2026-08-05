/**
 * Registry contracts.
 *
 * A module declares everything about itself in one place — features,
 * permissions, navigation, widgets, reports, settings and events. StoqBook
 * discovers all of it automatically, so adding a module never requires editing
 * navigation, RBAC, the dashboard or the settings page (05-module-system.md).
 */

export type ModuleCategory =
  | "core"
  | "retail"
  | "crm"
  | "hr"
  | "finance"
  | "analytics";

/**
 * Where a module surfaces. `admin` modules live in the business admin panel,
 * `business` modules are the day-to-day operational ones.
 */
export type ModuleVisibility = "admin" | "business" | "both";

export type WidgetSize = "small" | "medium" | "large" | "full";

export interface FeatureDef {
  /** Globally unique, conventionally `<module>.<feature>`. */
  slug: string;
  name: string;
  description?: string;
  /** Included in every plan, even Trial. */
  isDefault?: boolean;
}

export interface PermissionDef {
  /** Action segment; the full key becomes `<module>.<action>`. */
  action: string;
  name: string;
  description?: string;
  /** Permission is meaningless unless this feature is entitled. */
  feature?: string;
}

export interface NavDef {
  label: string;
  /** Absolute app path. Parents without a page use their first child's path. */
  href: string;
  /** Lucide icon name — resolved through the icon registry. */
  icon?: string;
  /** Permission required to see this entry. */
  permission?: string;
  /** Feature entitlement required to see this entry. */
  feature?: string;
  children?: NavDef[];
  /** Show a badge computed at render time, e.g. unread notifications. */
  badgeKey?: string;
}

export interface WidgetDef {
  /** Stable key persisted in dashboard_layouts. */
  key: string;
  name: string;
  description?: string;
  permission: string;
  feature?: string;
  size: WidgetSize;
  /** Lower sorts first. */
  priority: number;
  /** Seconds; 0 means render once per navigation. */
  refreshInterval?: number;
}

export interface ReportDef {
  key: string;
  name: string;
  description?: string;
  permission: string;
  feature?: string;
  /** Grouping shown on the reports index. */
  group:
    | "sales"
    | "purchases"
    | "inventory"
    | "customers"
    | "suppliers"
    | "employees"
    | "financial"
    | "audit"
    | "operational";
}

export type SettingFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "money";

export interface SettingDef {
  key: string;
  label: string;
  description?: string;
  type: SettingFieldType;
  /** Which level of the hierarchy owns this value (17-settings.md). */
  scope: "business" | "branch" | "warehouse" | "user";
  default: unknown;
  options?: { value: string; label: string }[];
  /** Permission required to change it. */
  permission?: string;
  /** Grouping tab on the settings page. */
  group: string;
}

export interface ModuleDef {
  slug: string;
  name: string;
  description: string;
  category: ModuleCategory;
  icon: string;
  version: string;
  /** Core modules can never be disabled by a licence. */
  isCore: boolean;
  visibility: ModuleVisibility;
  /** Module slugs that must also be enabled. */
  dependencies: string[];
  sortOrder: number;

  features: FeatureDef[];
  permissions: PermissionDef[];
  navigation: NavDef[];
  widgets: WidgetDef[];
  reports: ReportDef[];
  settings: SettingDef[];
  /** Domain events this module publishes. */
  events: string[];
}
