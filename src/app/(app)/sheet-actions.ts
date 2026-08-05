"use server";

import { requirePermission } from "@/lib/authz/guard";
import { auditEvent } from "@/lib/services/audit";
import { canImport, runImport, SPEC_BY_SLUG, type ImportReport } from "@/lib/excel";
import {
  failure,
  revalidate,
  runAction,
  success,
  type ActionResult,
} from "@/lib/actions";

/** Upload size ceiling. 5,000 rows of products is well under this. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Imports a spreadsheet.
 *
 * Returns the full report rather than just a message: the operator needs to see
 * which rows failed and why, and a toast cannot carry that.
 */
export async function importSheet(
  _prev: ActionResult<ImportReport>,
  form: FormData,
): Promise<ActionResult<ImportReport>> {
  return runAction(async () => {
    const slug = String(form.get("slug") ?? "");
    const spec = SPEC_BY_SLUG[slug];
    if (!spec) return failure("Unknown import type.");

    const ctx = await requirePermission(spec.importPermission, {
      feature: spec.importFeature,
    });
    if (!canImport(ctx, spec)) {
      return failure("You cannot import this data.");
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return failure("Choose a file to import.", { file: ["Required."] });
    }
    if (file.size > MAX_BYTES) {
      return failure(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_BYTES / 1024 / 1024} MB.`,
      );
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return failure(
        "Only .xlsx files are supported. If you have a .csv or .xls, open it in Excel and save as .xlsx.",
      );
    }

    const report = await runImport(spec, ctx, await file.arrayBuffer());

    /* Audited either way. A rejected import is as much a fact about who did what
       as a successful one, and the row counts are what makes a later "where did
       these 400 products come from?" answerable. */
    await auditEvent(ctx, {
      event: report.abortedReason ? "ImportRejected" : "ImportCompleted",
      moduleSlug: spec.slug,
      entityType: "import",
      summary: report.abortedReason
        ? `${spec.name} import rejected: ${report.abortedReason}`
        : `${spec.name} import: ${report.created} created, ${report.updated} updated, ${report.skipped} skipped`,
      payload: {
        file: file.name,
        totalRows: report.totalRows,
        created: report.created,
        updated: report.updated,
        skipped: report.skipped,
        failed: report.failed,
      },
    });

    if (report.abortedReason) {
      return failure(report.abortedReason, undefined, report);
    }

    revalidate(
      "/products",
      "/inventory",
      "/customers",
      "/suppliers",
      `/${spec.slug}`,
    );

    return success(
      report,
      `${report.imported} row(s) imported — ${report.created} created, ${report.updated} updated${report.skipped > 0 ? `, ${report.skipped} skipped` : ""}.`,
    );
  });
}
