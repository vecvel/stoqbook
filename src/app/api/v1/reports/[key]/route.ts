import { NextResponse, type NextRequest } from "next/server";

import { failFrom, ok } from "@/lib/api/response";
import { canAccess } from "@/lib/authz/context";
import { NotFoundError } from "@/lib/authz/errors";
import { requirePermission } from "@/lib/authz/guard";
import { REPORT_BY_KEY } from "@/lib/registry";
import { auditEvent } from "@/lib/services/audit";
import { IMPLEMENTED_REPORTS, runReport, toCsv } from "@/lib/services/reports";

/**
 * Runs a report and returns it as JSON or CSV.
 *
 * Export respects the same permission gate as viewing, plus `reports.export`,
 * and every run is recorded in the audit log (14-reporting.md § Report Audit).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key: rawKey } = await params;
    const key = decodeURIComponent(rawKey);

    const definition = REPORT_BY_KEY[key];
    if (!definition || !IMPLEMENTED_REPORTS.has(key)) {
      throw NotFoundError("Report not found.");
    }

    const ctx = await requirePermission(definition.permission, { onDenied: "throw",
      module: definition.moduleSlug,
      feature: definition.feature,
    });

    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format") ?? "json";

    if (format === "csv") {
      // Exporting is a separate, explicitly granted capability.
      const canExport = canAccess(ctx, {
        module: "reports",
        feature: "reports.export",
        permission: "reports.export",
      });
      if (!canExport) {
        return failFrom(
          new Error("Export requires the reports.export permission."),
        );
      }
    }

    const parseDate = (value: string | null) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const filters = {
      from: parseDate(searchParams.get("from")),
      to: parseDate(searchParams.get("to")),
      storeId: searchParams.get("store"),
      warehouseId: searchParams.get("warehouse"),
      categoryId: searchParams.get("category"),
      limit: Number(searchParams.get("limit")) || undefined,
    };

    const started = Date.now();
    const result = await runReport(ctx, key, filters);
    const duration = Date.now() - started;

    await auditEvent(ctx, {
      event: format === "csv" ? "ReportExported" : "ReportGenerated",
      moduleSlug: "reports",
      entityType: "report",
      entityId: key,
      summary: `${definition.name} (${result.rowCount} rows, ${duration}ms)`,
      payload: { filters, format, row_count: result.rowCount },
    });

    if (format === "csv") {
      const filename = `${key.replace(/\./g, "-")}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      return new NextResponse(toCsv(result), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "no-store",
        },
      });
    }

    return ok(
      { columns: result.columns, rows: result.rows, totals: result.totals },
      {
        message: `${definition.name} generated.`,
        meta: {
          report: key,
          name: definition.name,
          rowCount: result.rowCount,
          truncated: result.truncated,
          summary: result.summary,
          durationMs: duration,
        },
      },
    );
  } catch (error) {
    return failFrom(error);
  }
}
