# StoqBook

> **The Modern Retail Operating System**

Version: **1.0.0**
Document: **00-introduction.md**

---

# About

**StoqBook** is a modular, single-business retail management platform sold as a **perpetual-license software installation**.

One installation of StoqBook serves **one business**. That business is the sole owner and operator of the system. StoqBook is not a SaaS platform — it is sold directly to a company and deployed for that company alone.

The business can operate one store or many stores. They can have one warehouse or many. They can manage as few or as many employees as they need. All of this is supported without architectural changes.

StoqBook acts as the central operating system for the business by bringing together inventory, sales, purchasing, customers, suppliers, employees, reporting, licensing, and administration into one configurable platform.

The platform is built around the philosophy that business logic should be configurable instead of hardcoded, allowing it to support businesses of different sizes without requiring changes to the application architecture.

---

# Vision

To build the most flexible retail management platform where every business can configure the software according to its own workflow instead of changing its workflow to match the software.

---

# Mission

Provide retailers with a modern platform that is:

* Simple for single-store businesses
* Powerful for multi-store businesses
* Flexible for enterprise organizations
* Highly configurable
* Secure
* Extensible
* Future-proof

---

# Delivery Model

StoqBook is sold as a **per-company installation**.

* You (the developer/vendor) sell StoqBook to a company.
* That company installs StoqBook once.
* The installation serves that single company.
* The company manages their own stores, warehouses, and users.
* The company optionally decides whether to use subscription-based plans to gate features.

There is no concept of multiple independent businesses sharing one installation. Each installation belongs to one business.

---

# Product Philosophy

StoqBook follows several core engineering principles.

## Everything is Configurable

Business rules should exist as data whenever possible.

The following should never require source code modifications:

* Modules
* Features
* Menus
* Permissions
* Roles
* Plans
* License Types
* Dashboard Widgets
* Reports
* Notifications
* Store Settings
* Taxes
* Receipt Templates

---

## Single-Business, Multi-Store

The platform is designed to serve one business that can own and operate any number of stores.

Every store (branch) shares the same business data layer. No store can access another store's private data unless explicitly configured. The business owner controls all stores centrally.

---

## Modular Design

Every business capability exists as an independent module.

Examples include:

* Products
* Inventory
* Sales
* Purchases
* POS
* Customers
* Suppliers
* Employees
* Reports

Modules can be enabled or disabled based on the business's license configuration.

---

## Dynamic Authorization

The authorization system is completely data-driven.

Access to any screen or operation depends on:

1. Business status (active, suspended, etc.)
2. License status
3. Plan entitlements
4. Feature availability
5. Module availability
6. User permissions

No feature access is hardcoded.

---

## Enterprise Ready

The platform is designed to support:

* Single Store Businesses
* Multi-Store Businesses
* Multi-Warehouse Organizations
* Franchise Networks
* Enterprise Retail Chains

without architectural changes.

---

# Target Audience

StoqBook is designed primarily for retailers.

Supported business types include:

* Grocery Stores
* Supermarkets
* Electronics Stores
* Clothing Stores
* Shoe Stores
* Cosmetic Stores
* Mobile Shops
* Furniture Stores
* Hardware Stores
* Stationery Stores
* Toy Stores
* Pet Stores
* Gift Shops
* Department Stores
* Sports Stores
* Book Stores

The architecture also allows expansion into additional industries in future releases.

---

# Product Goals

The primary objectives of StoqBook are:

* Simplify inventory management
* Reduce stock loss
* Improve purchasing decisions
* Improve sales tracking
* Centralize business information
* Enable multiple stores
* Support enterprise deployments
* Provide real-time reporting
* Support configurable workflows
* Minimize operational complexity

---

# Platform Architecture Overview

StoqBook consists of two major layers.

```text
Admin Layer (Business Owner)
│
├── Business Profile Management
├── Store (Branch) Management
├── License & Plan Management
├── Module Configuration
├── User & Role Management
├── System Settings
└── Audit & Reports

↓

Business Operations Layer

├── Business Profile
├── Stores (Branches)
├── Warehouses
├── Products
├── Inventory
├── Purchases
├── Sales
├── POS
├── Customers
├── Suppliers
├── Employees
├── Reports
└── Settings
```

---

# User Hierarchy

```text
Business Installation

├── Owner (full access, implicit all permissions)

├── Manager

├── Inventory Manager

├── Accountant

├── Cashier

└── Custom Roles
```

---

# Core Concepts

Understanding these concepts is essential.

## Business

The single company that owns and operates this StoqBook installation.

Example:

* ABC Supermarket (one company, one installation)

---

## Store (Branch)

A physical retail outlet belonging to the business.

A business can have one store or many stores.

Examples:

* Main Branch — Downtown
* Mall Outlet
* Airport Branch
* Warehouse Store

---

## Warehouse

A storage location used by one or more stores.

---

## Module

A major business capability.

Examples:

* Inventory
* Sales
* Purchases
* Customers

---

## Feature

A specific capability within a module.

Example:

Inventory Module

* Stock Adjustment
* Stock Transfer
* Physical Count
* Import Inventory

---

## Permission

A single action that can be performed.

Examples:

* products.view
* products.create
* inventory.adjust
* sales.refund

---

## Role

A collection of permissions assigned to users.

Examples:

* Owner
* Manager
* Cashier

---

## License

Defines what the business is entitled to use.

A license determines:

* Plan
* Billing Mode
* Enabled Features
* Limits
* Validity

The business owner decides which plan to use. A perpetual/lifetime license is the most common for a per-installation sale.

---

## Billing Mode

Controls how the license was acquired.

Supported modes:

* Lifetime (perpetual — most common for per-installation sales)
* Subscription (recurring — for AMC or maintenance contracts)
* Manual (managed by the vendor directly)
* Internal (for development/testing)
* Trial (evaluation period)

---

# Platform Principles

StoqBook is designed around the following principles:

* Configuration over customization
* Data-driven architecture
* Single-business ownership
* Dynamic RBAC
* Modular design
* Immutable audit trails
* Enterprise readiness
* Extensibility
* Maintainability

---

# High-Level Request Lifecycle

Every request follows the same validation pipeline.

```text
User Request

↓

Authenticate User

↓

Verify Business Status

↓

Validate License

↓

Check Plan Entitlements

↓

Apply Feature Overrides

↓

Validate Module

↓

Validate Feature

↓

Check User Permission

↓

Execute Business Rules

↓

Perform Action

↓

Create Audit Log

↓

Return Response
```

---

# Documentation Structure

This documentation is organized into independent architecture documents.

```
00-introduction.md
01-platform-architecture.md
02-business-structure.md
03-license-system.md
04-rbac.md
05-module-system.md
06-database-architecture.md
07-products.md
08-inventory.md
09-purchases.md
10-sales-pos.md
11-customers.md
12-suppliers.md
13-employees.md
14-reporting.md
15-dashboard.md
16-notifications.md
17-settings.md
18-api-specification.md
19-business-rules.md
20-workflows.md
21-security.md
22-roadmap.md
```

---

# Scope

Version 1 of StoqBook focuses on delivering a complete retail management platform for a single business, with configurable licensing, modular business functionality, dynamic authorization, and multi-store scalability.

Future versions will expand into additional business domains while preserving the same architectural principles established in this documentation.



---

Nextjs/ts latest, Tailwind v4+ latest, shadcn latest, postgres docker config.
color theme to use:
#4B352A
#CA7842
#B2CD9C
#F0F2BD
or,
rgb(75, 53, 42)
rgb(202, 120, 66)
rgb(178, 205, 156)
rgb(240, 242, 189)

Note: no gradient, should look professional, ui consistent, dry, centralized styles and color.
rounded-xs and rounded-full nothing else.

## Terminology Reference

| Old SaaS Term | New Single-Business Term |
|---|---|
| Tenant | Business |
| Tenant ID | Business ID |
| Multi-Tenant | Single-Business |
| Platform Admin / Dev Admin | Business Owner / Admin |
| Branch | Store |
| Platform Console | Business Admin Panel |
| Tenant Creation | Business Setup (first-run wizard) |
| Tenant Status | Business Status |
| Tenant Isolation | Not applicable (one business per install) |
| Register a Tenant | Install / Setup |