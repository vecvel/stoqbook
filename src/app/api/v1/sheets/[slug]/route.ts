import { type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  brands,
  categories,
  customerGroups,
  taxGroups,
  units,
  warehouses,
} from "@/db/schema";
import { failFrom, fail } from "@/lib/api/response";
import {
  buildExport,
  buildTemplate,
  canExport,
  canImport,
  SPEC_BY_SLUG,
} from "@/lib/excel";
import { requirePermission } from "@/lib/authz/guard";

/**
 * GET /api/v1/sheets/:slug?mode=template|export
 *
 * One route serves both files because they share the spec, and a template that
 * drifted from the export's column order would be worse than useless — an
 * operator round-trips export → edit → import, and that only works if the two
 * agree exactly.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const spec = SPEC_BY_SLUG[slug];
    if (!spec) return fail("Unknown sheet.", { status: 404 });

    const mode = request.nextUrl.searchParams.get("mode") ?? "template";

    /* The template is gated on the *import* permission: it describes how to write
       data, so handing it to someone who cannot import is just confusing. */
    const ctx = await requirePermission(
      mode === "export" ? spec.exportPermission : spec.importPermission,
      {
        feature: mode === "export" ? spec.exportFeature : spec.importFeature,
        onDenied: "throw",
      },
    );

    if (mode === "export") {
      if (!canExport(ctx, spec)) {
        return fail("This sheet cannot be exported.", { status: 403 });
      }

      const rows = await spec.exportRows!(ctx, {
        storeId: ctx.activeStore?.id ?? null,
      });
      const buffer = await buildExport(spec, rows, {
        businessName: ctx.business.name,
        generatedBy: ctx.user.full_name,
        generatedAt: new Date(),
      });

      return xlsx(buffer, `${slug}-${stamp()}.xlsx`);
    }

    if (!canImport(ctx, spec)) {
      return fail("This sheet cannot be imported.", { status: 403 });
    }

    /* Lookup values are baked into the template as dropdowns, so the operator
       picks a category that exists instead of guessing and failing on upload. */
    const references = await templateReferences(ctx.business.id, slug);
    const buffer = await buildTemplate(spec, references);

    return xlsx(buffer, `${slug}-template.xlsx`);
  } catch (error) {
    return failFrom(error);
  }
}

function xlsx(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      // A stale template is a support call; never cache these.
      "cache-control": "no-store",
    },
  });
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Human-readable values for each spec's dropdowns. */
async function templateReferences(
  businessId: string,
  slug: string,
): Promise<Record<string, string[]>> {
  if (slug === "products") {
    const [cats, brs, uns, taxes] = await Promise.all([
      db
        .select({ v: categories.name })
        .from(categories)
        .where(eq(categories.tenant_id, businessId)),
      db.select({ v: brands.name }).from(brands).where(eq(brands.tenant_id, businessId)),
      db.select({ v: units.short_name }).from(units).where(eq(units.tenant_id, businessId)),
      db
        .select({ v: taxGroups.name })
        .from(taxGroups)
        .where(eq(taxGroups.tenant_id, businessId)),
    ]);
    return {
      category: cats.map((r) => r.v),
      brand: brs.map((r) => r.v),
      unit: uns.map((r) => r.v),
      taxGroup: taxes.map((r) => r.v),
    };
  }

  if (slug === "opening-stock") {
    const whs = await db
      .select({ v: warehouses.code })
      .from(warehouses)
      .where(
        and(eq(warehouses.tenant_id, businessId), isNull(warehouses.deleted_at)),
      );
    /* Products are deliberately not a dropdown: a catalogue of thousands blows
       past Excel's inline-list limit, and the Notes sheet would be unreadable.
       The importer accepts SKU or name and reports anything it cannot match. */
    return { warehouse: whs.map((r) => r.v) };
  }

  if (slug === "customers") {
    const groups = await db
      .select({ v: customerGroups.name })
      .from(customerGroups)
      .where(eq(customerGroups.tenant_id, businessId));
    return { customerGroup: groups.map((r) => r.v) };
  }

  return {};
}
