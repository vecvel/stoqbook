import "server-only";

import { db } from "@/db";
import type { BusinessContext } from "@/lib/authz/context";

import { parseWorkbook } from "./workbook";
import type { ColumnSpec, RowResult, SheetSpec } from "./types";

/**
 * Import execution (spec-driven).
 *
 * Two rules shape this:
 *
 *  1. **Validate everything before writing anything.** An operator uploading 400
 *     products should learn about all 12 bad rows at once, not the first one.
 *  2. **All or nothing.** The whole file imports in one transaction. A partial
 *     import leaves the catalogue in a state nobody can reason about, and
 *     re-uploading the corrected file would then duplicate the rows that did
 *     land.
 */

const MAX_ROWS = 5000;

export interface ImportReport {
  slug: string;
  totalRows: number;
  imported: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  rows: RowResult[];
  unknownHeaders: string[];
  missingHeaders: string[];
  /** Set when nothing was written, with the reason. */
  abortedReason?: string;
}

/* -------------------------------------------------------------------------- */
/* Cell coercion                                                              */
/* -------------------------------------------------------------------------- */

const TRUTHY = new Set(["yes", "y", "true", "1", "on", "active", "enabled"]);
const FALSY = new Set(["no", "n", "false", "0", "off", "inactive", "disabled"]);

interface Coerced {
  value: unknown;
  error?: string;
}

function coerce(
  column: ColumnSpec,
  raw: unknown,
  references: Record<string, Map<string, string>>,
): Coerced {
  const empty =
    raw === null || raw === undefined || String(raw).trim() === "";

  if (empty) {
    if (column.required) return { value: null, error: `${column.header} is required.` };
    return { value: null };
  }

  const text = String(raw).trim();

  switch (column.type) {
    case "text":
      return { value: text };

    case "money":
    case "quantity":
    case "number":
    case "integer": {
      /* Strip thousands separators and a currency symbol: a cell copied from
         another system routinely arrives as "1,250.00" or "₹1,250". */
      const cleaned = text.replace(/[,\s₹$€£]/g, "");
      const n = Number(cleaned);
      if (!Number.isFinite(n)) {
        return { value: null, error: `${column.header} must be a number (got "${text}").` };
      }
      if (n < 0 && column.type !== "number") {
        return { value: null, error: `${column.header} cannot be negative.` };
      }
      return { value: column.type === "integer" ? Math.trunc(n) : n };
    }

    case "boolean": {
      const lower = text.toLowerCase();
      if (TRUTHY.has(lower)) return { value: true };
      if (FALSY.has(lower)) return { value: false };
      return { value: null, error: `${column.header} must be Yes or No (got "${text}").` };
    }

    case "date": {
      if (raw instanceof Date) return { value: raw };
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) {
        return {
          value: null,
          error: `${column.header} is not a date (got "${text}"). Use YYYY-MM-DD.`,
        };
      }
      return { value: parsed };
    }

    case "enum": {
      const match = column.options?.find(
        (o) => o.toLowerCase() === text.toLowerCase(),
      );
      if (!match) {
        return {
          value: null,
          error: `${column.header} must be one of ${column.options?.join(", ")} (got "${text}").`,
        };
      }
      return { value: match };
    }

    case "lookup": {
      const map = references[column.lookup?.name ?? ""];
      const id = map?.get(text.toLowerCase());
      if (id) return { value: id };
      if (column.lookup?.createMissing) {
        // The row importer creates it and caches the id back into the map.
        return { value: { __create: text } };
      }
      return {
        value: null,
        error: `${column.header} "${text}" was not found. Create it first, then re-import.`,
      };
    }

    default:
      return { value: text };
  }
}

/* -------------------------------------------------------------------------- */

export async function runImport(
  spec: SheetSpec,
  ctx: BusinessContext,
  data: ArrayBuffer,
): Promise<ImportReport> {
  const parsed = await parseWorkbook(spec, data);

  const base: ImportReport = {
    slug: spec.slug,
    totalRows: parsed.rows.length,
    imported: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    rows: [],
    unknownHeaders: parsed.unknownHeaders,
    missingHeaders: parsed.missingHeaders,
  };

  if (parsed.missingHeaders.length > 0) {
    return {
      ...base,
      abortedReason: `The file is missing required column(s): ${parsed.missingHeaders.join(", ")}. Download the template to see the expected headers.`,
    };
  }

  if (parsed.rows.length === 0) {
    return { ...base, abortedReason: "The file has no data rows." };
  }

  if (parsed.rows.length > MAX_ROWS) {
    return {
      ...base,
      abortedReason: `The file has ${parsed.rows.length} rows; the limit is ${MAX_ROWS}. Split it and import in batches.`,
    };
  }

  const references = spec.loadReferences
    ? await spec.loadReferences(ctx, db)
    : {};

  /* ---- Pass 1: coerce and validate every row, writing nothing ---------- */
  const prepared: { row: number; values: Record<string, unknown>; errors: string[] }[] =
    [];

  for (const { row, values } of parsed.rows) {
    const errors: string[] = [];
    const clean: Record<string, unknown> = {};

    for (const column of spec.columns) {
      const { value, error } = coerce(column, values[column.key], references);
      if (error) errors.push(error);
      else clean[column.key] = value;
    }

    prepared.push({ row, values: clean, errors });
  }

  const invalid = prepared.filter((p) => p.errors.length > 0);
  if (invalid.length > 0) {
    return {
      ...base,
      failed: invalid.length,
      rows: prepared.map((p) => ({
        row: p.row,
        ok: p.errors.length === 0,
        label: String(p.values[spec.columns[0].key] ?? `Row ${p.row}`),
        errors: p.errors,
      })),
      abortedReason: `${invalid.length} of ${prepared.length} row(s) have problems. Nothing was imported — fix them and upload again.`,
    };
  }

  /* ---- Pass 2: write, all in one transaction --------------------------- */
  const results: RowResult[] = [];

  try {
    await db.transaction(async (tx) => {
      for (const { row, values } of prepared) {
        const outcome = await spec.importRow(values, {
          ctx,
          client: tx,
          references,
        });
        results.push({
          row,
          ok: true,
          label: outcome.label,
          action: outcome.action,
          errors: [],
        });
      }
    });
  } catch (error) {
    /* A failure here is a rule the spreadsheet could not know about — a
       duplicate SKU, a limit reached. The row that failed is the one after the
       last success, which is what the operator needs told. */
    const failedRow = prepared[results.length];
    const message = error instanceof Error ? error.message : String(error);

    return {
      ...base,
      failed: 1,
      rows: [
        ...results.map((r) => ({ ...r, action: undefined, ok: false, errors: [] })),
        {
          row: failedRow?.row ?? 0,
          ok: false,
          label: String(failedRow?.values[spec.columns[0].key] ?? "—"),
          errors: [message],
        },
      ],
      abortedReason: `Row ${failedRow?.row ?? "?"} was rejected: ${message}. The whole file was rolled back, so nothing changed.`,
    };
  }

  return {
    ...base,
    rows: results,
    imported: results.length,
    created: results.filter((r) => r.action === "created").length,
    updated: results.filter((r) => r.action === "updated").length,
    skipped: results.filter((r) => r.action === "skipped").length,
  };
}
