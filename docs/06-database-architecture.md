# 06-database-architecture.md

# Database Architecture

Version: **1.0.0**

---

# Overview

The database architecture is designed around four primary principles:

* Single-Business Ownership
* Data Integrity
* Auditability
* Scalability

Every business operation in StoqBook persists through a structured data model.

The database should support:

* One Business (per installation)
* Millions of Products
* Millions of Transactions
* Multiple Stores (Branches)
* Warehouses
* Dynamic Modules
* Dynamic Permissions

without redesigning the schema.

---

# Database Philosophy

The database is the source of truth.

Business rules are enforced at the application layer while the database guarantees:

* Integrity
* Consistency
* Referential relationships
* Historical records

---

# Database Layers

```text
Admin / Config Data

↓

Business Data

↓

Business Modules

↓

Transactions

↓

Reports

↓

Audit Logs
```

---

# Entity Classification

The system is divided into six logical entity groups.

```text
Admin (formerly "Platform")

Organization (Business Profile + Stores)

Business (Products, Catalog, Partners)

Transactions

Analytics

Security
```

---

# Admin Entities

Admin-level entities that control the installation configuration.

```text
Business (single row — the installed company)

Licenses

Plans

Modules

Features

Permissions

Feature Flags

Announcements

Audit Logs
```

These are the configuration layer. There is exactly one business row per installation.

---

# Organization Entities

```text
Business Profile (one row)

Stores (Branches)

Warehouses

Departments

Employees

Roles

Users
```

---

# Business Entities

```text
Products

Categories

Brands

Units

Variants

Taxes

Customers

Suppliers

Expenses
```

---

# Transaction Entities

```text
Purchases

Purchase Items

Sales

Sale Items

Inventory Movements

Stock Adjustments

Transfers

Returns

Payments

Receipts
```

---

# Reporting Entities

```text
Dashboard Cache

Generated Reports

Analytics

Snapshots
```

---

# Security Entities

```text
Sessions

Login History

Notifications

Audit Logs

Permission Logs
```

---

# Business (tenant) Column — Single-Installation Notes

In the database schema, the `tenant_id` column continues to exist for structural reasons. It always holds the single business's ID.

In a per-installation deployment:

* There is exactly **one row** in the `tenants` / businesses table.
* All `tenant_id` references point to that one row.
* The application loads this ID at startup and uses it for every query.
* No multi-tenant switching occurs.

This design means the schema is forward-compatible if you ever need to support multiple businesses on one server in the future, while operating as a clean single-business system today.

---

# Store (Branch) Isolation

Store-aware tables contain

```text
branch_id
```

Examples

* Inventory
* Sales
* Purchases
* Expenses

This allows reporting and filtering by individual stores.

---

# Warehouse Isolation

Warehouse-aware tables contain

```text
warehouse_id
```

Examples

Inventory

Transfers

Receiving

---

# Primary Key Strategy

Every table has

```text
id
```

Primary keys never change.

Business identifiers such as invoice numbers are separate columns.

---

# Foreign Keys

Relationships use foreign keys.

Example

```text
Product

↓

Category

↓

Brand

↓

Unit
```

---

# Naming Convention

Tables

Plural

```text
products

customers

suppliers

sales
```

Columns

Snake Case

```text
product_name

selling_price

created_at
```

---

# Standard Columns

Every table includes

```text
id

created_at

updated_at

created_by

updated_by
```

Business-owned tables additionally include

```text
tenant_id (always the single business ID)
```

Store-scoped tables

```text
branch_id
```

Warehouse-scoped tables

```text
warehouse_id
```

---

# Soft Delete Strategy

Business records should rarely be physically deleted.

Instead

```text
deleted_at
```

Examples

Products

Customers

Suppliers

Employees

Categories

---

# Immutable Data

The following records should never be deleted.

* Sales
* Purchase Invoices
* Inventory Ledger
* Audit Logs
* Payment History

Corrections occur through reversal transactions.

---

# Audit Columns

Sensitive tables include

```text
created_by

updated_by

deleted_by
```

Allowing complete traceability.

---

# Entity Relationships

```text
Business

↓

Store (Branch)

↓

Warehouse

↓

Inventory

↓

Products
```

---

```text
Customer

↓

Sales

↓

Sale Items

↓

Payments
```

---

```text
Supplier

↓

Purchases

↓

Purchase Items

↓

Payments
```

---

# Inventory Ledger

Inventory is event-driven.

There is no direct stock overwrite.

Every stock change creates a movement.

```text
Purchase

↓

Inventory Movement

↓

Current Stock
```

Another example

```text
Sale

↓

Inventory Movement

↓

Current Stock
```

---

# Current Stock

Current stock is always calculated from movements or maintained as an optimized balance synchronized with the movement ledger.

The movement history remains the authoritative record.

---

# Data Ownership

Every record belongs to the business.

Examples

```text
Business

↓

Products

↓

Inventory

↓

Sales
```

Ownership never changes.

---

# Referential Integrity

Deletion rules

Organization

Cannot delete while stores exist.

Store (Branch)

Cannot delete while inventory exists.

Product

Cannot delete while sales exist.

Customer

Cannot delete while invoices exist.

Supplier

Cannot delete while purchases exist.

---

# Versioned Business Data

Certain records maintain versions.

Examples

Settings

Receipt Templates

Tax Rules

Invoice Templates

Older versions remain recoverable.

---

# Indexing Strategy

Indexes should exist for

* tenant_id
* branch_id
* warehouse_id
* sku
* barcode
* invoice_number
* customer_phone
* supplier_name
* created_at
* updated_at

Composite indexes are used for frequently filtered combinations such as:

```text
tenant_id + branch_id

tenant_id + sku

tenant_id + barcode
```

---

# Search Strategy

Business search fields

Products

* Name
* SKU
* Barcode

Customers

* Name
* Phone

Suppliers

* Name
* Email

Sales

* Invoice Number

Purchases

* Purchase Number

---

# Archiving Strategy

Old transactional data can be archived.

Examples

Sales older than configurable retention.

Purchase history.

Notification history.

Audit logs remain according to retention policies.

---

# Backup Strategy

The platform supports

* Full Backup
* Incremental Backup
* Store Backup
* Point-in-Time Recovery

---

# Restore Strategy

Supported restores

* Entire Installation
* Single Store Data
* Individual Backup Snapshot

---

# Database Security

Sensitive fields should be protected.

Examples

* Passwords
* API Keys
* Tokens

Personally identifiable information should follow applicable privacy regulations.

---

# Migration Strategy

Schema updates must be versioned.

Migration principles

* Forward compatible
* Backward safe where possible
* No destructive migrations without validation
* Preserve business history

---

# Performance Strategy

The schema is designed for

* High read throughput
* High write throughput
* Efficient reporting
* Fast filtering
* Fast pagination

Large reports should rely on aggregated datasets rather than scanning transactional tables.

---

# Database Principles

* Single-business per installation.
* `tenant_id` always points to the one installed business.
* Immutable financial history.
* Soft delete where appropriate.
* Normalize business entities.
* Preserve referential integrity.
* Never overwrite transactional history.
* Every transaction is traceable.
* Every entity has clear ownership.
* Optimize for both operational and analytical workloads.

---

# Next Document

**07-products.md**

This document will define the complete Product Management module, including categories, brands, units, variants, pricing, taxes, barcodes, product lifecycle, inventory integration, and all related business rules.
