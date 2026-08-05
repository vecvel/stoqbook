/**
 * The module registry.
 *
 * This file is the single declaration point for every capability StoqBook has.
 * The seeder mirrors it into `modules` / `features` / `permissions`, navigation
 * is generated from it, the dashboard discovers widgets from it, and the
 * settings page builds itself from it.
 *
 * Adding a module here is the only step required — nothing else needs editing.
 */
import type { ModuleDef } from "./types";

/* ========================================================================== */
/* Dashboard                                                                  */
/* ========================================================================== */

const dashboard: ModuleDef = {
  slug: "dashboard",
  name: "Dashboard",
  description: "Personalised, real-time operational overview.",
  category: "core",
  icon: "LayoutDashboard",
  version: "1.0.0",
  isCore: true,
  visibility: "business",
  dependencies: [],
  sortOrder: 10,
  features: [
    { slug: "dashboard.widgets", name: "Dashboard Widgets", isDefault: true },
    { slug: "dashboard.custom_layout", name: "Custom Layout" },
    { slug: "dashboard.financial_widgets", name: "Financial Widgets" },
  ],
  permissions: [
    { action: "view", name: "View dashboard" },
    {
      action: "customize",
      name: "Customise layout",
      feature: "dashboard.custom_layout",
    },
    { action: "export", name: "Export dashboard" },
    { action: "manage_widgets", name: "Manage widgets" },
    {
      action: "view_financial",
      name: "View financial widgets",
      description: "Revenue, profit and cash figures.",
      feature: "dashboard.financial_widgets",
    },
    /* Cross-store visibility lives in the `stores` module, not here.
       It used to be `dashboard.view_store`, which was a mistake: it gated the
       store scope of sales, purchases, expenses, inventory and every report, so
       a change made while tidying dashboard permissions silently altered data
       visibility across the whole system. See `stores.view_all`. */
  ],
  navigation: [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: "LayoutDashboard",
      permission: "dashboard.view",
    },
  ],
  widgets: [],
  reports: [],
  settings: [
    {
      key: "dashboard.default_widgets",
      label: "Default widgets",
      description:
        "Comma-separated widget keys shown to anyone who has not chosen their own. Blank means every widget the user may see.",
      type: "text",
      scope: "business",
      default: "",
      permission: "dashboard.manage_widgets",
      group: "Dashboard",
    },
    {
      key: "dashboard.default_range",
      label: "Default date range",
      type: "select",
      scope: "user",
      default: "today",
      options: [
        { value: "today", label: "Today" },
        { value: "week", label: "This week" },
        { value: "month", label: "This month" },
        { value: "year", label: "This year" },
      ],
      group: "Dashboard",
    },
  ],
  events: ["DashboardLayoutChanged"],
};

/* ========================================================================== */
/* Products                                                                   */
/* ========================================================================== */

const products: ModuleDef = {
  slug: "products",
  name: "Products",
  description: "Central product catalogue, taxonomy, pricing and barcodes.",
  category: "retail",
  icon: "Package",
  version: "1.0.0",
  isCore: false,
  visibility: "business",
  dependencies: [],
  sortOrder: 20,
  features: [
    { slug: "products.catalog", name: "Product Catalogue", isDefault: true },
    { slug: "products.categories", name: "Categories", isDefault: true },
    { slug: "products.brands", name: "Brands", isDefault: true },
    { slug: "products.units", name: "Units", isDefault: true },
    { slug: "products.taxes", name: "Tax Groups", isDefault: true },
    { slug: "products.variants", name: "Product Variants" },
    { slug: "products.barcode", name: "Barcode Printing" },
    { slug: "products.qr", name: "QR Codes" },
    { slug: "products.bulk_import", name: "Bulk Import" },
    { slug: "products.bulk_export", name: "Bulk Export" },
    { slug: "products.store_pricing", name: "Store Pricing" },
  ],
  permissions: [
    { action: "view", name: "View products" },
    { action: "create", name: "Create products" },
    { action: "update", name: "Edit products" },
    { action: "delete", name: "Delete products" },
    { action: "archive", name: "Archive products" },
    {
      action: "view_cost",
      name: "View cost price",
      description: "Cost price is hidden from users without this permission.",
    },
    {
      action: "import",
      name: "Import products",
      feature: "products.bulk_import",
    },
    {
      action: "export",
      name: "Export products",
      feature: "products.bulk_export",
    },
    {
      action: "print_barcode",
      name: "Print barcodes",
      feature: "products.barcode",
    },
    { action: "manage_taxonomy", name: "Manage categories, brands and units" },
    { action: "manage_taxes", name: "Manage tax groups" },
  ],
  navigation: [
    {
      label: "Products",
      href: "/products",
      icon: "Package",
      permission: "products.view",
      children: [
        { label: "All Products", href: "/products", permission: "products.view" },
        {
          label: "Categories",
          href: "/products/categories",
          permission: "products.manage_taxonomy",
          feature: "products.categories",
        },
        {
          label: "Brands",
          href: "/products/brands",
          permission: "products.manage_taxonomy",
          feature: "products.brands",
        },
        {
          label: "Units",
          href: "/products/units",
          permission: "products.manage_taxonomy",
          feature: "products.units",
        },
        {
          label: "Tax Groups",
          href: "/products/taxes",
          permission: "products.manage_taxes",
          feature: "products.taxes",
        },
      ],
    },
  ],
  widgets: [
    {
      key: "products.total",
      name: "Total Products",
      permission: "products.view",
      size: "small",
      priority: 40,
    },
    {
      key: "products.recently_added",
      name: "Recently Added Products",
      permission: "products.view",
      size: "medium",
      priority: 90,
    },
  ],
  reports: [
    {
      key: "products.catalog",
      name: "Product Catalogue",
      description: "Every product with classification and pricing.",
      permission: "reports.inventory",
      group: "inventory",
    },
    {
      key: "products.price_list",
      name: "Price List",
      permission: "reports.inventory",
      group: "inventory",
    },
  ],
  settings: [
    {
      key: "products.sku_prefix",
      label: "SKU prefix",
      description: "Used when a SKU is generated automatically.",
      type: "text",
      scope: "business",
      default: "SKU",
      permission: "settings.update",
      group: "Products",
    },
    {
      key: "products.auto_generate_sku",
      label: "Auto-generate SKU",
      type: "boolean",
      scope: "business",
      default: true,
      permission: "settings.update",
      group: "Products",
    },
    {
      key: "products.barcode_unique",
      label: "Enforce unique barcodes",
      type: "boolean",
      scope: "business",
      default: true,
      permission: "settings.update",
      group: "Products",
    },
    {
      key: "products.barcode_format",
      label: "Barcode format",
      type: "select",
      scope: "business",
      default: "EAN13",
      options: [
        { value: "EAN13", label: "EAN-13" },
        { value: "UPC", label: "UPC" },
        { value: "CODE128", label: "Code 128" },
        { value: "CODE39", label: "Code 39" },
      ],
      permission: "settings.update",
      group: "Products",
    },
  ],
  events: [
    "ProductCreated",
    "ProductUpdated",
    "ProductArchived",
    "ProductPriceChanged",
  ],
};

/* ========================================================================== */
/* Inventory                                                                  */
/* ========================================================================== */

const inventory: ModuleDef = {
  slug: "inventory",
  name: "Inventory",
  description: "Ledger-driven stock tracking across stores and warehouses.",
  category: "retail",
  icon: "Boxes",
  version: "1.0.0",
  isCore: false,
  visibility: "business",
  dependencies: ["products"],
  sortOrder: 30,
  features: [
    { slug: "inventory.stock", name: "Current Stock", isDefault: true },
    { slug: "inventory.ledger", name: "Stock Ledger", isDefault: true },
    { slug: "inventory.adjustment", name: "Stock Adjustment", isDefault: true },
    { slug: "inventory.transfer", name: "Stock Transfer" },
    { slug: "inventory.count", name: "Physical Stock Count" },
    { slug: "inventory.reservation", name: "Stock Reservation" },
    { slug: "inventory.batches", name: "Batch Tracking" },
    { slug: "inventory.expiry", name: "Expiry Management" },
    { slug: "inventory.multi_warehouse", name: "Multiple Warehouses" },
    { slug: "inventory.valuation", name: "Inventory Valuation" },
    { slug: "inventory.import", name: "Import Inventory" },
    { slug: "inventory.export", name: "Export Inventory" },
  ],
  permissions: [
    { action: "view", name: "View inventory" },
    {
      action: "opening_stock",
      name: "Set opening stock",
      feature: "inventory.stock",
    },
    {
      action: "adjust",
      name: "Adjust stock",
      feature: "inventory.adjustment",
    },
    {
      action: "approve_adjustment",
      name: "Approve adjustments",
      feature: "inventory.adjustment",
    },
    {
      action: "transfer",
      name: "Transfer stock",
      feature: "inventory.transfer",
    },
    {
      action: "approve_transfer",
      name: "Approve transfers",
      feature: "inventory.transfer",
    },
    {
      action: "receive_transfer",
      name: "Receive transfers",
      feature: "inventory.transfer",
    },
    {
      action: "count",
      name: "Perform stock counts",
      feature: "inventory.count",
    },
    {
      action: "reserve",
      name: "Reserve stock",
      feature: "inventory.reservation",
    },
    { action: "audit", name: "View inventory audit" },
    { action: "import", name: "Import inventory", feature: "inventory.import" },
    { action: "export", name: "Export inventory", feature: "inventory.export" },
  ],
  navigation: [
    {
      label: "Inventory",
      href: "/inventory",
      icon: "Boxes",
      permission: "inventory.view",
      children: [
        {
          label: "Current Stock",
          href: "/inventory",
          permission: "inventory.view",
        },
        {
          label: "Stock Ledger",
          href: "/inventory/ledger",
          permission: "inventory.view",
          feature: "inventory.ledger",
        },
        {
          label: "Adjustments",
          href: "/inventory/adjustments",
          permission: "inventory.adjust",
          feature: "inventory.adjustment",
        },
        {
          label: "Transfers",
          href: "/inventory/transfers",
          permission: "inventory.transfer",
          feature: "inventory.transfer",
        },
        {
          label: "Stock Counts",
          href: "/inventory/counts",
          permission: "inventory.count",
          feature: "inventory.count",
        },
      ],
    },
  ],
  widgets: [
    {
      key: "inventory.value",
      name: "Inventory Value",
      permission: "inventory.view",
      feature: "inventory.valuation",
      size: "small",
      priority: 30,
    },
    {
      key: "inventory.low_stock",
      name: "Low Stock",
      permission: "inventory.view",
      size: "small",
      priority: 31,
    },
    {
      key: "inventory.out_of_stock",
      name: "Out of Stock",
      permission: "inventory.view",
      size: "small",
      priority: 32,
    },
    {
      key: "inventory.low_stock_list",
      name: "Items Needing Reorder",
      permission: "inventory.view",
      size: "medium",
      priority: 70,
    },
  ],
  reports: [
    {
      key: "inventory.stock_summary",
      name: "Stock Summary",
      permission: "reports.inventory",
      group: "inventory",
    },
    {
      key: "inventory.ledger",
      name: "Stock Ledger",
      permission: "reports.inventory",
      group: "inventory",
    },
    {
      key: "inventory.valuation",
      name: "Inventory Valuation",
      permission: "reports.inventory",
      feature: "inventory.valuation",
      group: "inventory",
    },
    {
      key: "inventory.low_stock",
      name: "Low Stock",
      permission: "reports.inventory",
      group: "inventory",
    },
    {
      key: "inventory.movement",
      name: "Movement History",
      permission: "reports.inventory",
      group: "inventory",
    },
    {
      key: "inventory.adjustments",
      name: "Adjustment Report",
      permission: "reports.inventory",
      group: "inventory",
    },
    {
      key: "inventory.expiry",
      name: "Expiry & Near Expiry",
      permission: "reports.inventory",
      feature: "inventory.expiry",
      group: "inventory",
    },
  ],
  settings: [
    {
      key: "inventory.allow_negative_stock",
      label: "Allow negative stock",
      description: "When off, sales cannot exceed available quantity.",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Inventory",
    },
    {
      key: "inventory.valuation_method",
      label: "Valuation method",
      type: "select",
      scope: "business",
      default: "weighted_average",
      options: [
        { value: "fifo", label: "FIFO" },
        { value: "lifo", label: "LIFO" },
        { value: "weighted_average", label: "Weighted average" },
        { value: "specific", label: "Specific identification" },
      ],
      permission: "settings.update",
      group: "Inventory",
    },
    {
      key: "inventory.adjustment_approval_threshold",
      label: "Adjustment approval threshold (units)",
      description: "Adjustments above this quantity require approval. 0 = never.",
      type: "number",
      scope: "business",
      default: 0,
      permission: "settings.update",
      group: "Inventory",
    },
    {
      key: "inventory.transfer_requires_approval",
      label: "Transfers require approval",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Inventory",
    },
    {
      key: "inventory.low_stock_alerts",
      label: "Low stock alerts",
      type: "boolean",
      scope: "business",
      default: true,
      permission: "settings.update",
      group: "Inventory",
    },
    {
      key: "inventory.near_expiry_days",
      label: "Near expiry warning (days)",
      type: "number",
      scope: "business",
      default: 30,
      permission: "settings.update",
      group: "Inventory",
    },
  ],
  events: [
    "OpeningStockCreated",
    "StockAdjusted",
    "StockTransferred",
    "StockReserved",
    "StockReleased",
    "LowStockDetected",
    "StockCountApproved",
  ],
};

/* ========================================================================== */
/* Purchases                                                                  */
/* ========================================================================== */

const purchases: ModuleDef = {
  slug: "purchases",
  name: "Purchases",
  description: "Procurement from requisition through receipt and payment.",
  category: "retail",
  icon: "ShoppingBag",
  version: "1.0.0",
  isCore: false,
  visibility: "business",
  dependencies: ["products", "inventory", "suppliers"],
  sortOrder: 40,
  features: [
    { slug: "purchases.orders", name: "Purchase Orders", isDefault: true },
    { slug: "purchases.receipts", name: "Goods Receipt", isDefault: true },
    { slug: "purchases.invoices", name: "Supplier Invoices", isDefault: true },
    { slug: "purchases.payments", name: "Payment Tracking", isDefault: true },
    { slug: "purchases.requisitions", name: "Purchase Requisitions" },
    { slug: "purchases.approvals", name: "Approval Workflow" },
    { slug: "purchases.returns", name: "Purchase Returns" },
    { slug: "purchases.partial_receipt", name: "Partial Receiving" },
    { slug: "purchases.export", name: "Export Purchases" },
  ],
  permissions: [
    { action: "view", name: "View purchases" },
    { action: "create", name: "Create purchase orders" },
    { action: "update", name: "Edit purchase orders" },
    {
      action: "approve",
      name: "Approve purchase orders",
      feature: "purchases.approvals",
    },
    {
      action: "receive",
      name: "Receive goods",
      feature: "purchases.receipts",
    },
    { action: "cancel", name: "Cancel purchase orders" },
    {
      action: "return",
      name: "Create purchase returns",
      feature: "purchases.returns",
    },
    {
      action: "payment",
      name: "Record supplier payments",
      feature: "purchases.payments",
    },
    { action: "export", name: "Export purchases", feature: "purchases.export" },
  ],
  navigation: [
    {
      label: "Purchases",
      href: "/purchases",
      icon: "ShoppingBag",
      permission: "purchases.view",
      children: [
        {
          label: "Purchase Orders",
          href: "/purchases",
          permission: "purchases.view",
        },
        {
          label: "Goods Receipts",
          href: "/purchases/receipts",
          permission: "purchases.receive",
          feature: "purchases.receipts",
        },
        {
          label: "Supplier Invoices",
          href: "/purchases/invoices",
          permission: "purchases.view",
          feature: "purchases.invoices",
        },
        {
          label: "Returns",
          href: "/purchases/returns",
          permission: "purchases.return",
          feature: "purchases.returns",
        },
      ],
    },
  ],
  widgets: [
    {
      key: "purchases.pending_approvals",
      name: "Pending Purchase Approvals",
      permission: "purchases.view",
      size: "small",
      priority: 50,
    },
    {
      key: "purchases.outstanding_payables",
      name: "Outstanding Payables",
      permission: "purchases.view",
      size: "small",
      priority: 51,
    },
    {
      key: "purchases.awaiting_receipt",
      name: "Goods Awaiting Receipt",
      permission: "purchases.view",
      size: "medium",
      priority: 75,
    },
  ],
  reports: [
    {
      key: "purchases.register",
      name: "Purchase Register",
      permission: "reports.purchases",
      group: "purchases",
    },
    {
      key: "purchases.summary",
      name: "Purchase Summary",
      permission: "reports.purchases",
      group: "purchases",
    },
    {
      key: "purchases.by_supplier",
      name: "Purchases by Supplier",
      permission: "reports.purchases",
      group: "purchases",
    },
    {
      key: "purchases.outstanding",
      name: "Outstanding Supplier Payments",
      permission: "reports.purchases",
      group: "purchases",
    },
    {
      key: "purchases.returns",
      name: "Purchase Returns",
      permission: "reports.purchases",
      group: "purchases",
    },
  ],
  settings: [
    {
      key: "purchases.approval_required",
      label: "Purchase approval required",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Purchases",
    },
    {
      key: "purchases.approval_threshold",
      label: "Approval threshold",
      description: "Orders above this total require approval. 0 = always.",
      type: "money",
      scope: "business",
      default: 50000,
      permission: "settings.update",
      group: "Purchases",
    },
    {
      key: "purchases.allow_over_receipt",
      label: "Allow over-receipt",
      description: "Permit receiving more than the ordered quantity.",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Purchases",
    },
    {
      key: "purchases.default_credit_days",
      label: "Default supplier credit days",
      type: "number",
      scope: "business",
      default: 30,
      permission: "settings.update",
      group: "Purchases",
    },
  ],
  events: [
    "PurchaseOrderCreated",
    "PurchaseOrderApproved",
    "PurchaseOrderCancelled",
    "GoodsReceived",
    "PurchaseInvoiceRecorded",
    "SupplierPaymentRecorded",
    "PurchaseReturned",
  ],
};

/* ========================================================================== */
/* Sales                                                                      */
/* ========================================================================== */

const sales: ModuleDef = {
  slug: "sales",
  name: "Sales",
  description: "Invoices, payments, returns and customer credit.",
  category: "retail",
  icon: "Receipt",
  version: "1.0.0",
  isCore: false,
  visibility: "business",
  dependencies: ["products", "inventory"],
  sortOrder: 50,
  features: [
    { slug: "sales.invoices", name: "Sales Invoices", isDefault: true },
    { slug: "sales.payments", name: "Payments", isDefault: true },
    { slug: "sales.returns", name: "Sales Returns", isDefault: true },
    { slug: "sales.discounts", name: "Discounts", isDefault: true },
    { slug: "sales.quotations", name: "Quotations" },
    { slug: "sales.orders", name: "Sales Orders" },
    { slug: "sales.credit", name: "Credit Sales" },
    { slug: "sales.split_payment", name: "Split Payments" },
    { slug: "sales.gift_cards", name: "Gift Cards" },
    { slug: "sales.export", name: "Export Sales" },
  ],
  permissions: [
    { action: "view", name: "View sales" },
    { action: "create", name: "Create sales" },
    { action: "update", name: "Edit draft sales" },
    { action: "cancel", name: "Cancel sales" },
    { action: "return", name: "Process returns", feature: "sales.returns" },
    { action: "refund", name: "Issue refunds", feature: "sales.returns" },
    {
      action: "discount",
      name: "Apply discounts",
      feature: "sales.discounts",
    },
    {
      action: "discount_override",
      name: "Exceed discount limit",
      description: "Apply discounts above the configured maximum.",
      feature: "sales.discounts",
    },
    { action: "credit", name: "Sell on credit", feature: "sales.credit" },
    {
      action: "credit_override",
      name: "Exceed customer credit limit",
      feature: "sales.credit",
    },
    { action: "print", name: "Print receipts and invoices" },
    { action: "export", name: "Export sales", feature: "sales.export" },
  ],
  navigation: [
    {
      label: "Sales",
      href: "/sales",
      icon: "Receipt",
      permission: "sales.view",
      children: [
        { label: "Invoices", href: "/sales", permission: "sales.view" },
        {
          label: "Returns",
          href: "/sales/returns",
          permission: "sales.return",
          feature: "sales.returns",
        },
        {
          label: "Gift Cards",
          href: "/sales/gift-cards",
          permission: "sales.view",
          feature: "sales.gift_cards",
        },
        {
          label: "Quotations",
          href: "/sales/quotations",
          permission: "sales.view",
          feature: "sales.quotations",
        },
      ],
    },
  ],
  widgets: [
    {
      key: "sales.today_revenue",
      name: "Today's Revenue",
      permission: "dashboard.view_financial",
      size: "small",
      priority: 10,
    },
    {
      key: "sales.today_transactions",
      name: "Today's Transactions",
      permission: "sales.view",
      size: "small",
      priority: 11,
    },
    {
      key: "sales.gross_profit",
      name: "Gross Profit",
      permission: "dashboard.view_financial",
      size: "small",
      priority: 12,
    },
    {
      key: "sales.average_bill",
      name: "Average Bill Value",
      permission: "sales.view",
      size: "small",
      priority: 13,
    },
    {
      key: "sales.trend",
      name: "Sales Trend",
      permission: "sales.view",
      size: "large",
      priority: 60,
    },
    {
      key: "sales.top_products",
      name: "Best Selling Products",
      permission: "sales.view",
      size: "medium",
      priority: 65,
    },
    {
      key: "sales.recent",
      name: "Recent Sales",
      permission: "sales.view",
      size: "medium",
      priority: 66,
    },
    {
      key: "sales.payment_mix",
      name: "Payment Distribution",
      permission: "sales.view",
      size: "medium",
      priority: 80,
    },
    {
      key: "sales.outstanding_receivables",
      name: "Outstanding Receivables",
      permission: "dashboard.view_financial",
      feature: "sales.credit",
      size: "small",
      priority: 52,
    },
  ],
  reports: [
    {
      key: "sales.register",
      name: "Sales Register",
      permission: "reports.sales",
      group: "sales",
    },
    {
      key: "sales.daily",
      name: "Daily Sales",
      permission: "reports.sales",
      group: "sales",
    },
    {
      key: "sales.by_product",
      name: "Product Sales",
      permission: "reports.sales",
      group: "sales",
    },
    {
      key: "sales.by_employee",
      name: "Sales by Employee",
      permission: "reports.sales",
      group: "sales",
    },
    {
      key: "sales.profit",
      name: "Profit Report",
      permission: "reports.financial",
      group: "financial",
    },
    {
      key: "sales.tax",
      name: "Tax Report",
      permission: "reports.financial",
      group: "financial",
    },
    {
      key: "sales.payments",
      name: "Payment Report",
      permission: "reports.sales",
      group: "sales",
    },
    {
      key: "sales.returns",
      name: "Refund & Return Report",
      permission: "reports.sales",
      group: "sales",
    },
  ],
  settings: [
    {
      key: "sales.allow_discounts",
      label: "Allow discounts",
      type: "boolean",
      scope: "business",
      default: true,
      permission: "settings.update",
      group: "Sales",
    },
    {
      key: "sales.max_discount_percent",
      label: "Maximum discount (%)",
      description: "Higher discounts require sales.discount_override.",
      type: "number",
      scope: "business",
      default: 20,
      permission: "settings.update",
      group: "Sales",
    },
    {
      key: "sales.default_payment_method",
      label: "Default payment method",
      type: "select",
      scope: "business",
      default: "cash",
      options: [
        { value: "cash", label: "Cash" },
        { value: "card", label: "Card" },
        { value: "upi", label: "UPI" },
        { value: "bank_transfer", label: "Bank transfer" },
      ],
      permission: "settings.update",
      group: "Sales",
    },
    {
      key: "sales.round_off",
      label: "Round off invoice totals",
      type: "boolean",
      scope: "business",
      default: true,
      permission: "settings.update",
      group: "Sales",
    },
    {
      key: "sales.receipt_footer",
      label: "Receipt footer",
      type: "textarea",
      scope: "business",
      default: "Thank you for shopping with us.",
      permission: "settings.update",
      group: "Sales",
    },
    {
      key: "sales.quotation_validity_days",
      label: "Quotation validity (days)",
      description: "An expired quotation must be revised before it can be converted.",
      type: "number",
      scope: "business",
      default: 15,
      permission: "settings.update",
      group: "Sales",
    },
    {
      key: "sales.loyalty_enabled",
      label: "Loyalty programme",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Sales",
    },
    {
      key: "sales.loyalty_points_per_currency",
      label: "Points earned per 100 spent",
      type: "number",
      scope: "business",
      default: 1,
      permission: "settings.update",
      group: "Sales",
    },
  ],
  events: [
    "SaleCompleted",
    "SaleCancelled",
    "SaleReturned",
    "PaymentReceived",
    "RefundIssued",
    "DiscountApplied",
  ],
};

/* ========================================================================== */
/* Point of sale                                                              */
/* ========================================================================== */

const pos: ModuleDef = {
  slug: "pos",
  name: "Point of Sale",
  description: "High-speed counter billing with barcode scanning.",
  category: "retail",
  icon: "ScanLine",
  version: "1.0.0",
  isCore: false,
  visibility: "business",
  dependencies: ["products", "inventory", "sales"],
  sortOrder: 15,
  features: [
    { slug: "pos.billing", name: "POS Billing", isDefault: true },
    { slug: "pos.barcode_scan", name: "Barcode Scanning", isDefault: true },
    { slug: "pos.sessions", name: "Cash Drawer Sessions" },
    { slug: "pos.offline", name: "Offline Mode" },
  ],
  permissions: [
    { action: "use", name: "Use POS", feature: "pos.billing" },
    {
      action: "open_session",
      name: "Open cash session",
      feature: "pos.sessions",
    },
    {
      action: "close_session",
      name: "Close cash session",
      feature: "pos.sessions",
    },
    { action: "void", name: "Void POS lines" },
  ],
  navigation: [
    {
      label: "Point of Sale",
      href: "/pos",
      icon: "ScanLine",
      permission: "pos.use",
      feature: "pos.billing",
    },
  ],
  widgets: [
    {
      key: "pos.active_session",
      name: "Current Shift",
      permission: "pos.use",
      feature: "pos.sessions",
      size: "small",
      priority: 20,
    },
  ],
  reports: [
    {
      key: "pos.cashier_performance",
      name: "Cashier Report",
      permission: "reports.employees",
      group: "employees",
    },
    {
      key: "pos.sessions",
      name: "Cash Session Report",
      permission: "reports.financial",
      feature: "pos.sessions",
      group: "financial",
    },
  ],
  settings: [
    {
      key: "pos.default_customer_walk_in",
      label: "Default to walk-in customer",
      type: "boolean",
      scope: "business",
      default: true,
      permission: "settings.update",
      group: "Point of Sale",
    },
    {
      key: "pos.require_session",
      label: "Require an open cash session to bill",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Point of Sale",
    },
    {
      key: "pos.print_receipt_automatically",
      label: "Print receipt after billing",
      type: "boolean",
      scope: "branch",
      default: true,
      permission: "settings.update",
      group: "Point of Sale",
    },
    {
      key: "pos.receipt_width",
      label: "Receipt width",
      type: "select",
      scope: "branch",
      default: "80mm",
      options: [
        { value: "58mm", label: "58 mm thermal" },
        { value: "80mm", label: "80 mm thermal" },
        { value: "a4", label: "A4 invoice" },
      ],
      permission: "settings.update",
      group: "Point of Sale",
    },
  ],
  events: ["PosSessionOpened", "PosSessionClosed", "PosSaleCompleted"],
};

/* ========================================================================== */
/* Customers                                                                  */
/* ========================================================================== */

const customers: ModuleDef = {
  slug: "customers",
  name: "Customers",
  description: "Customer profiles, groups, credit and loyalty.",
  category: "crm",
  icon: "Users",
  version: "1.0.0",
  isCore: false,
  visibility: "business",
  dependencies: [],
  sortOrder: 60,
  features: [
    { slug: "customers.profiles", name: "Customer Profiles", isDefault: true },
    { slug: "customers.groups", name: "Customer Groups", isDefault: true },
    { slug: "customers.addresses", name: "Multiple Addresses" },
    { slug: "customers.credit", name: "Credit Accounts" },
    { slug: "customers.loyalty", name: "Loyalty Programme" },
    { slug: "customers.notes", name: "Notes & Communication Log" },
    { slug: "customers.import", name: "Import Customers" },
    { slug: "customers.export", name: "Export Customers" },
    { slug: "customers.merge", name: "Merge Duplicates" },
  ],
  permissions: [
    { action: "view", name: "View customers" },
    { action: "create", name: "Create customers" },
    { action: "update", name: "Edit customers" },
    { action: "delete", name: "Delete customers" },
    {
      action: "credit",
      name: "Manage customer credit",
      feature: "customers.credit",
    },
    {
      action: "loyalty",
      name: "Manage loyalty points",
      feature: "customers.loyalty",
    },
    { action: "merge", name: "Merge customers", feature: "customers.merge" },
    { action: "import", name: "Import customers", feature: "customers.import" },
    { action: "export", name: "Export customers", feature: "customers.export" },
  ],
  navigation: [
    {
      label: "Customers",
      href: "/customers",
      icon: "Users",
      permission: "customers.view",
      children: [
        {
          label: "All Customers",
          href: "/customers",
          permission: "customers.view",
        },
        {
          label: "Groups",
          href: "/customers/groups",
          permission: "customers.update",
          feature: "customers.groups",
        },
      ],
    },
  ],
  widgets: [
    {
      key: "customers.total",
      name: "Total Customers",
      permission: "customers.view",
      size: "small",
      priority: 41,
    },
    {
      key: "customers.top",
      name: "Top Customers",
      permission: "customers.view",
      size: "medium",
      priority: 85,
    },
  ],
  reports: [
    {
      key: "customers.directory",
      name: "Customer Directory",
      permission: "reports.customers",
      group: "customers",
    },
    {
      key: "customers.purchases",
      name: "Customer Purchases",
      permission: "reports.customers",
      group: "customers",
    },
    {
      key: "customers.outstanding",
      name: "Outstanding Credit",
      permission: "reports.customers",
      feature: "customers.credit",
      group: "customers",
    },
    {
      key: "customers.loyalty",
      name: "Loyalty Summary",
      permission: "reports.customers",
      feature: "customers.loyalty",
      group: "customers",
    },
  ],
  settings: [
    {
      key: "customers.code_prefix",
      label: "Customer code prefix",
      type: "text",
      scope: "business",
      default: "CUS",
      permission: "settings.update",
      group: "Customers",
    },
    {
      key: "customers.phone_unique",
      label: "Require unique phone numbers",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Customers",
    },
    {
      key: "customers.default_credit_limit",
      label: "Default credit limit",
      type: "money",
      scope: "business",
      default: 0,
      permission: "settings.update",
      group: "Customers",
    },
  ],
  events: [
    "CustomerCreated",
    "CustomerUpdated",
    "CustomerCreditLimitChanged",
    "LoyaltyPointsEarned",
    "LoyaltyPointsRedeemed",
    "CustomerCreditLimitExceeded",
  ],
};

/* ========================================================================== */
/* Suppliers                                                                  */
/* ========================================================================== */

const suppliers: ModuleDef = {
  slug: "suppliers",
  name: "Suppliers",
  description: "Vendor profiles, terms, payables and performance.",
  category: "crm",
  icon: "Truck",
  version: "1.0.0",
  isCore: false,
  visibility: "business",
  dependencies: [],
  sortOrder: 70,
  features: [
    { slug: "suppliers.profiles", name: "Supplier Profiles", isDefault: true },
    { slug: "suppliers.contacts", name: "Multiple Contacts" },
    { slug: "suppliers.product_mapping", name: "Product Mapping" },
    { slug: "suppliers.contracts", name: "Contracts" },
    { slug: "suppliers.ratings", name: "Performance Ratings" },
    { slug: "suppliers.import", name: "Import Suppliers" },
    { slug: "suppliers.export", name: "Export Suppliers" },
    { slug: "suppliers.merge", name: "Merge Duplicates" },
  ],
  permissions: [
    { action: "view", name: "View suppliers" },
    { action: "create", name: "Create suppliers" },
    { action: "update", name: "Edit suppliers" },
    { action: "delete", name: "Delete suppliers" },
    { action: "payment", name: "View supplier payables" },
    {
      action: "contracts",
      name: "Manage contracts",
      feature: "suppliers.contracts",
    },
    { action: "merge", name: "Merge suppliers", feature: "suppliers.merge" },
    { action: "import", name: "Import suppliers", feature: "suppliers.import" },
    { action: "export", name: "Export suppliers", feature: "suppliers.export" },
  ],
  navigation: [
    {
      label: "Suppliers",
      href: "/suppliers",
      icon: "Truck",
      permission: "suppliers.view",
    },
  ],
  widgets: [
    {
      key: "suppliers.total",
      name: "Total Suppliers",
      permission: "suppliers.view",
      size: "small",
      priority: 42,
    },
    {
      key: "suppliers.top",
      name: "Top Suppliers",
      permission: "suppliers.view",
      size: "medium",
      priority: 86,
    },
  ],
  reports: [
    {
      key: "suppliers.directory",
      name: "Supplier Directory",
      permission: "reports.suppliers",
      group: "suppliers",
    },
    {
      key: "suppliers.outstanding",
      name: "Outstanding Payments",
      permission: "reports.suppliers",
      group: "suppliers",
    },
    {
      key: "suppliers.performance",
      name: "Supplier Performance",
      permission: "reports.suppliers",
      feature: "suppliers.ratings",
      group: "suppliers",
    },
  ],
  settings: [
    {
      key: "suppliers.code_prefix",
      label: "Supplier code prefix",
      type: "text",
      scope: "business",
      default: "SUP",
      permission: "settings.update",
      group: "Suppliers",
    },
  ],
  events: [
    "SupplierCreated",
    "SupplierUpdated",
    "SupplierBlocked",
    "SupplierRatingUpdated",
  ],
};

/* ========================================================================== */
/* Employees                                                                  */
/* ========================================================================== */

const employees: ModuleDef = {
  slug: "employees",
  name: "Employees",
  description: "Workforce records, roles, attendance and leave.",
  category: "hr",
  icon: "IdCard",
  version: "1.0.0",
  isCore: false,
  visibility: "business",
  dependencies: [],
  sortOrder: 80,
  features: [
    { slug: "employees.profiles", name: "Employee Profiles", isDefault: true },
    { slug: "employees.roles", name: "Role Assignment", isDefault: true },
    { slug: "employees.departments", name: "Departments & Designations" },
    { slug: "employees.attendance", name: "Attendance" },
    { slug: "employees.shifts", name: "Shift Management" },
    { slug: "employees.leave", name: "Leave Management" },
    { slug: "employees.export", name: "Export Employees" },
  ],
  permissions: [
    { action: "view", name: "View employees" },
    { action: "create", name: "Create employees" },
    { action: "update", name: "Edit employees" },
    { action: "delete", name: "Delete employees" },
    { action: "invite", name: "Invite employees" },
    { action: "suspend", name: "Suspend employees" },
    {
      action: "manage_roles",
      name: "Manage roles and permissions",
      description: "Create roles and change which permissions they grant.",
      feature: "employees.roles",
    },
    {
      action: "attendance",
      name: "Manage attendance",
      feature: "employees.attendance",
    },
    {
      action: "leave",
      name: "Manage leave",
      feature: "employees.leave",
    },
    { action: "export", name: "Export employees", feature: "employees.export" },
  ],
  navigation: [
    {
      label: "Employees",
      href: "/employees",
      icon: "IdCard",
      permission: "employees.view",
      children: [
        {
          label: "All Employees",
          href: "/employees",
          permission: "employees.view",
        },
        {
          label: "Roles & Permissions",
          href: "/employees/roles",
          permission: "employees.manage_roles",
          feature: "employees.roles",
        },
        {
          label: "Attendance",
          href: "/employees/attendance",
          permission: "employees.attendance",
          feature: "employees.attendance",
        },
        {
          label: "Shifts",
          href: "/employees/shifts",
          permission: "employees.update",
          feature: "employees.shifts",
        },
        {
          label: "Leave Requests",
          href: "/employees/leave",
          permission: "employees.leave",
          feature: "employees.leave",
        },
      ],
    },
  ],
  widgets: [
    {
      key: "employees.total",
      name: "Total Employees",
      permission: "employees.view",
      size: "small",
      priority: 43,
    },
    {
      key: "employees.present_today",
      name: "Present Today",
      permission: "employees.attendance",
      feature: "employees.attendance",
      size: "small",
      priority: 44,
    },
  ],
  reports: [
    {
      key: "employees.directory",
      name: "Employee Directory",
      permission: "reports.employees",
      group: "employees",
    },
    {
      key: "employees.attendance",
      name: "Attendance Report",
      permission: "reports.employees",
      feature: "employees.attendance",
      group: "employees",
    },
    {
      key: "employees.activity",
      name: "Activity Log",
      permission: "reports.audit",
      group: "audit",
    },
  ],
  settings: [
    {
      key: "employees.code_prefix",
      label: "Employee code prefix",
      type: "text",
      scope: "business",
      default: "EMP",
      permission: "settings.update",
      group: "Employees",
    },
    {
      key: "employees.leave_requires_approval",
      label: "Leave requires approval",
      type: "boolean",
      scope: "business",
      default: true,
      permission: "settings.update",
      group: "Employees",
    },
  ],
  events: [
    "EmployeeCreated",
    "EmployeeUpdated",
    "EmployeeSuspended",
    "RoleAssigned",
    "PermissionUpdated",
    "LeaveRequested",
    "LeaveApproved",
  ],
};

/* ========================================================================== */
/* Expenses                                                                   */
/* ========================================================================== */

const expenses: ModuleDef = {
  slug: "expenses",
  name: "Expenses",
  description: "Operating expenses feeding profit and cash reporting.",
  category: "finance",
  icon: "Wallet",
  version: "1.0.0",
  isCore: false,
  visibility: "business",
  dependencies: [],
  sortOrder: 90,
  features: [
    { slug: "expenses.records", name: "Expense Records", isDefault: true },
    { slug: "expenses.categories", name: "Expense Categories", isDefault: true },
    { slug: "expenses.approvals", name: "Expense Approvals" },
    { slug: "expenses.export", name: "Export Expenses" },
  ],
  permissions: [
    { action: "view", name: "View expenses" },
    { action: "create", name: "Record expenses" },
    { action: "update", name: "Edit expenses" },
    { action: "delete", name: "Delete expenses" },
    {
      action: "approve",
      name: "Approve expenses",
      feature: "expenses.approvals",
    },
    { action: "export", name: "Export expenses", feature: "expenses.export" },
  ],
  navigation: [
    {
      label: "Expenses",
      href: "/expenses",
      icon: "Wallet",
      permission: "expenses.view",
    },
  ],
  widgets: [
    {
      key: "expenses.month_total",
      name: "Expenses This Month",
      permission: "dashboard.view_financial",
      size: "small",
      priority: 53,
    },
  ],
  reports: [
    {
      key: "expenses.summary",
      name: "Expense Summary",
      permission: "reports.financial",
      group: "financial",
    },
  ],
  settings: [
    {
      key: "expenses.approval_required",
      label: "Require approval for expenses",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Expenses",
    },
    {
      key: "expenses.approval_threshold",
      label: "Approval threshold",
      description:
        "Expenses at or above this amount need approving. Zero means every expense does.",
      type: "money",
      scope: "business",
      default: 5000,
      permission: "settings.update",
      group: "Expenses",
    },
  ],
  events: ["ExpenseRecorded", "ExpenseApproved", "ExpenseRejected"],
};

/* ========================================================================== */
/* Reports                                                                    */
/* ========================================================================== */

const reports: ModuleDef = {
  slug: "reports",
  name: "Reports",
  description: "Operational, financial and audit reporting.",
  category: "analytics",
  icon: "ChartColumn",
  version: "1.0.0",
  isCore: false,
  visibility: "business",
  dependencies: [],
  sortOrder: 100,
  features: [
    { slug: "reports.basic", name: "Basic Reports", isDefault: true },
    { slug: "reports.advanced", name: "Advanced Reports" },
    { slug: "reports.financial", name: "Financial Reports" },
    { slug: "reports.export", name: "Report Export" },
    { slug: "reports.scheduled", name: "Scheduled Reports" },
    { slug: "reports.custom", name: "Custom Report Builder" },
  ],
  permissions: [
    { action: "view", name: "View reports" },
    { action: "sales", name: "View sales reports" },
    { action: "purchases", name: "View purchase reports" },
    { action: "inventory", name: "View inventory reports" },
    { action: "customers", name: "View customer reports" },
    { action: "suppliers", name: "View supplier reports" },
    { action: "employees", name: "View employee reports" },
    {
      action: "financial",
      name: "View financial reports",
      description: "Profit, tax, cash flow, receivables and payables.",
      feature: "reports.financial",
    },
    { action: "audit", name: "View audit reports" },
    { action: "export", name: "Export reports", feature: "reports.export" },
    {
      action: "schedule",
      name: "Schedule reports",
      feature: "reports.scheduled",
    },
    {
      action: "custom",
      name: "Build custom reports",
      feature: "reports.custom",
    },
  ],
  navigation: [
    {
      label: "Reports",
      href: "/reports",
      icon: "ChartColumn",
      permission: "reports.view",
    },
  ],
  widgets: [],
  reports: [],
  settings: [
    {
      key: "reports.default_page_size",
      label: "Report page size",
      type: "number",
      scope: "user",
      default: 50,
      group: "Reports",
    },
  ],
  events: ["ReportGenerated", "ReportExported"],
};

/* ========================================================================== */
/* Notifications                                                              */
/* ========================================================================== */

const notifications: ModuleDef = {
  slug: "notifications",
  name: "Notifications",
  description: "Event-driven alerts across channels.",
  category: "core",
  icon: "Bell",
  version: "1.0.0",
  isCore: true,
  visibility: "business",
  dependencies: [],
  sortOrder: 110,
  features: [
    { slug: "notifications.in_app", name: "In-App Notifications", isDefault: true },
    { slug: "notifications.email", name: "Email Notifications" },
    { slug: "notifications.sms", name: "SMS Notifications" },
    { slug: "notifications.whatsapp", name: "WhatsApp Notifications" },
    { slug: "notifications.broadcast", name: "Broadcast Messages" },
    { slug: "notifications.rules", name: "Notification Rules" },
  ],
  permissions: [
    { action: "view", name: "View notifications" },
    { action: "send", name: "Send notifications" },
    {
      action: "broadcast",
      name: "Broadcast to the organisation",
      feature: "notifications.broadcast",
    },
    { action: "manage_templates", name: "Manage templates" },
    {
      action: "manage_rules",
      name: "Manage rules",
      feature: "notifications.rules",
    },
    { action: "view_history", name: "View delivery history" },
  ],
  navigation: [
    {
      label: "Notifications",
      href: "/notifications",
      icon: "Bell",
      permission: "notifications.view",
      badgeKey: "notifications.unread",
      children: [
        {
          label: "Inbox",
          href: "/notifications",
          permission: "notifications.view",
        },
        {
          label: "My preferences",
          href: "/notifications/preferences",
          permission: "notifications.view",
        },
        {
          label: "Delivery",
          href: "/notifications/delivery",
          permission: "notifications.view_history",
        },
        {
          label: "Rules & templates",
          href: "/notifications/rules",
          permission: "notifications.manage_rules",
          feature: "notifications.rules",
        },
      ],
    },
  ],
  widgets: [],
  reports: [],
  settings: [
    {
      key: "notifications.email_enabled",
      label: "Email notifications",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Notifications",
    },
    {
      key: "notifications.sms_enabled",
      label: "SMS notifications",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Notifications",
    },
    {
      key: "notifications.whatsapp_enabled",
      label: "WhatsApp notifications",
      type: "boolean",
      scope: "business",
      default: false,
      permission: "settings.update",
      group: "Notifications",
    },
    {
      key: "notifications.quiet_from",
      label: "Quiet hours start",
      description:
        "Blank disables quiet hours. Critical notifications are always delivered.",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.update",
      group: "Notifications",
    },
    {
      key: "notifications.quiet_to",
      label: "Quiet hours end",
      description: "24-hour clock, e.g. 07:00.",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.update",
      group: "Notifications",
    },
  ],
  events: ["NotificationCreated", "NotificationRead", "BroadcastSent"],
};

/* ========================================================================== */
/* Settings                                                                   */
/* ========================================================================== */

/* ========================================================================== */
/* Stores — organisation scope                                                */
/* ========================================================================== */

/**
 * Who can see and administer which stores.
 *
 * This exists as its own module because store scope is not the concern of any
 * one business area. `stores.view_all` decides whether sales, purchases,
 * expenses, inventory, the dashboard and every report show one store or all of
 * them — so it must not live inside a module whose permissions someone might
 * reasonably edit for unrelated reasons. It previously sat in the dashboard
 * module as `dashboard.view_store`, where nothing hinted at that reach.
 *
 * The two `manage_*` permissions are what make a store manager possible: they
 * delegate administration of one store without granting business-wide control.
 */
const stores: ModuleDef = {
  slug: "stores",
  name: "Stores",
  description: "Which stores a user can see, and who administers each one.",
  category: "core",
  icon: "Store",
  version: "1.0.0",
  isCore: true,
  visibility: "business",
  dependencies: [],
  sortOrder: 15,
  features: [
    { slug: "stores.multi_store", name: "Multiple Stores", isDefault: true },
    { slug: "stores.delegated_admin", name: "Delegated Store Administration" },
    { slug: "stores.scoped_roles", name: "Store-Scoped Roles" },
  ],
  permissions: [
    {
      action: "view_all",
      name: "See every store's data",
      description:
        "Without this a user only ever sees the store they are working in — sales, purchases, expenses, stock and reports all narrow to it. This is the switch that makes someone a regional manager rather than a store manager.",
      feature: "stores.multi_store",
    },
    {
      action: "switch",
      name: "Switch between their stores",
      description:
        "Change the active store from the header. Only stores the user is assigned to are offered.",
    },
    {
      action: "manage_roles",
      name: "Manage roles for their stores",
      description:
        "Create and edit roles that apply only within a store the user administers. Cannot grant a permission the user does not hold themselves.",
      feature: "stores.scoped_roles",
    },
    {
      action: "manage_staff",
      name: "Assign staff to their stores",
      description:
        "Add and remove employees in a store the user administers, and set which roles they hold there.",
      feature: "stores.delegated_admin",
    },
  ],
  navigation: [],
  widgets: [],
  reports: [],
  settings: [],
  events: ["StoreRoleCreated", "StoreStaffAssigned", "StoreStaffRemoved"],
};

const settings: ModuleDef = {
  slug: "settings",
  name: "Settings",
  description: "Business profile, stores, modules and security configuration.",
  category: "core",
  icon: "Settings",
  version: "1.0.0",
  isCore: true,
  visibility: "business",
  dependencies: [],
  sortOrder: 120,
  features: [
    { slug: "settings.general", name: "General Settings", isDefault: true },
    { slug: "settings.stores", name: "Multi-Store Management" },
    { slug: "settings.warehouses", name: "Warehouse Management" },
    { slug: "settings.numbering", name: "Document Numbering", isDefault: true },
    { slug: "settings.security", name: "Security Policies" },
    { slug: "settings.integrations", name: "Integrations" },
    { slug: "settings.backup", name: "Backup & Restore" },
  ],
  permissions: [
    { action: "view", name: "View settings" },
    { action: "update", name: "Change settings" },
    { action: "organization", name: "Edit organisation profile" },
    {
      action: "stores",
      name: "Manage stores",
      description: "Create, edit and deactivate the business's stores.",
      feature: "settings.stores",
    },
    {
      action: "warehouses",
      name: "Manage warehouses",
      feature: "settings.warehouses",
    },
    { action: "modules", name: "View module status" },
    { action: "tax", name: "Manage tax configuration" },
    {
      action: "numbering",
      name: "Manage document numbering",
      feature: "settings.numbering",
    },
    {
      action: "security",
      name: "Manage security policies",
      feature: "settings.security",
    },
    {
      action: "integrations",
      name: "Manage integrations",
      feature: "settings.integrations",
    },
    { action: "backup", name: "Create backups", feature: "settings.backup" },
    { action: "restore", name: "Restore backups", feature: "settings.backup" },
  ],
  navigation: [
    {
      label: "Settings",
      href: "/settings",
      icon: "Settings",
      permission: "settings.view",
      children: [
        {
          label: "Organisation",
          href: "/settings",
          permission: "settings.view",
        },
        {
          label: "Stores",
          href: "/settings/stores",
          permission: "settings.stores",
          feature: "settings.stores",
        },
        {
          label: "Warehouses",
          href: "/settings/warehouses",
          permission: "settings.warehouses",
          feature: "settings.warehouses",
        },
        {
          label: "Modules",
          href: "/settings/modules",
          permission: "settings.modules",
        },
        {
          label: "Numbering",
          href: "/settings/numbering",
          permission: "settings.numbering",
          feature: "settings.numbering",
        },
        {
          label: "Preferences",
          href: "/settings/preferences",
          permission: "settings.view",
        },
        {
          label: "Security",
          href: "/settings/security",
          permission: "settings.security",
          feature: "settings.security",
        },
        {
          label: "Taxes",
          href: "/settings/taxes",
          permission: "settings.tax",
        },
        {
          label: "Integrations",
          href: "/settings/integrations",
          permission: "settings.integrations",
          feature: "settings.integrations",
        },
        {
          label: "Backup",
          href: "/settings/backup",
          permission: "settings.backup",
          feature: "settings.backup",
        },
        {
          label: "Licence",
          href: "/settings/license",
          permission: "settings.view",
        },
      ],
    },
  ],
  widgets: [],
  reports: [],
  settings: [
    {
      key: "tax.registration_number",
      label: "Tax registration number",
      description: "Printed on every invoice that carries tax.",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.tax",
      group: "Tax",
    },
    {
      key: "tax.default_mode",
      label: "Default tax mode",
      description:
        "Whether a product's price already includes tax. Individual tax groups can override this.",
      type: "select",
      scope: "business",
      default: "exclusive",
      options: [
        { value: "exclusive", label: "Exclusive — tax added at billing" },
        { value: "inclusive", label: "Inclusive — price already contains tax" },
      ],
      permission: "settings.tax",
      group: "Tax",
    },
    {
      key: "tax.show_breakdown_on_receipt",
      label: "Show tax breakdown on receipts",
      type: "boolean",
      scope: "business",
      default: true,
      permission: "settings.tax",
      group: "Tax",
    },
    {
      key: "integrations.webhook_url",
      label: "Webhook endpoint",
      description:
        "Business events are POSTed here when a notification rule includes the webhook channel.",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.integrations",
      group: "Integrations",
    },
    {
      key: "integrations.webhook_secret",
      label: "Webhook signing secret",
      description: "Used to sign the payload so the receiver can verify it.",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.integrations",
      group: "Integrations",
    },
    {
      key: "integrations.api_enabled",
      label: "REST API enabled",
      type: "boolean",
      scope: "business",
      default: true,
      permission: "settings.integrations",
      group: "Integrations",
    },
    /* Outbound message providers.
       No SMTP or provider SDK is bundled — email, SMS and WhatsApp all leave
       through whatever HTTP API the business already pays for, which keeps a
       mail stack out of a self-hosted retail install. A channel with no endpoint
       here is treated as unconfigured and its messages fail permanently rather
       than retrying against nothing. */
    {
      key: "integrations.email_endpoint",
      label: "Email API endpoint",
      description:
        "HTTP endpoint that accepts {from, to, subject, text} and sends the mail. Leave blank to keep email notifications in-app only.",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.integrations",
      group: "Integrations",
    },
    {
      key: "integrations.email_api_key",
      label: "Email API key",
      description: "Sent as a bearer token. Stored as written.",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.integrations",
      group: "Integrations",
    },
    {
      key: "integrations.email_from",
      label: "Email from address",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.integrations",
      group: "Integrations",
    },
    {
      key: "integrations.sms_endpoint",
      label: "SMS API endpoint",
      description:
        "Receives {channel, to, message}. Leave blank to keep SMS notifications in-app only.",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.integrations",
      group: "Integrations",
    },
    {
      key: "integrations.sms_api_key",
      label: "SMS API key",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.integrations",
      group: "Integrations",
    },
    {
      key: "integrations.whatsapp_endpoint",
      label: "WhatsApp API endpoint",
      description: "Receives {channel, to, message}, same shape as SMS.",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.integrations",
      group: "Integrations",
    },
    {
      key: "integrations.whatsapp_api_key",
      label: "WhatsApp API key",
      type: "text",
      scope: "business",
      default: "",
      permission: "settings.integrations",
      group: "Integrations",
    },
    {
      key: "general.currency",
      label: "Currency",
      type: "select",
      scope: "business",
      default: "INR",
      options: [
        { value: "INR", label: "Indian Rupee (₹)" },
        { value: "USD", label: "US Dollar ($)" },
        { value: "EUR", label: "Euro (€)" },
        { value: "GBP", label: "Pound Sterling (£)" },
        { value: "AED", label: "UAE Dirham (د.إ)" },
      ],
      permission: "settings.update",
      group: "General",
    },
    {
      key: "general.decimal_places",
      label: "Decimal places",
      type: "number",
      scope: "business",
      default: 2,
      permission: "settings.update",
      group: "General",
    },
    {
      key: "general.timezone",
      label: "Time zone",
      type: "text",
      scope: "business",
      default: "Asia/Kolkata",
      permission: "settings.update",
      group: "General",
    },
    {
      key: "general.date_format",
      label: "Date format",
      type: "select",
      scope: "business",
      default: "dd MMM yyyy",
      options: [
        { value: "dd MMM yyyy", label: "31 Jul 2026" },
        { value: "dd/MM/yyyy", label: "31/07/2026" },
        { value: "MM/dd/yyyy", label: "07/31/2026" },
        { value: "yyyy-MM-dd", label: "2026-07-31" },
      ],
      permission: "settings.update",
      group: "General",
    },
    {
      key: "general.page_size",
      label: "Rows per page",
      type: "number",
      scope: "business",
      default: 25,
      permission: "settings.update",
      group: "General",
    },
    {
      key: "security.session_timeout_minutes",
      label: "Session timeout (minutes)",
      type: "number",
      scope: "business",
      default: 720,
      permission: "settings.security",
      group: "Security",
    },
    {
      key: "security.password_min_length",
      label: "Minimum password length",
      type: "number",
      scope: "business",
      default: 8,
      permission: "settings.security",
      group: "Security",
    },
    {
      key: "security.max_login_attempts",
      label: "Maximum failed login attempts",
      type: "number",
      scope: "business",
      default: 5,
      permission: "settings.security",
      group: "Security",
    },
    {
      key: "security.lockout_minutes",
      label: "Lockout duration (minutes)",
      type: "number",
      scope: "business",
      default: 15,
      permission: "settings.security",
      group: "Security",
    },
  ],
  events: [
    "SettingUpdated",
    "StoreCreated",
    "WarehouseCreated",
    "NumberSequenceUpdated",
  ],
};

/* ========================================================================== */
/* Administration — the business admin panel                                  */
/* ========================================================================== */

/**
 * Administrative capability: licence, plans, the module registry, feature
 * flags, announcements and the audit log.
 *
 * These are the owner-level actions described in 04-rbac.md § Business Owner
 * Restrictions. They live in the same RBAC namespace as operational
 * permissions — there is no separate platform namespace in a single-business
 * installation — but they are grouped apart in the role editor and are held
 * only by the Owner role out of the box.
 */
const admin: ModuleDef = {
  slug: "admin",
  name: "Administration",
  description: "Licence, registry, announcements and the audit trail.",
  category: "core",
  icon: "ShieldCheck",
  version: "1.0.0",
  isCore: true,
  visibility: "admin",
  dependencies: [],
  sortOrder: 130,
  features: [
    { slug: "admin.panel", name: "Admin Panel", isDefault: true },
    { slug: "admin.licensing", name: "Licence Management", isDefault: true },
    { slug: "admin.registry", name: "Module Registry", isDefault: true },
    { slug: "admin.flags", name: "Feature Flags" },
    { slug: "admin.announcements", name: "Announcements" },
    { slug: "admin.audit", name: "Audit Log", isDefault: true },
  ],
  permissions: [
    {
      action: "panel",
      name: "Access the admin panel",
      description: "Required for every other administrative action.",
      feature: "admin.panel",
    },
    {
      action: "license_manage",
      name: "Manage the licence",
      description: "Change plan, extend expiry and apply entitlement overrides.",
      feature: "admin.licensing",
    },
    {
      action: "plan_manage",
      name: "Create and edit plans",
      feature: "admin.licensing",
    },
    {
      action: "registry_view",
      name: "View the module registry",
      feature: "admin.registry",
    },
    {
      action: "flag_manage",
      name: "Manage feature flags",
      feature: "admin.flags",
    },
    {
      action: "announcement_manage",
      name: "Manage announcements",
      feature: "admin.announcements",
    },
    {
      action: "audit_view",
      name: "View the audit log",
      feature: "admin.audit",
    },
    {
      action: "business_status",
      name: "Change business status",
      description: "Suspend, archive or reactivate the whole installation.",
    },
  ],
  navigation: [
    {
      label: "Administration",
      href: "/admin",
      icon: "ShieldCheck",
      permission: "admin.panel",
      children: [
        { label: "Overview", href: "/admin", permission: "admin.panel" },
        {
          /* Deliberately gated on admin.panel rather than its own feature: the
             queue is infrastructure, and a licence that could switch it off
             would silently stop notification delivery. */
          label: "Background Jobs",
          href: "/admin/jobs",
          permission: "admin.panel",
          feature: "admin.panel",
        },
        {
          label: "Licence",
          href: "/admin/license",
          permission: "admin.license_manage",
          feature: "admin.licensing",
        },
        {
          label: "Plans",
          href: "/admin/plans",
          permission: "admin.plan_manage",
          feature: "admin.licensing",
        },
        {
          label: "Registry",
          href: "/admin/registry",
          permission: "admin.registry_view",
          feature: "admin.registry",
        },
        {
          label: "Feature Flags",
          href: "/admin/flags",
          permission: "admin.flag_manage",
          feature: "admin.flags",
        },
        {
          label: "Announcements",
          href: "/admin/announcements",
          permission: "admin.announcement_manage",
          feature: "admin.announcements",
        },
        {
          label: "Audit Log",
          href: "/admin/audit",
          permission: "admin.audit_view",
          feature: "admin.audit",
        },
      ],
    },
  ],
  widgets: [],
  reports: [
    {
      key: "admin.audit_trail",
      name: "Audit Trail",
      description: "Every recorded event, with actor and originating address.",
      permission: "admin.audit_view",
      feature: "admin.audit",
      group: "audit",
    },
  ],
  settings: [],
  events: [
    "BusinessSetupCompleted",
    "BusinessActivated",
    "BusinessSuspended",
    "BusinessArchived",
    "PlanCreated",
    "PlanUpdated",
    "LicenseAssigned",
    "LicenseOverridden",
    "LicenseExtended",
    "FeatureFlagUpdated",
    "AnnouncementPublished",
  ],
};

/* ========================================================================== */

/** Every module in the installation, in navigation order. */
export const ALL_MODULE_DEFS: ModuleDef[] = [
  dashboard,
  stores,
  pos,
  products,
  inventory,
  purchases,
  sales,
  customers,
  suppliers,
  employees,
  expenses,
  reports,
  notifications,
  settings,
  admin,
];
