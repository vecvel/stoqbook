/**
 * Derived lookups over the module registry.
 *
 * Everything here is computed at module load from the declarations in
 * `modules.ts`. Nothing is hand-maintained.
 *
 * There is one namespace: a single-business installation has no separate
 * platform tier. Administrative capability is just the `admin` module, and its
 * permissions are flagged `isAdmin` so the role editor can group them apart.
 */
import { ALL_MODULE_DEFS } from "./modules";
import type {
  FeatureDef,
  ModuleDef,
  NavDef,
  PermissionDef,
  ReportDef,
  SettingDef,
  WidgetDef,
} from "./types";

export * from "./types";

export const ALL_MODULES: ModuleDef[] = ALL_MODULE_DEFS;

export const MODULE_BY_SLUG: Record<string, ModuleDef> = Object.fromEntries(
  ALL_MODULES.map((m) => [m.slug, m]),
);

export const MODULE_SLUGS: string[] = ALL_MODULES.map((m) => m.slug);

/** Module slugs that a licence can never switch off. */
export const CORE_MODULE_SLUGS: string[] = ALL_MODULES.filter(
  (m) => m.isCore,
).map((m) => m.slug);

/** Modules a plan can choose to include or exclude. */
export const OPTIONAL_MODULE_SLUGS: string[] = ALL_MODULES.filter(
  (m) => !m.isCore,
).map((m) => m.slug);

/* -------------------------------------------------------------------------- */
/* Features                                                                   */
/* -------------------------------------------------------------------------- */

export interface ResolvedFeature extends FeatureDef {
  moduleSlug: string;
}

export const ALL_FEATURES: ResolvedFeature[] = ALL_MODULES.flatMap((m) =>
  m.features.map((f) => ({ ...f, moduleSlug: m.slug })),
);

export const FEATURE_BY_SLUG: Record<string, ResolvedFeature> =
  Object.fromEntries(ALL_FEATURES.map((f) => [f.slug, f]));

/** Features every plan gets, even Trial. */
export const DEFAULT_FEATURE_SLUGS: string[] = ALL_FEATURES.filter(
  (f) => f.isDefault,
).map((f) => f.slug);

export const ALL_FEATURE_SLUGS: string[] = ALL_FEATURES.map((f) => f.slug);

/* -------------------------------------------------------------------------- */
/* Permissions                                                                */
/* -------------------------------------------------------------------------- */

export interface ResolvedPermission extends PermissionDef {
  key: string;
  moduleSlug: string;
  moduleName: string;
  /** Owner-level administrative capability rather than day-to-day operations. */
  isAdmin: boolean;
  /** Declaration order within the module — drives display order. */
  sortOrder: number;
}

export const ALL_PERMISSIONS: ResolvedPermission[] = ALL_MODULES.flatMap((m) =>
  m.permissions.map((p, i) => ({
    ...p,
    key: `${m.slug}.${p.action}`,
    moduleSlug: m.slug,
    moduleName: m.name,
    isAdmin: m.visibility === "admin",
    sortOrder: i,
  })),
);

export const ADMIN_PERMISSIONS: ResolvedPermission[] = ALL_PERMISSIONS.filter(
  (p) => p.isAdmin,
);

export const OPERATIONAL_PERMISSIONS: ResolvedPermission[] =
  ALL_PERMISSIONS.filter((p) => !p.isAdmin);

export const PERMISSION_BY_KEY: Record<string, ResolvedPermission> =
  Object.fromEntries(ALL_PERMISSIONS.map((p) => [p.key, p]));

/** Every permission key in the installation. The Owner role holds all of them. */
export const ALL_PERMISSION_KEYS: string[] = ALL_PERMISSIONS.map((p) => p.key);

export const ADMIN_PERMISSION_KEYS: string[] = ADMIN_PERMISSIONS.map(
  (p) => p.key,
);

/** Permission keys grouped by module, for the role editor UI. */
export const PERMISSIONS_BY_MODULE: {
  slug: string;
  name: string;
  icon: string;
  isAdmin: boolean;
  permissions: ResolvedPermission[];
}[] = ALL_MODULES.map((m) => ({
  slug: m.slug,
  name: m.name,
  icon: m.icon,
  isAdmin: m.visibility === "admin",
  permissions: ALL_PERMISSIONS.filter((p) => p.moduleSlug === m.slug),
})).filter((g) => g.permissions.length > 0);

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export interface RegisteredNav extends NavDef {
  moduleSlug: string;
  sortOrder: number;
}

export const APP_NAVIGATION: RegisteredNav[] = ALL_MODULES.flatMap((m) =>
  m.navigation.map((n) => ({
    ...n,
    moduleSlug: m.slug,
    sortOrder: m.sortOrder,
  })),
).sort((a, b) => a.sortOrder - b.sortOrder);

/* -------------------------------------------------------------------------- */
/* Widgets                                                                    */
/* -------------------------------------------------------------------------- */

export interface RegisteredWidget extends WidgetDef {
  moduleSlug: string;
}

export const ALL_WIDGETS: RegisteredWidget[] = ALL_MODULES.flatMap((m) =>
  m.widgets.map((w) => ({ ...w, moduleSlug: m.slug })),
).sort((a, b) => a.priority - b.priority);

export const WIDGET_BY_KEY: Record<string, RegisteredWidget> =
  Object.fromEntries(ALL_WIDGETS.map((w) => [w.key, w]));

/* -------------------------------------------------------------------------- */
/* Reports                                                                    */
/* -------------------------------------------------------------------------- */

export interface RegisteredReport extends ReportDef {
  moduleSlug: string;
}

export const ALL_REPORTS: RegisteredReport[] = ALL_MODULES.flatMap((m) =>
  m.reports.map((r) => ({ ...r, moduleSlug: m.slug })),
);

export const REPORT_BY_KEY: Record<string, RegisteredReport> =
  Object.fromEntries(ALL_REPORTS.map((r) => [r.key, r]));

export const REPORT_GROUPS: {
  group: RegisteredReport["group"];
  label: string;
}[] = [
  { group: "sales", label: "Sales" },
  { group: "purchases", label: "Purchases" },
  { group: "inventory", label: "Inventory" },
  { group: "customers", label: "Customers" },
  { group: "suppliers", label: "Suppliers" },
  { group: "employees", label: "Employees" },
  { group: "financial", label: "Financial" },
  { group: "audit", label: "Audit" },
  { group: "operational", label: "Operational" },
];

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export interface RegisteredSetting extends SettingDef {
  moduleSlug: string;
  moduleName: string;
}

export const ALL_SETTINGS: RegisteredSetting[] = ALL_MODULES.flatMap((m) =>
  m.settings.map((s) => ({ ...s, moduleSlug: m.slug, moduleName: m.name })),
);

export const SETTING_BY_KEY: Record<string, RegisteredSetting> =
  Object.fromEntries(ALL_SETTINGS.map((s) => [s.key, s]));

/** Default values for every registered setting. */
export const SETTING_DEFAULTS: Record<string, unknown> = Object.fromEntries(
  ALL_SETTINGS.map((s) => [s.key, s.default]),
);

/** Settings grouped by their `group` label, for the dynamic settings page. */
export function settingGroups(moduleSlugs: string[]): {
  group: string;
  settings: RegisteredSetting[];
}[] {
  const allowed = new Set(moduleSlugs);
  const groups = new Map<string, RegisteredSetting[]>();
  for (const s of ALL_SETTINGS) {
    if (!allowed.has(s.moduleSlug)) continue;
    const list = groups.get(s.group) ?? [];
    list.push(s);
    groups.set(s.group, list);
  }
  return [...groups.entries()].map(([group, settings]) => ({ group, settings }));
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export const ALL_EVENTS: { event: string; moduleSlug: string }[] =
  ALL_MODULES.flatMap((m) => m.events.map((event) => ({ event, moduleSlug: m.slug })));

/* -------------------------------------------------------------------------- */
/* Dependency resolution                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Expand a set of module slugs so that every dependency is present, then drop
 * any module whose dependencies are still unmet.
 *
 * Disabling Products must cascade to Inventory and POS (05-module-system.md).
 */
export function resolveModuleDependencies(enabled: string[]): string[] {
  const set = new Set([...enabled, ...CORE_MODULE_SLUGS]);

  // Iteratively remove modules whose dependencies are absent.
  let changed = true;
  while (changed) {
    changed = false;
    for (const slug of [...set]) {
      const mod = MODULE_BY_SLUG[slug];
      if (!mod) {
        set.delete(slug);
        changed = true;
        continue;
      }
      if (mod.isCore) continue;
      for (const dep of mod.dependencies) {
        if (!set.has(dep)) {
          set.delete(slug);
          changed = true;
          break;
        }
      }
    }
  }

  return MODULE_SLUGS.filter((s) => set.has(s));
}

/** Modules that would break if `slug` were disabled. */
export function dependentModules(slug: string): string[] {
  return ALL_MODULES.filter((m) => m.dependencies.includes(slug)).map(
    (m) => m.slug,
  );
}
