# 07-products.md

# Product Management Module

Version: **1.0.0**

---

# Overview

The Product Management module is the foundation of StoqBook.

Every inventory movement, purchase, sale, return, stock adjustment, transfer, and report revolves around products.

The module is designed to support retailers ranging from a small grocery store to a multi-branch enterprise.

---

# Objectives

The Product module should provide:

* Centralized Product Catalog
* Multiple Product Types
* Categories
* Brands
* Units
* Variants
* Multiple Pricing
* Barcode Management
* QR Codes
* Product Images
* Tax Configuration
* Supplier Mapping
* Inventory Integration

---

# Product Architecture

```text
Products
│
├── Categories
├── Brands
├── Units
├── Variants
├── Pricing
├── Barcode
├── Images
├── Suppliers
├── Taxes
├── Inventory
└── Audit
```

---

# Product Types

Supported product types.

```text
Physical

Digital

Service

Bundle

Composite

Variant Product
```

Retail businesses primarily use Physical products.

---

# Product Lifecycle

```text
Created

↓

Draft

↓

Published

↓

Available

↓

Discontinued

↓

Archived
```

---

# Product Information

Every product contains

General

* Product Name
* SKU
* Barcode
* QR Code
* Description

Classification

* Category
* Brand
* Unit

Pricing

* Cost Price
* Selling Price
* Wholesale Price
* Discount Price

Inventory

* Track Inventory
* Reorder Level
* Minimum Stock
* Maximum Stock

Tax

* Tax Group
* Tax Percentage

Media

* Product Images

Status

* Active
* Inactive

---

# Product Identification

Every product should have

```text
SKU

Barcode

(Optional)

QR Code
```

SKU must be unique within a tenant.

Barcode should also be unique.

---

# SKU Strategy

Example

```text
ELEC-0001

MOB-0012

GROC-0451
```

Generated automatically or manually.

---

# Barcode

Supported barcode formats

* EAN-13
* UPC
* Code 128
* Code 39

Barcode should support

* Printing
* Scanning
* Searching

---

# QR Code

Optional.

Useful for

* Internal inventory
* Asset tracking
* Mobile scanning

---

# Categories

Categories organize products.

Example

```text
Electronics

Groceries

Fashion

Books

Furniture
```

Categories may contain subcategories.

---

# Category Hierarchy

```text
Electronics

├── Mobile

├── Laptop

└── Accessories
```

Unlimited nesting supported.

---

# Brands

Example

```text
Samsung

Apple

Sony

Nike

Adidas
```

Products may optionally belong to brands.

---

# Units

Supported units

```text
Piece

Box

Carton

Packet

Kg

Gram

Liter

Meter
```

Custom units can be created.

---

# Product Variants

Variants inherit from a parent product.

Example

T-Shirt

```text
Size

S

M

L

XL
```

Color

```text
Red

Blue

Black
```

Each variant has

* SKU
* Barcode
* Price
* Inventory

---

# Variant Structure

```text
T-Shirt

↓

Blue

↓

Large

↓

SKU

↓

Inventory
```

---

# Product Images

Supports

* Primary Image
* Gallery Images

Images are optional.

---

# Pricing Engine

Supports

* Cost Price
* Selling Price
* Wholesale Price
* Discount Price

Future

* Customer-specific pricing
* Branch pricing
* Seasonal pricing

---

# Cost Price

Used for

* Profit calculation
* Purchase comparison
* Inventory valuation

Never shown to unauthorized users.

---

# Selling Price

Default customer price.

---

# Wholesale Price

Used for wholesale customers.

---

# Discount Price

Temporary promotional pricing.

Can have

* Start Date
* End Date

---

# Product Tax

Each product belongs to one tax group.

Example

```text
GST 5%

GST 12%

GST 18%
```

Tax calculation occurs during sales.

---

# Supplier Mapping

One product may have multiple suppliers.

Each supplier stores

* Purchase Price
* Lead Time
* Preferred Supplier

---

# Product Status

```text
Draft

Active

Inactive

Discontinued

Archived
```

Inactive products cannot be sold.

---

# Inventory Integration

Product inventory is maintained separately.

Product

↓

Inventory

↓

Stock Movements

Products never directly store stock history.

---

# Search

Products searchable by

* Name
* SKU
* Barcode
* Category
* Brand

---

# Product Filters

Supported filters

* Category
* Brand
* Status
* Low Stock
* Out of Stock
* Active
* Inactive

---

# Product Import

Bulk import supports

* CSV
* Excel

Imported fields

* Name
* SKU
* Barcode
* Price
* Category
* Brand
* Unit

Validation occurs before import.

---

# Product Export

Supports

* CSV
* Excel

Filters apply before export.

---

# Duplicate Detection

Duplicate checks include

* SKU
* Barcode

Product names may repeat if business allows.

---

# Product Archive

Archived products

* Hidden from normal lists
* Cannot be sold
* Historical transactions remain intact

---

# Product Deletion

Products cannot be permanently deleted if referenced by

* Sales
* Purchases
* Inventory
* Returns

Archive instead.

---

# Product Audit

Every change is recorded.

Examples

* Product Created
* Product Updated
* Price Changed
* Barcode Changed
* Category Changed

---

# Product Permissions

```text
products.view

products.create

products.update

products.delete

products.archive

products.import

products.export

products.print_barcode
```

---

# Product Dashboard Widgets

Examples

* Total Products
* Active Products
* Low Stock Products
* Out of Stock
* Recently Added

---

# Business Rules

* SKU must be unique within a tenant.
* Barcode must be unique.
* Archived products cannot be sold.
* Cost price cannot be negative.
* Selling price cannot be negative.
* Variants inherit from parent products.
* Inventory belongs to products, not categories.
* Historical transactions always reference the original product.

---

# Future Enhancements

* Product Kits
* Composite Products
* Serial Number Tracking
* Batch Tracking
* Expiry Management
* Vendor Catalog Synchronization
* AI Product Categorization
* Image Recognition
* Dynamic Pricing Rules
* Marketplace Synchronization

---

# Module Relationships

```text
Products
│
├── Inventory
├── Purchases
├── Sales
├── POS
├── Reports
├── Suppliers
└── Analytics
```

Every retail operation begins with a product.

---

# Next Document

**08-inventory.md**

This document defines the complete inventory engine, including stock ledger architecture, stock movements, reservations, adjustments, transfers, physical stock counting, valuation methods (FIFO, LIFO, Weighted Average), reorder rules, batch/expiry handling, and inventory business rules.
