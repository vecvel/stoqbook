# 05-module-system.md

# Dynamic Module System Architecture

Version: **1.0.0**

---

# Overview

The Module System is the backbone of StoqBook.

Every business capability inside StoqBook is implemented as an independent module.

A module encapsulates:

* Business Logic
* Features
* Permissions
* Navigation
* Dashboard Widgets
* Reports
* Settings
* Events
* APIs

The platform should be able to add or remove modules without affecting existing ones.

---

# Objectives

The module architecture must provide:

* Loose coupling
* Independent development
* Dynamic registration
* Dynamic navigation
* Dynamic permissions
* Dynamic licensing
* Dynamic feature management
* Versioning
* Future plugin support

---

# What is a Module?

A module represents one business domain.

Examples

```text
Products

Inventory

Purchases

Sales

POS

Customers

Suppliers

Employees

Expenses

Reports

Settings
```

Each module owns everything related to its domain.

---

# Module Architecture

```text
Module

├── Information
├── Features
├── Permissions
├── Navigation
├── Dashboard Widgets
├── APIs
├── Events
├── Reports
├── Settings
└── Business Rules
```

---

# Module Registry

All modules must be registered.

Example

```text
Products

↓

Registered

↓

Available

↓

Can be Licensed

↓

Can be Enabled
```

The platform only recognizes registered modules.

---

# Module Metadata

Each module stores metadata.

Example

```text
Module Name

Slug

Display Name

Description

Version

Category

Status

Icon

Sort Order

Dependencies

Visibility
```

---

# Module Categories

Modules can be grouped.

Examples

Core

* Dashboard
* Settings

Retail

* Products
* Inventory
* Sales
* POS

CRM

* Customers
* Suppliers

HR

* Employees

Finance

* Expenses

Analytics

* Reports

Future

* Accounting
* CRM
* Ecommerce

---

# Core Modules

Core modules are always available.

Examples

```text
Authentication

Dashboard

Settings

Profile

Notifications
```

These cannot be disabled.

---

# Optional Modules

Modules enabled through licensing.

Examples

```text
POS

Loyalty

Barcode

Gift Cards

Warehouses

Branches

API

Advanced Reports
```

---

# Module Lifecycle

```text
Designed

↓

Developed

↓

Registered

↓

Enabled

↓

Licensed

↓

Operational

↓

Archived
```

---

# Module Registration

When a new module is added

The platform registers

```text
Module

↓

Features

↓

Permissions

↓

Navigation

↓

Dashboard Widgets

↓

Reports

↓

Events
```

No manual coding elsewhere.

---

# Module Dependencies

Some modules depend on others.

Example

```text
Inventory

↓

Requires

Products
```

Example

```text
POS

↓

Requires

Products

Inventory

Sales
```

Dependencies are validated automatically.

---

# Dependency Rules

Example

```text
Disable Products

↓

Inventory Disabled

↓

POS Disabled
```

Dependent modules cannot function without required modules.

---

# Module States

Every module has one state.

```text
Registered

Enabled

Disabled

Archived
```

---

# Enabled Module

Available to tenants.

---

# Disabled Module

Hidden.

Cannot execute.

---

# Archived Module

No longer maintained.

Existing data preserved.

---

# Module Visibility

Visibility determines who can see a module.

Possible values

```text
Platform

Tenant

Both
```

Example

Plans module

Visible only to Platform.

Inventory

Visible to Tenant.

---

# Module Configuration

Each module owns its own settings.

Example

Inventory

```text
Negative Stock

Auto Adjustment

Reservation Enabled

FIFO/LIFO

Reorder Level
```

Sales

```text
Discount Limit

Invoice Prefix

Receipt Format
```

Settings never belong to other modules.

---

# Feature Registration

Each module registers its features.

Inventory

```text
Stock Adjustment

Stock Transfer

Stock Audit

Reservation

Import

Export
```

Products

```text
Categories

Brands

Variants

Barcode

QR

Images
```

---

# Permission Registration

Every feature registers permissions.

Inventory

```text
inventory.view

inventory.adjust

inventory.transfer

inventory.audit
```

Sales

```text
sales.view

sales.create

sales.refund
```

Permissions are automatically available to RBAC.

---

# Navigation Registration

Each module provides its own navigation.

Example

Inventory

```text
Inventory

├── Dashboard

├── Current Stock

├── Stock Adjustment

├── Stock Transfer

├── Audit
```

Navigation appears only when authorized.

---

# Dashboard Registration

Modules register widgets.

Inventory

```text
Inventory Value

Low Stock

Out of Stock

Stock Movement
```

Sales

```text
Today's Sales

Monthly Revenue

Profit

Best Sellers
```

Widgets become available automatically.

---

# Report Registration

Each module provides reports.

Inventory

```text
Stock Summary

Movement History

Adjustment Report

Audit Report
```

Sales

```text
Sales Summary

Revenue Report

Refund Report
```

---

# Event Registration

Modules publish business events.

Inventory

```text
StockAdjusted

StockTransferred

StockReserved
```

Sales

```text
SaleCreated

InvoicePaid

SaleRefunded
```

Other modules may subscribe to these events.

---

# Module Communication

Modules never call each other directly.

Instead

```text
Inventory

↓

Event

↓

Notification

↓

Audit

↓

Reports
```

Loose coupling improves maintainability.

---

# Dynamic Sidebar

Sidebar generation

```text
Registered Module

↓

Licensed

↓

Enabled

↓

Permission Granted

↓

Display
```

---

# Dynamic Search

Modules contribute searchable resources.

Products

* SKU
* Product Name

Customers

* Name
* Phone

Suppliers

* Company

Sales

* Invoice Number

The global search engine aggregates these automatically.

---

# Dynamic Settings

Every module exposes its own settings.

The Settings page builds itself dynamically.

Example

```text
Settings

├── General

├── Inventory

├── Sales

├── POS

├── Reports

├── Notifications
```

---

# Dynamic Routes

Every module registers routes.

Routes become active only when

* Module Enabled
* License Active
* User Authorized

---

# Dynamic APIs

Modules expose APIs.

Examples

Products API

Inventory API

Sales API

Customers API

Permissions remain module-specific.

---

# Module Versioning

Each module maintains

```text
Version

Release Date

Compatibility

Migration Status
```

Useful for upgrades.

---

# Future Plugin Architecture

The module system is designed to support plugins.

Example

```text
Accounting Plugin

↓

Register Module

↓

Register Features

↓

Register Permissions

↓

Ready
```

No platform modifications required.

---

# Future Marketplace

Future versions may allow installation of modules.

Example

```text
Marketplace

↓

Install

↓

Register

↓

Activate

↓

License

↓

Ready
```

---

# Best Practices

* One business domain per module.
* Never duplicate functionality across modules.
* Modules communicate using events.
* Keep dependencies minimal.
* Register everything dynamically.
* Never hardcode navigation.
* Never hardcode permissions.
* Never hardcode dashboards.
* Every module owns its configuration.
* Modules must be independently testable.

---

# Module Roadmap

Current

* Products
* Inventory
* Purchases
* Sales
* POS
* Customers
* Suppliers
* Employees
* Reports
* Expenses

Future

* Accounting
* CRM
* Ecommerce
* Delivery
* Manufacturing
* HR
* Payroll
* Asset Management
* Service Management
* AI Assistant

The architecture remains unchanged regardless of the number of modules.

---

# Next Document

**06-database-architecture.md**

The next document defines the complete database architecture, naming conventions, entity relationships, tenant isolation strategy, auditing model, soft deletion strategy, indexing strategy, and the core data model that powers every module in StoqBook.
