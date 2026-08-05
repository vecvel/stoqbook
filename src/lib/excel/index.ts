import "server-only";

import { canAccess, hasPermission } from "@/lib/authz/context";
import type { BusinessContext } from "@/lib/authz/context";

import { customersSpec } from "./specs/customers";
import { openingStockSpec } from "./specs/opening-stock";
import { productsSpec } from "./specs/products";
import { suppliersSpec } from "./specs/suppliers";
import type { SheetSpec } from "./types";

/**
 * The spreadsheet registry.
 *
 * Routes and UI resolve a spec by slug from here, so adding a new importable
 * entity is one file plus one line — the template, the validation, the import
 * and the export all follow from the spec.
 */
const SPECS: SheetSpec[] = [
  productsSpec,
  openingStockSpec,
  customersSpec,
  suppliersSpec,
];

export const SPEC_BY_SLUG: Record<string, SheetSpec> = Object.fromEntries(
  SPECS.map((s) => [s.slug, s]),
);

export const ALL_SPECS = SPECS;

/** Whether this caller may import with the given spec. */
export function canImport(ctx: BusinessContext, spec: SheetSpec): boolean {
  if (!hasPermission(ctx, spec.importPermission)) return false;
  if (spec.importFeature && !canAccess(ctx, { feature: spec.importFeature })) {
    return false;
  }
  return true;
}

/** Whether this caller may export with the given spec. */
export function canExport(ctx: BusinessContext, spec: SheetSpec): boolean {
  if (!spec.exportRows) return false;
  if (!hasPermission(ctx, spec.exportPermission)) return false;
  if (spec.exportFeature && !canAccess(ctx, { feature: spec.exportFeature })) {
    return false;
  }
  return true;
}

export { runImport, type ImportReport } from "./import";
export { buildExport, buildTemplate, parseWorkbook } from "./workbook";
export type { ColumnSpec, RowResult, SheetSpec } from "./types";
