"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldRow,
  FormActions,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toDateInput } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";

import { saveProduct } from "./actions";

export interface ProductFormOption {
  id: string;
  name: string;
}

export interface ProductFormValues {
  id?: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  type: string;
  status: string;
  categoryId: string;
  brandId: string;
  unitId: string;
  taxGroupId: string;
  costPrice: string;
  sellingPrice: string;
  wholesalePrice: string;
  discountPrice: string;
  discountStartsAt: string;
  discountEndsAt: string;
  trackInventory: boolean;
  trackBatches: boolean;
  minStock: string;
  maxStock: string;
  reorderQuantity: string;
  primaryImageUrl: string;
}

export const EMPTY_PRODUCT: ProductFormValues = {
  sku: "",
  barcode: "",
  name: "",
  description: "",
  type: "physical",
  status: "active",
  categoryId: "",
  brandId: "",
  unitId: "",
  taxGroupId: "",
  costPrice: "0",
  sellingPrice: "0",
  wholesalePrice: "",
  discountPrice: "",
  discountStartsAt: "",
  discountEndsAt: "",
  trackInventory: true,
  trackBatches: false,
  minStock: "0",
  maxStock: "",
  reorderQuantity: "",
  primaryImageUrl: "",
};

export function ProductForm({
  values,
  categories,
  brands,
  units,
  taxGroups,
  canViewCost,
  canManageBatches,
  currencySymbol,
  autoSku,
}: {
  values: ProductFormValues;
  categories: ProductFormOption[];
  brands: ProductFormOption[];
  units: ProductFormOption[];
  taxGroups: (ProductFormOption & { rate: string })[];
  canViewCost: boolean;
  canManageBatches: boolean;
  currencySymbol: string;
  autoSku: boolean;
}) {
  const [state, action] = useActionState<ActionResult<{ id: string }>, FormData>(
    saveProduct,
    { ok: true },
  );

  // Surface success feedback without navigating away on edit.
  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const errors = state.errors ?? {};
  const isEdit = Boolean(values.id);

  return (
    <form action={action} className="flex flex-col gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      {!state.ok ? <FormError message={state.message} /> : null}

      <FormSection
        title="General"
        description="Identity and classification for this product."
      >
        <Field label="Product name" htmlFor="name" error={errors.name} required>
          <Input
            id="name"
            name="name"
            defaultValue={values.name}
            placeholder="Tata Salt 1kg"
            required
            autoFocus={!isEdit}
          />
        </Field>

        <FieldRow cols={3}>
          <Field
            label="SKU"
            htmlFor="sku"
            error={errors.sku}
            hint={autoSku && !isEdit ? "Left blank, one is generated." : undefined}
            required={!autoSku || isEdit}
          >
            <Input
              id="sku"
              name="sku"
              defaultValue={values.sku}
              placeholder="GRC-0001"
              className="font-mono"
            />
          </Field>
          <Field label="Barcode" htmlFor="barcode" error={errors.barcode}>
            <Input
              id="barcode"
              name="barcode"
              defaultValue={values.barcode}
              placeholder="8901030510001"
              className="font-mono"
            />
          </Field>
          <Field label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue={values.status}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
              <option value="discontinued">Discontinued</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </FieldRow>

        <FieldRow cols={4}>
          <Field label="Category" htmlFor="category_id">
            <Select
              id="category_id"
              name="category_id"
              defaultValue={values.categoryId}
              placeholder="Uncategorised"
              options={categories}
            />
          </Field>
          <Field label="Brand" htmlFor="brand_id">
            <Select
              id="brand_id"
              name="brand_id"
              defaultValue={values.brandId}
              placeholder="No brand"
              options={brands}
            />
          </Field>
          <Field label="Unit" htmlFor="unit_id">
            <Select
              id="unit_id"
              name="unit_id"
              defaultValue={values.unitId}
              placeholder="Select unit"
              options={units}
            />
          </Field>
          <Field label="Product type" htmlFor="type">
            <select
              id="type"
              name="type"
              defaultValue={values.type}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="physical">Physical</option>
              <option value="digital">Digital</option>
              <option value="service">Service</option>
              <option value="bundle">Bundle</option>
            </select>
          </Field>
        </FieldRow>

        <Field label="Description" htmlFor="description">
          <Textarea
            id="description"
            name="description"
            defaultValue={values.description}
            rows={2}
            placeholder="Optional notes shown on the product page."
          />
        </Field>
      </FormSection>

      <FormSection
        title="Pricing and tax"
        description={`Amounts in ${currencySymbol}. Tax is applied at billing time.`}
      >
        <FieldRow cols={4}>
          {canViewCost ? (
            <Field
              label="Cost price"
              htmlFor="cost_price"
              error={errors.cost_price}
              hint="Used for profit and valuation."
            >
              <Input
                id="cost_price"
                name="cost_price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={values.costPrice}
              />
            </Field>
          ) : (
            <input type="hidden" name="cost_price" value={values.costPrice} />
          )}
          <Field
            label="Selling price"
            htmlFor="selling_price"
            error={errors.selling_price}
            required
          >
            <Input
              id="selling_price"
              name="selling_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={values.sellingPrice}
              required
            />
          </Field>
          <Field
            label="Wholesale price"
            htmlFor="wholesale_price"
            hint="Used for wholesale customers."
          >
            <Input
              id="wholesale_price"
              name="wholesale_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={values.wholesalePrice}
            />
          </Field>
          <Field label="Tax group" htmlFor="tax_group_id">
            <select
              id="tax_group_id"
              name="tax_group_id"
              defaultValue={values.taxGroupId}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="">No tax</option>
              {taxGroups.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({Number(t.rate)}%)
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>

        <FieldRow cols={3}>
          <Field
            label="Promotional price"
            htmlFor="discount_price"
            hint="Overrides the selling price while active."
          >
            <Input
              id="discount_price"
              name="discount_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={values.discountPrice}
            />
          </Field>
          <Field label="Promotion starts" htmlFor="discount_starts_at">
            <Input
              id="discount_starts_at"
              name="discount_starts_at"
              type="date"
              defaultValue={values.discountStartsAt}
            />
          </Field>
          <Field label="Promotion ends" htmlFor="discount_ends_at">
            <Input
              id="discount_ends_at"
              name="discount_ends_at"
              type="date"
              defaultValue={values.discountEndsAt}
            />
          </Field>
        </FieldRow>
      </FormSection>

      <FormSection
        title="Inventory"
        description="Stock is recorded through the inventory ledger, never edited directly."
      >
        <div className="flex flex-col gap-3">
          <ToggleRow
            name="track_inventory"
            label="Track inventory"
            description="Turn off for services and digital products."
            defaultChecked={values.trackInventory}
          />
          {canManageBatches ? (
            <ToggleRow
              name="track_batches"
              label="Track batches and expiry"
              description="Record batch numbers and expiry dates on receipt."
              defaultChecked={values.trackBatches}
            />
          ) : null}
        </div>

        <FieldRow cols={3}>
          <Field
            label="Minimum stock"
            htmlFor="min_stock"
            hint="Triggers the low stock alert."
          >
            <Input
              id="min_stock"
              name="min_stock"
              type="number"
              step="0.001"
              min="0"
              defaultValue={values.minStock}
            />
          </Field>
          <Field label="Maximum stock" htmlFor="max_stock">
            <Input
              id="max_stock"
              name="max_stock"
              type="number"
              step="0.001"
              min="0"
              defaultValue={values.maxStock}
            />
          </Field>
          <Field
            label="Reorder quantity"
            htmlFor="reorder_quantity"
            hint="Suggested purchase quantity."
          >
            <Input
              id="reorder_quantity"
              name="reorder_quantity"
              type="number"
              step="0.001"
              min="0"
              defaultValue={values.reorderQuantity}
            />
          </Field>
        </FieldRow>
      </FormSection>

      <FormSection title="Media" description="Optional product image.">
        <Field label="Image URL" htmlFor="primary_image_url">
          <Input
            id="primary_image_url"
            name="primary_image_url"
            type="url"
            defaultValue={values.primaryImageUrl}
            placeholder="https://…"
          />
        </Field>
      </FormSection>

      <FormActions>
        <Button asChild variant="outline" size="sm">
          <Link href={values.id ? `/products/${values.id}` : "/products"}>
            Cancel
          </Link>
        </Button>
        <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
          {isEdit ? "Save changes" : "Create product"}
        </SubmitButton>
      </FormActions>
    </form>
  );
}

function Select({
  id,
  name,
  defaultValue,
  placeholder,
  options,
}: {
  id: string;
  name: string;
  defaultValue: string;
  placeholder: string;
  options: ProductFormOption[];
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

function ToggleRow({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xs border border-border px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch name={name} defaultChecked={defaultChecked} className="mt-0.5" />
    </label>
  );
}

/** Maps a database row onto form values. */
export function toFormValues(row: {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  type: string;
  status: string;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  tax_group_id: string | null;
  cost_price: string;
  selling_price: string;
  wholesale_price: string | null;
  discount_price: string | null;
  discount_starts_at: Date | null;
  discount_ends_at: Date | null;
  track_inventory: boolean;
  track_batches: boolean;
  min_stock: string;
  max_stock: string | null;
  reorder_quantity: string | null;
  primary_image_url: string | null;
}): ProductFormValues {
  const trim = (v: string | null) =>
    v === null ? "" : String(Number(v) === 0 ? "" : Number(v));

  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode ?? "",
    name: row.name,
    description: row.description ?? "",
    type: row.type,
    status: row.status,
    categoryId: row.category_id ?? "",
    brandId: row.brand_id ?? "",
    unitId: row.unit_id ?? "",
    taxGroupId: row.tax_group_id ?? "",
    costPrice: String(Number(row.cost_price)),
    sellingPrice: String(Number(row.selling_price)),
    wholesalePrice: trim(row.wholesale_price),
    discountPrice: trim(row.discount_price),
    discountStartsAt: toDateInput(row.discount_starts_at),
    discountEndsAt: toDateInput(row.discount_ends_at),
    trackInventory: row.track_inventory,
    trackBatches: row.track_batches,
    minStock: String(Number(row.min_stock)),
    maxStock: trim(row.max_stock),
    reorderQuantity: trim(row.reorder_quantity),
    primaryImageUrl: row.primary_image_url ?? "",
  };
}
