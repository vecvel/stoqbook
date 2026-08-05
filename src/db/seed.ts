/**
 * Registry + demo seed.
 *
 * Run with: npm run db:seed
 *
 * Idempotent: registry rows and plans are upserted, and the demo business is
 * skipped if this installation has already been set up.
 */
import "dotenv/config";

import { eq } from "drizzle-orm";

import { db, pool } from "./index";
import {
  brands,
  categories,
  features,
  modules,
  notificationRules,
  permissions,
  plans,
  products,
  tenants,
  units,
  taxGroups,
  customers,
  suppliers,
  supplierProducts,
  branches,
  users,
} from "./schema";
import {
  PLAN_SEEDS,
  resolvePlanFeatures,
  resolvePlanModules,
  unknownPlanReferences,
} from "./seed-plans";
import { hashPassword } from "@/lib/auth/password";
import { slugify } from "@/lib/format";
import {
  ALL_FEATURES,
  ALL_MODULES,
  ALL_PERMISSIONS,
} from "@/lib/registry";
import { unknownPermissionKeys } from "@/lib/services/default-roles";
import { setupBusiness } from "@/lib/services/business";
import { createPurchaseOrder, receiveGoods } from "@/lib/services/purchases";
import { createSale } from "@/lib/services/sales";
import { setOpeningStock } from "@/lib/services/stock-ops";
import type { BusinessContext } from "@/lib/authz/context";

const log = (msg: string) => console.log(`  ${msg}`);
const step = (msg: string) => console.log(`\n▸ ${msg}`);

async function main() {
  console.log("StoqBook seed");

  /* ---------------------------------------------------------------------- */
  step("Validating registry declarations");

  const badPermissions = unknownPermissionKeys();
  const badPlans = unknownPlanReferences();
  if (badPermissions.length > 0 || badPlans.length > 0) {
    for (const p of badPermissions) {
      console.error(`  role ${p.role} references unknown permission ${p.key}`);
    }
    for (const p of badPlans) console.error(`  ${p}`);
    throw new Error("Registry validation failed. Fix the references above.");
  }
  log(
    `${ALL_MODULES.length} modules, ${ALL_FEATURES.length} features, ` +
      `${ALL_PERMISSIONS.length} permissions declared`,
  );

  /* ---------------------------------------------------------------------- */
  step("Mirroring the module registry into the database");

  const moduleIdBySlug = new Map<string, string>();

  for (const mod of ALL_MODULES) {
    const [row] = await db
      .insert(modules)
      .values({
        slug: mod.slug,
        name: mod.name,
        description: mod.description,
        category: mod.category,
        icon: mod.icon,
        version: mod.version,
        state: "enabled",
        visibility: mod.visibility,
        is_core: mod.isCore,
        dependencies: mod.dependencies,
        sort_order: mod.sortOrder,
      })
      .onConflictDoUpdate({
        target: modules.slug,
        set: {
          name: mod.name,
          description: mod.description,
          category: mod.category,
          icon: mod.icon,
          version: mod.version,
          visibility: mod.visibility,
          is_core: mod.isCore,
          dependencies: mod.dependencies,
          sort_order: mod.sortOrder,
          updated_at: new Date(),
        },
      })
      .returning();
    moduleIdBySlug.set(mod.slug, row.id);
  }
  log(`${moduleIdBySlug.size} modules`);

  for (const feature of ALL_FEATURES) {
    await db
      .insert(features)
      .values({
        module_id: moduleIdBySlug.get(feature.moduleSlug)!,
        module_slug: feature.moduleSlug,
        slug: feature.slug,
        name: feature.name,
        description: feature.description ?? null,
        is_default: feature.isDefault ?? false,
      })
      .onConflictDoUpdate({
        target: features.slug,
        set: {
          name: feature.name,
          description: feature.description ?? null,
          is_default: feature.isDefault ?? false,
          module_id: moduleIdBySlug.get(feature.moduleSlug)!,
          module_slug: feature.moduleSlug,
          updated_at: new Date(),
        },
      });
  }
  log(`${ALL_FEATURES.length} features`);

  for (const permission of ALL_PERMISSIONS) {
    await db
      .insert(permissions)
      .values({
        key: permission.key,
        module_id: moduleIdBySlug.get(permission.moduleSlug)!,
        module_slug: permission.moduleSlug,
        feature_slug: permission.feature ?? null,
        action: permission.action,
        name: permission.name,
        description: permission.description ?? null,
        is_admin: permission.isAdmin,
        sort_order: permission.sortOrder,
      })
      .onConflictDoUpdate({
        target: permissions.key,
        set: {
          name: permission.name,
          description: permission.description ?? null,
          feature_slug: permission.feature ?? null,
          module_id: moduleIdBySlug.get(permission.moduleSlug)!,
          module_slug: permission.moduleSlug,
          is_admin: permission.isAdmin,
          sort_order: permission.sortOrder,
          updated_at: new Date(),
        },
      });
  }
  log(`${ALL_PERMISSIONS.length} permissions`);

  /* ---------------------------------------------------------------------- */
  step("Seeding plans");

  for (const seed of PLAN_SEEDS) {
    await db
      .insert(plans)
      .values({
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        price_once: seed.priceOnce,
        price_monthly: seed.priceMonthly,
        price_yearly: seed.priceYearly,
        modules: resolvePlanModules(seed),
        features: resolvePlanFeatures(seed),
        limits: seed.limits,
        is_public: seed.isPublic,
        sort_order: seed.sortOrder,
      })
      .onConflictDoUpdate({
        target: plans.slug,
        set: {
          name: seed.name,
          description: seed.description,
          price_once: seed.priceOnce,
          price_monthly: seed.priceMonthly,
          price_yearly: seed.priceYearly,
          modules: resolvePlanModules(seed),
          features: resolvePlanFeatures(seed),
          limits: seed.limits,
          is_public: seed.isPublic,
          sort_order: seed.sortOrder,
          updated_at: new Date(),
        },
      });
    log(`${seed.name}`);
  }

  /* ---------------------------------------------------------------------- */
  step("Setting up the demo business");

  // Setup runs once per installation. A second run must not create a second
  // business, so an existing one short-circuits the demo data entirely.
  const [existing] = await db.select().from(tenants).limit(1);

  if (existing) {
    log(`${existing.name} is already set up — skipping demo data`);
    await finish();
    return;
  }

  const ownerEmail = (process.env.SEED_OWNER_EMAIL ?? "owner@freshmart.test")
    .trim()
    .toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "Stoqbook@123";

  const provisioned = await setupBusiness({
    businessName: "FreshMart",
    storeName: "FreshMart Andheri",
    ownerName: "Asha Menon",
    ownerEmail,
    ownerPassword,
    planSlug: "lifetime",
    billingMode: "lifetime",
    licenseKey: "STQB-DEMO-0000-0001",
    contactPhone: "+91 98200 11223",
  });
  log(`business ${provisioned.slug} (${ownerEmail})`);

  const businessId = provisioned.businessId;

  /* ---- A synthetic context so services can be reused by the seed ------- */
  const ctx = await buildSeedContext(businessId, provisioned.ownerUserId);

  /* ---------------------------------------------------------------------- */
  step("Seeding catalogue");

  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.tenant_id, businessId));
  const unitBy = (short: string) =>
    unitRows.find((u) => u.short_name === short)?.id ?? null;

  const taxRows = await db
    .select()
    .from(taxGroups)
    .where(eq(taxGroups.tenant_id, businessId));
  const taxBy = (name: string) =>
    taxRows.find((t) => t.name === name)?.id ?? null;

  const categoryTree = [
    { name: "Grocery", children: ["Staples", "Snacks", "Beverages"] },
    { name: "Personal Care", children: ["Hair Care", "Oral Care"] },
    { name: "Household", children: ["Cleaning", "Kitchen"] },
    { name: "Dairy", children: [] as string[] },
  ];

  const categoryIdByName = new Map<string, string>();
  for (const parent of categoryTree) {
    const [parentRow] = await db
      .insert(categories)
      .values({
        tenant_id: businessId,
        name: parent.name,
        slug: slugify(parent.name),
        path: slugify(parent.name),
        depth: 0,
      })
      .returning();
    categoryIdByName.set(parent.name, parentRow.id);

    for (const child of parent.children) {
      const [childRow] = await db
        .insert(categories)
        .values({
          tenant_id: businessId,
          parent_id: parentRow.id,
          name: child,
          slug: slugify(`${parent.name}-${child}`),
          path: `${slugify(parent.name)}/${slugify(child)}`,
          depth: 1,
        })
        .returning();
      categoryIdByName.set(child, childRow.id);
    }
  }
  log(`${categoryIdByName.size} categories`);

  const brandNames = [
    "Tata",
    "Amul",
    "Britannia",
    "Dabur",
    "Colgate",
    "Surf Excel",
    "Nestlé",
    "Parle",
  ];
  const brandIdByName = new Map<string, string>();
  for (const name of brandNames) {
    const [row] = await db
      .insert(brands)
      .values({ tenant_id: businessId, name, slug: slugify(name) })
      .returning();
    brandIdByName.set(name, row.id);
  }
  log(`${brandIdByName.size} brands`);

  interface ProductSeed {
    sku: string;
    name: string;
    barcode: string;
    category: string;
    brand: string;
    unit: string;
    tax: string;
    cost: string;
    price: string;
    wholesale?: string;
    min: string;
    reorder: string;
    opening: string;
  }

  const productSeeds: ProductSeed[] = [
    { sku: "GRC-0001", name: "Tata Salt 1kg", barcode: "8901030510001", category: "Staples", brand: "Tata", unit: "pc", tax: "GST 5%", cost: "21.00", price: "28.00", wholesale: "25.00", min: "24", reorder: "120", opening: "180" },
    { sku: "GRC-0002", name: "Tata Sampann Toor Dal 1kg", barcode: "8901030510018", category: "Staples", brand: "Tata", unit: "kg", tax: "GST 5%", cost: "132.00", price: "165.00", wholesale: "152.00", min: "15", reorder: "60", opening: "72" },
    { sku: "GRC-0003", name: "Parle-G Biscuits 800g", barcode: "8901719110025", category: "Snacks", brand: "Parle", unit: "pc", tax: "GST 18%", cost: "72.00", price: "90.00", min: "20", reorder: "80", opening: "96" },
    { sku: "GRC-0004", name: "Britannia Good Day 600g", barcode: "8901063014032", category: "Snacks", brand: "Britannia", unit: "pc", tax: "GST 18%", cost: "108.00", price: "135.00", min: "12", reorder: "48", opening: "54" },
    { sku: "BEV-0001", name: "Nestlé Nescafé Classic 200g", barcode: "8901058850049", category: "Beverages", brand: "Nestlé", unit: "pc", tax: "GST 18%", cost: "445.00", price: "545.00", min: "6", reorder: "24", opening: "30" },
    { sku: "BEV-0002", name: "Tata Tea Premium 500g", barcode: "8901030510056", category: "Beverages", brand: "Tata", unit: "pc", tax: "GST 5%", cost: "232.00", price: "285.00", min: "10", reorder: "40", opening: "44" },
    { sku: "DRY-0001", name: "Amul Butter 500g", barcode: "8901262010063", category: "Dairy", brand: "Amul", unit: "pc", tax: "GST 12%", cost: "255.00", price: "295.00", min: "12", reorder: "36", opening: "40" },
    { sku: "DRY-0002", name: "Amul Cheese Slices 200g", barcode: "8901262010070", category: "Dairy", brand: "Amul", unit: "pc", tax: "GST 12%", cost: "118.00", price: "145.00", min: "10", reorder: "30", opening: "26" },
    { sku: "PC-0001", name: "Colgate Strong Teeth 200g", barcode: "8901314010087", category: "Oral Care", brand: "Colgate", unit: "pc", tax: "GST 18%", cost: "96.00", price: "120.00", min: "15", reorder: "50", opening: "58" },
    { sku: "PC-0002", name: "Dabur Amla Hair Oil 275ml", barcode: "8901207010094", category: "Hair Care", brand: "Dabur", unit: "pc", tax: "GST 18%", cost: "132.00", price: "165.00", min: "12", reorder: "40", opening: "8" },
    { sku: "HH-0001", name: "Surf Excel Easy Wash 1kg", barcode: "8901030510100", category: "Cleaning", brand: "Surf Excel", unit: "kg", tax: "GST 18%", cost: "118.00", price: "148.00", min: "18", reorder: "60", opening: "0" },
    { sku: "HH-0002", name: "Stainless Steel Kadai 24cm", barcode: "8901030510117", category: "Kitchen", brand: "Tata", unit: "pc", tax: "GST 18%", cost: "640.00", price: "820.00", min: "4", reorder: "12", opening: "9" },
  ];

  const productIdBySku = new Map<string, string>();
  for (const p of productSeeds) {
    const [row] = await db
      .insert(products)
      .values({
        tenant_id: businessId,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        type: "physical",
        status: "active",
        category_id: categoryIdByName.get(p.category) ?? null,
        brand_id: brandIdByName.get(p.brand) ?? null,
        unit_id: unitBy(p.unit),
        tax_group_id: taxBy(p.tax),
        cost_price: p.cost,
        selling_price: p.price,
        wholesale_price: p.wholesale ?? null,
        track_inventory: true,
        min_stock: p.min,
        reorder_level: p.min,
        reorder_quantity: p.reorder,
        created_by: ctx.user.id,
      })
      .returning();
    productIdBySku.set(p.sku, row.id);
  }
  log(`${productIdBySku.size} products`);

  /* ---------------------------------------------------------------------- */
  step("Recording opening stock");

  let openingCount = 0;
  for (const p of productSeeds) {
    if (p.opening === "0") continue;
    await setOpeningStock(ctx, {
      warehouseId: provisioned.warehouseId,
      productId: productIdBySku.get(p.sku)!,
      quantity: p.opening,
      unitCost: p.cost,
    });
    openingCount++;
  }
  log(`${openingCount} products stocked`);

  /* ---------------------------------------------------------------------- */
  step("Seeding customers and suppliers");

  const customerSeeds = [
    { code: "CUS-000001", name: "Ravi Sharma", phone: "+91 98111 22334", type: "retail" as const, credit: "0" },
    { code: "CUS-000002", name: "Neelam Traders", phone: "+91 98222 44556", type: "wholesale" as const, credit: "150000", company: "Neelam Traders Pvt Ltd" },
    { code: "CUS-000003", name: "Sunita Desai", phone: "+91 98333 66778", type: "retail" as const, credit: "10000" },
    { code: "CUS-000004", name: "Hotel Blue Lotus", phone: "+91 98444 88990", type: "corporate" as const, credit: "250000", company: "Blue Lotus Hospitality" },
    { code: "CUS-000005", name: "Imran Qureshi", phone: "+91 98555 11002", type: "retail" as const, credit: "0" },
  ];

  const customerIds: string[] = [];
  for (const c of customerSeeds) {
    const [row] = await db
      .insert(customers)
      .values({
        tenant_id: businessId,
        code: c.code,
        name: c.name,
        company_name: c.company ?? null,
        type: c.type,
        phone: c.phone,
        credit_limit: c.credit,
        status: "active",
        created_by: ctx.user.id,
      })
      .returning();
    customerIds.push(row.id);
  }
  log(`${customerIds.length} customers`);

  const supplierSeeds = [
    { code: "SUP-000001", company: "Metro Cash & Carry", contact: "Deepak Rao", phone: "+91 22 4000 1000", type: "wholesaler" as const, days: 30 },
    { code: "SUP-000002", company: "Amul Distribution West", contact: "Kiran Patel", phone: "+91 22 4000 2000", type: "distributor" as const, days: 15 },
    { code: "SUP-000003", company: "Hindustan FMCG Depot", contact: "Rekha Nair", phone: "+91 22 4000 3000", type: "distributor" as const, days: 21 },
  ];

  const supplierIds: string[] = [];
  for (const s of supplierSeeds) {
    const [row] = await db
      .insert(suppliers)
      .values({
        tenant_id: businessId,
        code: s.code,
        company_name: s.company,
        contact_person: s.contact,
        phone: s.phone,
        type: s.type,
        credit_days: s.days,
        payment_terms: `Net ${s.days}`,
        rating: "4.2",
        status: "active",
        created_by: ctx.user.id,
      })
      .returning();
    supplierIds.push(row.id);
  }
  log(`${supplierIds.length} suppliers`);

  // Map a few products to their preferred supplier.
  await db.insert(supplierProducts).values(
    productSeeds.slice(0, 6).map((p, i) => ({
      tenant_id: businessId,
      supplier_id: supplierIds[i % supplierIds.length],
      product_id: productIdBySku.get(p.sku)!,
      purchase_price: p.cost,
      minimum_order_quantity: "12",
      lead_time_days: 3 + (i % 4),
      is_preferred: true,
    })),
  );

  /* ---------------------------------------------------------------------- */
  step("Creating a purchase order and receiving it");

  const po = await createPurchaseOrder(ctx, {
    supplierId: supplierIds[0],
    warehouseId: provisioned.warehouseId,
    lines: [
      { productId: productIdBySku.get("HH-0001")!, quantity: "60", unitPrice: "118.00" },
      { productId: productIdBySku.get("PC-0002")!, quantity: "48", unitPrice: "132.00" },
      { productId: productIdBySku.get("DRY-0002")!, quantity: "36", unitPrice: "118.00" },
    ],
    expectedDate: new Date(Date.now() + 3 * 86_400_000),
    note: "Weekly replenishment",
  });
  log(`${po.orderNumber} — ${po.grandTotal}`);

  const orderItems = await db
    .select()
    .from((await import("./schema")).purchaseOrderItems)
    .where(eq((await import("./schema")).purchaseOrderItems.order_id, po.orderId));

  const grn = await receiveGoods(ctx, {
    orderId: po.orderId,
    challanNumber: "CH-8842",
    additionalCharges: "450.00",
    lines: orderItems.map((i) => ({
      orderItemId: i.id,
      quantityReceived: String(i.quantity_ordered),
    })),
  });
  log(`${grn.receiptNumber} — landed cost ${grn.totalCost}`);

  /* ---------------------------------------------------------------------- */
  step("Generating sales history");

  const salesPlan: {
    customerIndex: number | null;
    lines: { sku: string; qty: string }[];
    method: "cash" | "upi" | "card";
    payFully: boolean;
  }[] = [
    { customerIndex: 0, lines: [{ sku: "GRC-0001", qty: "2" }, { sku: "DRY-0001", qty: "1" }], method: "cash", payFully: true },
    { customerIndex: null, lines: [{ sku: "GRC-0003", qty: "3" }, { sku: "BEV-0002", qty: "1" }], method: "upi", payFully: true },
    { customerIndex: 1, lines: [{ sku: "GRC-0002", qty: "10" }, { sku: "HH-0001", qty: "12" }], method: "cash", payFully: false },
    { customerIndex: 2, lines: [{ sku: "PC-0001", qty: "2" }, { sku: "PC-0002", qty: "1" }], method: "card", payFully: true },
    { customerIndex: 3, lines: [{ sku: "BEV-0001", qty: "4" }, { sku: "DRY-0001", qty: "6" }, { sku: "GRC-0004", qty: "5" }], method: "upi", payFully: false },
    { customerIndex: null, lines: [{ sku: "HH-0002", qty: "1" }], method: "card", payFully: true },
    { customerIndex: 4, lines: [{ sku: "GRC-0001", qty: "4" }, { sku: "GRC-0003", qty: "2" }, { sku: "DRY-0002", qty: "2" }], method: "cash", payFully: true },
    { customerIndex: 0, lines: [{ sku: "BEV-0002", qty: "2" }, { sku: "PC-0001", qty: "1" }], method: "upi", payFully: true },
  ];

  let salesCreated = 0;
  let revenue = 0;

  for (const plan of salesPlan) {
    // First pass with no payments to learn the total, then bill for real would
    // double-post; instead compute expected total from list prices.
    const lines = plan.lines.map((l) => ({
      productId: productIdBySku.get(l.sku)!,
      quantity: l.qty,
    }));

    const estimated = plan.lines.reduce((acc, l) => {
      const seed = productSeeds.find((p) => p.sku === l.sku)!;
      const base = Number(seed.price) * Number(l.qty);
      const taxRate =
        seed.tax === "GST 5%" ? 5 : seed.tax === "GST 12%" ? 12 : seed.tax === "GST 18%" ? 18 : 0;
      return acc + base * (1 + taxRate / 100);
    }, 0);

    const rounded = Math.round(estimated);
    const payAmount = plan.payFully ? rounded : Math.round(rounded * 0.4);

    const sale = await createSale(ctx, {
      customerId:
        plan.customerIndex === null ? null : customerIds[plan.customerIndex],
      warehouseId: provisioned.warehouseId,
      lines,
      channel: plan.customerIndex === 1 ? "wholesale" : "pos_counter",
      payments: [
        {
          method: plan.method,
          amount: String(payAmount),
          tenderedAmount: plan.method === "cash" ? String(payAmount) : undefined,
        },
      ],
      dueDate: plan.payFully ? null : new Date(Date.now() + 15 * 86_400_000),
    });

    salesCreated++;
    revenue += Number(sale.grandTotal);
  }
  log(`${salesCreated} invoices, revenue ${revenue.toFixed(2)}`);

  /* ---------------------------------------------------------------------- */
  step("Configuring notification rules");

  await db
    .insert(notificationRules)
    .values([
      {
        tenant_id: businessId,
        event: "LowStockDetected",
        recipient_roles: ["owner", "manager", "inventory_manager"],
        channels: ["in_app"],
        priority: "high" as const,
      },
      {
        tenant_id: businessId,
        event: "PurchaseOrderCreated",
        recipient_roles: ["owner", "manager"],
        channels: ["in_app"],
        priority: "high" as const,
      },
      {
        tenant_id: businessId,
        event: "StockAdjusted",
        recipient_roles: ["owner", "inventory_manager"],
        channels: ["in_app"],
        priority: "medium" as const,
      },
    ])
    .onConflictDoNothing();
  log("3 rules");

  /* ---------------------------------------------------------------------- */
  step("Adding demo staff");

  const staff = [
    { name: "Vikram Iyer", email: "manager@freshmart.test", role: "manager", code: "EMP-000002" },
    { name: "Priya Nair", email: "cashier@freshmart.test", role: "cashier", code: "EMP-000003" },
    { name: "Arun Kulkarni", email: "stock@freshmart.test", role: "inventory_manager", code: "EMP-000004" },
    { name: "Meera Joshi", email: "accounts@freshmart.test", role: "accountant", code: "EMP-000005" },
  ];

  const { roles: rolesTable, userRoles } = await import("./schema");
  const roleRows = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.tenant_id, businessId));
  const roleIdBySlug = new Map(roleRows.map((r) => [r.slug, r.id]));
  const staffHash = await hashPassword(ownerPassword);

  for (const s of staff) {
    const [row] = await db
      .insert(users)
      .values({
        tenant_id: businessId,
        employee_code: s.code,
        full_name: s.name,
        email: s.email,
        password_hash: staffHash,
        login_enabled: true,
        status: "active",
        joining_date: new Date(),
        branch_id: provisioned.storeId,
      })
      .returning();
    await db
      .insert(userRoles)
      .values({ user_id: row.id, role_id: roleIdBySlug.get(s.role)! });
  }
  log(`${staff.length} employees (password same as owner)`);

  /* ---------------------------------------------------------------------- */
  console.log("\n─────────────────────────────────────────────");
  console.log(" Seed complete");
  console.log("─────────────────────────────────────────────");
  console.log(` Owner             ${ownerEmail} / ${ownerPassword}`);
  console.log(` Manager           manager@freshmart.test`);
  console.log(` Cashier           cashier@freshmart.test`);
  console.log(` Inventory         stock@freshmart.test`);
  console.log(` Accountant        accounts@freshmart.test`);
  console.log("─────────────────────────────────────────────\n");

  await finish();
}

/**
 * Builds a BusinessContext without a session so the seed can call the same
 * services the application uses, rather than duplicating their logic.
 */
async function buildSeedContext(
  businessId: string,
  ownerUserId: string,
): Promise<BusinessContext> {
  const [business] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, businessId));
  const [user] = await db.select().from(users).where(eq(users.id, ownerUserId));
  const storeRows = await db
    .select()
    .from(branches)
    .where(eq(branches.tenant_id, businessId));
  const { organizations, roles: rolesTable } = await import("./schema");
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.tenant_id, businessId));
  const roleRows = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.tenant_id, businessId));
  const { resolveEntitlements } = await import("@/lib/authz/entitlements");
  const { ALL_PERMISSION_KEYS } = await import("@/lib/registry");

  return {
    // The seed runs outside a request, so there is no real session row.
    session: {
      id: "00000000-0000-0000-0000-000000000000",
      token_hash: "seed",
      tenant_id: businessId,
      user_id: ownerUserId,
      active_branch_id: storeRows[0]?.id ?? null,
      ip_address: null,
      user_agent: null,
      expires_at: new Date(Date.now() + 3_600_000),
      revoked_at: null,
      last_seen_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    },
    business,
    organization: organization ?? null,
    user,
    roles: roleRows.filter((r) => r.is_owner),
    permissions: new Set(ALL_PERMISSION_KEYS),
    entitlements: await resolveEntitlements(businessId),
    stores: storeRows,
    activeStore: storeRows[0] ?? null,
    isOwner: true,
  };
}

async function finish() {
  await pool.end();
}

main().catch(async (error) => {
  console.error("\nSeed failed:\n", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
