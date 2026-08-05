import type { BusinessContext } from "@/lib/authz/context";
import type { DbClient, Transaction } from "@/db";

/**
 * Spreadsheet import/export contracts.
 *
 * One declarative spec per entity drives three things at once: the downloadable
 * template, the validation of an uploaded file, and the export. Keeping them in
 * one declaration is what stops the three from drifting — a template that offers
 * a column the importer ignores is worse than no template at all.
 */

export type CellType =
  | "text"
  | "number"
  | "money"
  | "quantity"
  | "integer"
  | "date"
  | "boolean"
  | "enum"
  /** Matched against an existing record by name or code. */
  | "lookup";

export interface ColumnSpec {
  /** Header text written into the template, and matched on import. */
  header: string;
  /** Key in the parsed row object. */
  key: string;
  type: CellType;
  required?: boolean;
  /** Shown in the template's Notes sheet. */
  help?: string;
  /** Example value for the sample row. */
  example?: string | number | boolean;
  /** Allowed values for `enum`. Becomes a dropdown in the template. */
  options?: string[];
  /** Column width in the generated template. */
  width?: number;
  /**
   * For `lookup`: the reference list this column resolves against. Resolution is
   * case-insensitive and matches on name or code.
   */
  lookup?: {
    /** Identifies the resolver in the spec's `references`. */
    name: string;
    /**
     * Whether an unmatched value may be created on the fly.
     *
     * Defaults to false, and that default is deliberate: silently creating a
     * "Painkilers" category because someone mistyped it turns one bad cell into
     * permanent catalogue debt. The importer reports the unknown value instead
     * and the operator decides.
     */
    createMissing?: boolean;
  };
}

/** A resolved lookup table: lowercased name/code → id. */
export type ReferenceMap = Map<string, string>;

export interface ImportContext {
  ctx: BusinessContext;
  /**
   * Always an open transaction, never the root handle.
   *
   * Typed as `Transaction` rather than `DbClient` so a row importer can call the
   * ledger-posting services, which require one — and so the type states the
   * all-or-nothing guarantee instead of leaving it to a comment.
   */
  client: Transaction;
  /** Keyed by `ColumnSpec.lookup.name`. */
  references: Record<string, ReferenceMap>;
}

/** One row's outcome. */
export interface RowResult {
  /** 1-based row number in the sheet, matching what the operator sees. */
  row: number;
  ok: boolean;
  /** Human-readable identity for the report, e.g. the SKU. */
  label: string;
  action?: "created" | "updated" | "skipped";
  errors: string[];
}

export interface SheetSpec {
  /** URL-safe identifier, e.g. "products". */
  slug: string;
  /** Sheet name and page title, e.g. "Products". */
  name: string;
  description: string;
  /** Registry permission required to import. */
  importPermission: string;
  /** Registry permission required to export. */
  exportPermission: string;
  /** Feature entitlements, if the module gates them. */
  importFeature?: string;
  exportFeature?: string;
  columns: ColumnSpec[];
  /** Extra guidance rendered on the template's Notes sheet. */
  notes?: string[];

  /** Loads the lookup tables this spec's columns need. */
  loadReferences?: (ctx: BusinessContext, client: DbClient) => Promise<Record<string, ReferenceMap>>;

  /**
   * Writes one validated row. Throws to fail just that row.
   *
   * Called inside the import transaction, so a throw that escapes rolls the
   * whole file back — the importer catches per row and decides.
   */
  importRow: (
    row: Record<string, unknown>,
    context: ImportContext,
  ) => Promise<{ label: string; action: "created" | "updated" | "skipped" }>;

  /** Rows for an export, already shaped to the column keys. */
  exportRows?: (
    ctx: BusinessContext,
    options: { storeId?: string | null },
  ) => Promise<Record<string, unknown>[]>;
}
