"use server";

import { redirect } from "next/navigation";
import { and, count, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  brands,
  categories,
  products,
  salesInvoiceItems,
  taxGroups,
  units,
} from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/authz/errors";
import { slugify } from "@/lib/format";
import { isNegative } from "@/lib/money";
import { auditEvent, diff } from "@/lib/services/audit";
import { nextNumber } from "@/lib/services/numbering";
import { loadSettings, readBoolean, readString } from "@/lib/services/settings";
import { assertWithinLimit } from "@/lib/services/business";
import {
  bool,
  dateOrNull,
  decimalStr,
  failure,
  optionalDecimal,
  optionalStr,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

/* -------------------------------------------------------------------------- */
/* Products                                                                   */
/* -------------------------------------------------------------------------- */

export async function saveProduct(
  _prev: ActionResult<{ id: string }>,
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const id = uuid(form, "id");
    const ctx = await requirePermission(
      id ? "products.update" : "products.create",
    );

    const name = str(form, "name");
    if (!name) return failure("Product name is required.", { name: ["Required."] });

    const settings = await loadSettings({ businessId: ctx.business.id });
    const autoSku = readBoolean(settings, "products.auto_generate_sku");
    const enforceBarcodeUnique = readBoolean(
      settings,
      "products.barcode_unique",
    );

    let sku = str(form, "sku");
    if (!sku) {
      if (!autoSku && !id) {
        return failure("SKU is required.", { sku: ["Required."] });
      }
      if (!id) {
        const prefix = readString(settings, "products.sku_prefix", "SKU");
        sku = await nextNumber(ctx.business.id, "product");
        // Honour the configured prefix over the sequence default.
        sku = sku.replace(/^[A-Z]+/, prefix);
      }
    }

    const barcode = optionalStr(form, "barcode");
    const costPrice = decimalStr(form, "cost_price");
    const sellingPrice = decimalStr(form, "selling_price");

    if (isNegative(costPrice)) {
      return failure("Cost price cannot be negative.", {
        cost_price: ["Must be zero or more."],
      });
    }
    if (isNegative(sellingPrice)) {
      return failure("Selling price cannot be negative.", {
        selling_price: ["Must be zero or more."],
      });
    }

    /* Uniqueness — scoped to the tenant (07-products.md § Business Rules). */
    const skuClash = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.tenant_id, ctx.business.id),
          eq(products.sku, sku),
          id ? ne(products.id, id) : undefined,
        ),
      )
      .limit(1);
    if (skuClash.length > 0) {
      return failure("That SKU is already in use.", { sku: ["Already used."] });
    }

    if (barcode && enforceBarcodeUnique) {
      const barcodeClash = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.tenant_id, ctx.business.id),
            eq(products.barcode, barcode),
            id ? ne(products.id, id) : undefined,
          ),
        )
        .limit(1);
      if (barcodeClash.length > 0) {
        return failure("That barcode is already in use.", {
          barcode: ["Already used."],
        });
      }
    }

    const values = {
      tenant_id: ctx.business.id,
      sku,
      barcode,
      name,
      description: optionalStr(form, "description"),
      type: (str(form, "type") || "physical") as
        | "physical"
        | "digital"
        | "service"
        | "bundle"
        | "composite"
        | "variant_parent",
      status: (str(form, "status") || "active") as
        | "draft"
        | "active"
        | "inactive"
        | "discontinued"
        | "archived",
      category_id: uuid(form, "category_id"),
      brand_id: uuid(form, "brand_id"),
      unit_id: uuid(form, "unit_id"),
      tax_group_id: uuid(form, "tax_group_id"),
      cost_price: costPrice,
      selling_price: sellingPrice,
      wholesale_price: optionalDecimal(form, "wholesale_price"),
      discount_price: optionalDecimal(form, "discount_price"),
      discount_starts_at: dateOrNull(form, "discount_starts_at"),
      discount_ends_at: dateOrNull(form, "discount_ends_at"),
      track_inventory: bool(form, "track_inventory"),
      track_batches: bool(form, "track_batches"),
      min_stock: decimalStr(form, "min_stock"),
      reorder_level: decimalStr(form, "min_stock"),
      max_stock: optionalDecimal(form, "max_stock"),
      reorder_quantity: optionalDecimal(form, "reorder_quantity"),
      primary_image_url: optionalStr(form, "primary_image_url"),
    };

    if (id) {
      const [before] = await db
        .select()
        .from(products)
        .where(
          and(eq(products.id, id), eq(products.tenant_id, ctx.business.id)),
        )
        .limit(1);
      if (!before) throw NotFoundError("Product not found.");

      const [after] = await db
        .update(products)
        .set({ ...values, updated_at: new Date(), updated_by: ctx.user.id })
        .where(eq(products.id, id))
        .returning();

      const changes = diff(before, after);
      await auditEvent(ctx, {
        event:
          changes.selling_price || changes.cost_price
            ? "ProductPriceChanged"
            : "ProductUpdated",
        moduleSlug: "products",
        entityType: "product",
        entityId: id,
        summary: `Updated ${after.name}`,
        payload: { changes },
      });
    } else {
      // Plan limits are enforced before the insert, not after.
      await assertWithinLimit(ctx.business.id, "products", ctx.entitlements);

      const [created] = await db
        .insert(products)
        .values({ ...values, created_by: ctx.user.id })
        .returning();

      await auditEvent(ctx, {
        event: "ProductCreated",
        moduleSlug: "products",
        entityType: "product",
        entityId: created.id,
        summary: `Created ${created.name} (${created.sku})`,
      });

      revalidate("/products", "/inventory", "/dashboard");
      redirect(`/products/${created.id}`);
    }

    revalidate("/products", `/products/${id}`, "/inventory");
    return success({ id: id! }, "Product saved.");
  });
}

export async function archiveProduct(
  productId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.archive");

    const [product] = await db
      .select()
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.tenant_id, ctx.business.id)),
      )
      .limit(1);
    if (!product) throw NotFoundError("Product not found.");

    await db
      .update(products)
      .set({ status: "archived", updated_at: new Date(), updated_by: ctx.user.id })
      .where(eq(products.id, productId));

    await auditEvent(ctx, {
      event: "ProductArchived",
      moduleSlug: "products",
      entityType: "product",
      entityId: productId,
      summary: `Archived ${product.name}`,
    });

    revalidate("/products", `/products/${productId}`);
    return success(undefined, `${product.name} archived.`);
  });
}

export async function restoreProduct(
  productId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.update");
    await db
      .update(products)
      .set({ status: "active", updated_at: new Date(), updated_by: ctx.user.id })
      .where(
        and(eq(products.id, productId), eq(products.tenant_id, ctx.business.id)),
      );
    revalidate("/products", `/products/${productId}`);
    return success(undefined, "Product restored.");
  });
}

/**
 * Soft-deletes a product. Blocked when the product appears on any sale, so
 * historical documents always resolve (06-database-architecture.md).
 */
export async function deleteProduct(
  productId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.delete");

    const [used] = await db
      .select({ value: count() })
      .from(salesInvoiceItems)
      .where(eq(salesInvoiceItems.product_id, productId));

    if (Number(used?.value ?? 0) > 0) {
      throw BusinessRuleError(
        "This product appears on sales invoices and cannot be deleted. Archive it instead.",
        "PRODUCT_REFERENCED",
      );
    }

    await db
      .update(products)
      .set({
        deleted_at: new Date(),
        deleted_by: ctx.user.id,
        status: "archived",
      })
      .where(
        and(eq(products.id, productId), eq(products.tenant_id, ctx.business.id)),
      );

    await auditEvent(ctx, {
      event: "ProductArchived",
      moduleSlug: "products",
      entityType: "product",
      entityId: productId,
      summary: "Product deleted",
    });

    revalidate("/products");
    redirect("/products");
  });
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export async function saveCategory(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.manage_taxonomy");
    const id = uuid(form, "id");
    const name = str(form, "name");
    if (!name) return failure("Category name is required.");

    const parentId = uuid(form, "parent_id");

    // A category cannot be its own ancestor.
    if (parentId && id && parentId === id) {
      return failure("A category cannot be its own parent.");
    }

    let path = slugify(name);
    let depth = 0;
    if (parentId) {
      const [parent] = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.id, parentId),
            eq(categories.tenant_id, ctx.business.id),
          ),
        )
        .limit(1);
      if (!parent) return failure("Parent category not found.");
      path = `${parent.path}/${slugify(name)}`;
      depth = parent.depth + 1;
    }

    const slug = id ? slugify(`${name}-${id.slice(0, 4)}`) : slugify(path);

    if (id) {
      await db
        .update(categories)
        .set({
          name,
          parent_id: parentId,
          description: optionalStr(form, "description"),
          path,
          depth,
          is_active: bool(form, "is_active"),
          updated_at: new Date(),
          updated_by: ctx.user.id,
        })
        .where(
          and(eq(categories.id, id), eq(categories.tenant_id, ctx.business.id)),
        );
    } else {
      await db.insert(categories).values({
        tenant_id: ctx.business.id,
        parent_id: parentId,
        name,
        slug,
        description: optionalStr(form, "description"),
        path,
        depth,
        created_by: ctx.user.id,
      });
    }

    await auditEvent(ctx, {
      event: id ? "ProductUpdated" : "ProductCreated",
      moduleSlug: "products",
      entityType: "category",
      entityId: id ?? undefined,
      summary: `${id ? "Updated" : "Created"} category ${name}`,
    });

    revalidate("/products/categories", "/products");
    return success(undefined, "Category saved.");
  });
}

export async function deleteCategory(
  categoryId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.manage_taxonomy");

    const [childCount] = await db
      .select({ value: count() })
      .from(categories)
      .where(eq(categories.parent_id, categoryId));
    if (Number(childCount?.value ?? 0) > 0) {
      throw ConflictError(
        "This category has subcategories. Remove or move them first.",
      );
    }

    // Products keep existing; their category reference is simply cleared.
    await db
      .update(products)
      .set({ category_id: null })
      .where(
        and(
          eq(products.category_id, categoryId),
          eq(products.tenant_id, ctx.business.id),
        ),
      );

    await db
      .delete(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.tenant_id, ctx.business.id),
        ),
      );

    revalidate("/products/categories", "/products");
    return success(undefined, "Category deleted.");
  });
}

/* -------------------------------------------------------------------------- */
/* Brands                                                                     */
/* -------------------------------------------------------------------------- */

export async function saveBrand(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.manage_taxonomy");
    const id = uuid(form, "id");
    const name = str(form, "name");
    if (!name) return failure("Brand name is required.");

    if (id) {
      await db
        .update(brands)
        .set({
          name,
          description: optionalStr(form, "description"),
          is_active: bool(form, "is_active"),
          updated_at: new Date(),
          updated_by: ctx.user.id,
        })
        .where(and(eq(brands.id, id), eq(brands.tenant_id, ctx.business.id)));
    } else {
      const clash = await db
        .select({ id: brands.id })
        .from(brands)
        .where(
          and(
            eq(brands.tenant_id, ctx.business.id),
            eq(brands.slug, slugify(name)),
          ),
        )
        .limit(1);
      if (clash.length > 0) return failure("That brand already exists.");

      await db.insert(brands).values({
        tenant_id: ctx.business.id,
        name,
        slug: slugify(name),
        description: optionalStr(form, "description"),
        created_by: ctx.user.id,
      });
    }

    revalidate("/products/brands", "/products");
    return success(undefined, "Brand saved.");
  });
}

export async function deleteBrand(brandId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.manage_taxonomy");
    await db
      .update(products)
      .set({ brand_id: null })
      .where(
        and(eq(products.brand_id, brandId), eq(products.tenant_id, ctx.business.id)),
      );
    await db
      .delete(brands)
      .where(and(eq(brands.id, brandId), eq(brands.tenant_id, ctx.business.id)));
    revalidate("/products/brands", "/products");
    return success(undefined, "Brand deleted.");
  });
}

/* -------------------------------------------------------------------------- */
/* Units                                                                      */
/* -------------------------------------------------------------------------- */

export async function saveUnit(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.manage_taxonomy");
    const id = uuid(form, "id");
    const name = str(form, "name");
    const shortName = str(form, "short_name");
    if (!name || !shortName) {
      return failure("Name and short name are required.");
    }

    const values = {
      name,
      short_name: shortName,
      allow_decimal: bool(form, "allow_decimal"),
      is_active: bool(form, "is_active"),
    };

    if (id) {
      await db
        .update(units)
        .set({ ...values, updated_at: new Date() })
        .where(and(eq(units.id, id), eq(units.tenant_id, ctx.business.id)));
    } else {
      const clash = await db
        .select({ id: units.id })
        .from(units)
        .where(
          and(
            eq(units.tenant_id, ctx.business.id),
            eq(units.short_name, shortName),
          ),
        )
        .limit(1);
      if (clash.length > 0) {
        return failure(`A unit with short name "${shortName}" already exists.`);
      }
      await db.insert(units).values({ tenant_id: ctx.business.id, ...values });
    }

    revalidate("/products/units", "/products");
    return success(undefined, "Unit saved.");
  });
}

export async function deleteUnit(unitId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.manage_taxonomy");

    const [inUse] = await db
      .select({ value: count() })
      .from(products)
      .where(
        and(eq(products.unit_id, unitId), eq(products.tenant_id, ctx.business.id)),
      );
    if (Number(inUse?.value ?? 0) > 0) {
      throw ConflictError(
        "This unit is assigned to products. Reassign them before deleting.",
      );
    }

    await db
      .delete(units)
      .where(and(eq(units.id, unitId), eq(units.tenant_id, ctx.business.id)));
    revalidate("/products/units");
    return success(undefined, "Unit deleted.");
  });
}

/* -------------------------------------------------------------------------- */
/* Tax groups                                                                 */
/* -------------------------------------------------------------------------- */

export async function saveTaxGroup(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.manage_taxes");
    const id = uuid(form, "id");
    const name = str(form, "name");
    const rate = decimalStr(form, "rate");
    if (!name) return failure("Tax group name is required.");
    if (isNegative(rate)) return failure("Tax rate cannot be negative.");

    const mode = (str(form, "mode") || "exclusive") as "inclusive" | "exclusive";
    const halfRate = Number(rate) / 2;
    // Indian GST splits evenly into CGST and SGST; anything else is a single
    // component. The business can refine the split later.
    const components =
      Number(rate) > 0
        ? [
            { name: "CGST", rate: halfRate },
            { name: "SGST", rate: halfRate },
          ]
        : [];

    const values = {
      name,
      rate,
      mode,
      components,
      is_active: bool(form, "is_active"),
    };

    if (id) {
      await db
        .update(taxGroups)
        .set({ ...values, updated_at: new Date() })
        .where(
          and(eq(taxGroups.id, id), eq(taxGroups.tenant_id, ctx.business.id)),
        );
    } else {
      await db
        .insert(taxGroups)
        .values({ tenant_id: ctx.business.id, ...values });
    }

    revalidate("/products/taxes", "/products");
    return success(undefined, "Tax group saved.");
  });
}

export async function deleteTaxGroup(taxId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products.manage_taxes");

    const [inUse] = await db
      .select({ value: count() })
      .from(products)
      .where(
        and(
          eq(products.tax_group_id, taxId),
          eq(products.tenant_id, ctx.business.id),
        ),
      );
    if (Number(inUse?.value ?? 0) > 0) {
      throw ConflictError(
        "This tax group is assigned to products. Reassign them before deleting.",
      );
    }

    await db
      .delete(taxGroups)
      .where(and(eq(taxGroups.id, taxId), eq(taxGroups.tenant_id, ctx.business.id)));
    revalidate("/products/taxes");
    return success(undefined, "Tax group deleted.");
  });
}
