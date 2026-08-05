# 02-business-structure.md

# Business Structure

Version: **1.0.0**

---

# Overview

StoqBook serves **one business per installation**.

A business is the top-level entity in the system. Everything — stores, warehouses, users, products, inventory, sales, purchases — belongs to this single business.

The business owner decides how to structure their operations:

* One store or many stores
* One warehouse or many warehouses
* One user or many users

All configurations are supported without architectural changes.

---

# What is a Business?

The Business is the single organization that owns this StoqBook installation.

Everything belongs to the business.

```text
Business
│
├── Business Profile
├── License
├── Stores (Branches)
├── Warehouses
├── Users
├── Roles
├── Products
├── Inventory
├── Customers
├── Suppliers
├── Purchases
├── Sales
├── Reports
└── Settings
```

There is only one business per installation.

---

# Business Profile

The business profile holds the identity and branding of the company.

Typical information

* Business Name
* Legal Name
* Logo
* Contact Details
* Address
* Tax Number
* Registration Number
* Currency
* Timezone
* Country

The business profile is configured during the first-run setup wizard and can be updated at any time from the admin panel.

---

# Business Status

The business has a status that controls system access.

```text
Created

↓

Active

↓

Suspended

↓

Archived
```

---

## Created

Initial state after installation.

Setup wizard has not been completed.

---

## Active

Business is fully operational.

Users can log in.

All business operations are available.

---

## Suspended

Access is blocked.

Possible reasons:

* License expired
* Security issue
* Manual suspension

Data remains intact.

---

## Archived

Business is inactive.

Cannot log in.

Data retained.

---

# Business Setup Flow

When StoqBook is installed for the first time:

```text
Installation

↓

Setup Wizard

↓

Business Profile Created

↓

Owner Account Created

↓

Default License Assigned

↓

Default Modules Enabled

↓

Default Roles Created

↓

Default Settings Created

↓

Business Active
```

---

# Default Resources

When the business is set up, the system automatically provisions:

## Business Profile

The company identity.

---

## Owner Account

Primary administrator with all permissions.

---

## License

Default license (lifetime or trial depending on installation type).

---

## Roles

* Owner
* Manager
* Cashier
* Inventory Manager
* Accountant

---

## Settings

* Currency
* Timezone
* Tax
* Receipt
* Language

---

## Modules

According to the assigned license.

---

# Store (Branch)

A store represents a physical retail outlet belonging to the business.

A business can have:

* 1 store (single-location business)
* 2–10 stores (growing business)
* 10+ stores (enterprise retail chain)

All stores are managed from the same system.

Examples

* Downtown Main Store
* Mall Outlet
* Airport Branch
* Franchise Location A

---

## What a Store Owns

```text
Store

├── Employees (primary assignment)
├── Warehouses
├── Inventory
├── Sales
├── Purchases
├── Expenses
└── Settings
```

---

## Store Attributes

* Store Name
* Store Code (unique identifier)
* Address
* Contact Details
* Timezone (can differ from business)
* Currency (can differ from business)
* Document Prefix (e.g. INV-A-, INV-B-)
* Default Warehouse
* Active / Inactive status

---

## Store Lifecycle

```text
Created

↓

Active

↓

Inactive (suspended)

↓

Deleted (soft)
```

---

## Default Store

Every business has a default store.

The default store is selected automatically when a user does not have an active store session.

---

# Warehouse

Warehouses hold inventory.

A warehouse always belongs to a store.

A warehouse may serve:

* One store only
* Multiple stores (shared warehouse)

Supports:

* Rack layout
* Bin organization
* Zone layout

---

## Warehouse Attributes

* Warehouse Name
* Warehouse Code
* Address
* Valuation Method (Weighted Average, FIFO, LIFO)
* Active / Inactive

---

# Departments

Optional organizational units within the business.

Examples

* Sales
* Warehouse
* Finance
* Administration

Useful for employee assignment and reporting.

---

# Business Settings

The business has centralized settings.

Examples

General

* Name
* Logo
* Currency
* Language

Business

* Tax
* Invoice Prefix
* Barcode Format

Inventory

* Stock Method
* Reorder Rules

Sales

* Discounts
* Receipt Template

Security

* Password Policy
* Session Timeout

Notifications

* Email
* SMS
* Push

---

# Business Branding

The business can customize:

* Logo
* Brand Color
* Receipt Header
* Invoice Footer
* Email Templates

---

# License Assignment

The business owns exactly one active license.

The license determines:

* Available modules
* Enabled features
* User limits
* Store limits
* Storage limits
* Billing mode

The business owner manages the license from the admin panel.

See **03-license-system.md** for full license documentation.

---

# Business Ownership

The business has one primary owner account.

Owner responsibilities

* Manage employees
* Manage stores
* Manage licenses
* Configure settings
* Assign roles
* View all reports

The owner role has implicit access to all permissions.

---

# Business Limits

Limits are controlled by the assigned license.

Examples

* Maximum stores (branches)
* Maximum employees
* Maximum products
* Maximum storage
* Maximum warehouses

---

# Enterprise Deployment

Large organizations may structure themselves as:

```text
Business

↓

Corporate Settings

↓

Stores (many)

↓

Warehouses (per store or shared)

↓

Users (assigned to stores)
```

All managed under one business installation.

---

# Store-Level User Access

Users are assigned to stores (branches).

A user can have access to:

* One store (typical for cashiers)
* Multiple stores (typical for managers)
* All stores (typical for owner / admin)

The business owner controls which users can access which stores.

---

# Data Ownership

All data belongs to the business.

Examples

* Products (shared across all stores by default)
* Inventory (per store / per warehouse)
* Sales (per store)
* Reports (can be per-store or business-wide)
* Customers (shared or scoped)

---

# Store vs Business Scope

Some data is business-wide. Some data is store-scoped.

| Data | Scope |
|---|---|
| Products | Business-wide (shared catalog) |
| Customers | Business-wide by default |
| Suppliers | Business-wide |
| Employees | Assigned to stores |
| Inventory | Per warehouse / store |
| Sales | Per store |
| Purchases | Per store |
| Reports | Business-wide or per-store |
| Settings | Business-wide with store overrides |

---

# Business Principles

* One business per installation.
* The business owns everything.
* Stores are physical locations owned by the business.
* Warehouses serve one or more stores.
* Users are assigned to one or more stores.
* Products and customers are business-wide by default.
* Inventory and sales are store-scoped.
* All operations execute within the business context.
* Business setup is guided by a first-run wizard.

---

# Next Document

**03-license-system.md**

The next document defines:

* License architecture
* Plans
* Billing modes
* Feature entitlements
* Overrides
* Trials
* Lifetime licenses
* License validation workflow
