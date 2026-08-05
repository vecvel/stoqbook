# 01-platform-architecture.md

# Platform Architecture

Version: **1.0.0**

---

# Overview

StoqBook is designed as a **single-business, multi-store retail platform**.

One StoqBook installation serves exactly one business. That business is the owner of the system. The "platform" layer in StoqBook is the **business admin panel** — the area where the business owner manages their stores, licenses, modules, users, and system configuration.

The architecture is built around complete separation of concerns.

```text
                    StoqBook Installation
                           │
          ┌────────────────┴────────────────┐
          │                                 │
  Admin Services                    Business Services
          │                                 │
  Business Profile               Business Profile
  Store Management               Products
  License Management             Inventory
  Module Configuration           Purchases
  User Management                Sales
  System Settings                Customers
  Audit                          Suppliers
                                 Employees
                                 Reports
```

---

# Design Goals

The architecture is designed to satisfy the following goals.

* One business per installation
* Multiple stores (branches) per business
* Configurable features per business
* Dynamic permissions
* Configurable licensing (for the business owner to manage their plan)
* Modular business capabilities
* Enterprise scalability
* Future extensibility

---

# Architecture Layers

The platform consists of six logical layers.

```text
Presentation Layer

↓

Application Layer

↓

Business Layer

↓

Authorization Layer

↓

Admin Layer

↓

Data Layer
```

Each layer has a single responsibility.

---

# Presentation Layer

Responsible for user interaction.

Responsibilities

* Authentication
* Dashboards
* Forms
* Tables
* Reports
* POS
* Settings
* Navigation
* Notifications

The presentation layer never contains business rules.

---

# Application Layer

Coordinates user requests.

Responsibilities

* Receive requests
* Validate inputs
* Execute workflows
* Call business services
* Return responses

No direct database logic.

---

# Business Layer

Contains business rules.

Examples

Inventory

* Stock adjustment

Sales

* Invoice creation

Purchases

* Goods receiving

Reports

* Profit calculation

Every module owns its own business rules.

---

# Authorization Layer

Responsible for validating access.

Checks include

* User authentication
* Business status
* License status
* Plan entitlements
* Feature overrides
* Module availability
* Permission validation

Every request passes through this layer.

---

# Admin Layer

Contains business-owner administration functionality.

Includes

* Business profile management
* Store (branch) management
* License management
* Module & feature configuration
* System settings
* Audit logs
* Announcements

This is where the business owner manages the entire installation.

---

# Data Layer

Stores business data.

Contains

* Business Profile (one per installation)
* Stores (Branches)
* Warehouses
* Products
* Inventory
* Customers
* Purchases
* Sales
* Reports
* Settings

---

# Business Structure

```text
Business (one per installation)

├── Store A (e.g. Main Branch)
│     ├── Warehouses
│     ├── Users
│     └── Inventory

├── Store B (e.g. Mall Outlet)
│     ├── Warehouses
│     ├── Users
│     └── Inventory

└── Store C (e.g. Airport Branch)
      ├── Warehouses
      ├── Users
      └── Inventory
```

All stores are owned by the same business. Data does not cross store boundaries unless the business explicitly shares it (e.g. shared product catalog).

---

# Business Architecture

The business owns:

```text
Business Profile

Stores (Branches)

Warehouses

Users

Roles

Products

Inventory

Customers

Suppliers

Purchases

Sales

Expenses

Reports

Settings

License
```

---

# Admin Components

## Identity Service

Responsible for

* Login
* Logout
* Password Reset
* Sessions
* Authentication
* MFA (future)

---

## Store Service

Responsible for

* Store (branch) creation
* Store activation
* Store suspension
* Store configuration
* Warehouse assignment

---

## License Service

Responsible for

* Plans
* License validation
* Billing modes
* Expiration
* Trial
* Lifetime

The business owner can manage their own license through the admin panel.

---

## Module Service

Responsible for

* Register modules
* Enable modules
* Disable modules
* Version modules

---

## Feature Service

Responsible for

* Register features
* Enable features
* Disable features
* Feature metadata

---

## Permission Service

Responsible for

* Permission definitions
* Permission validation
* Permission inheritance

---

## Navigation Service

Generates

* Sidebar
* Menus
* Navigation tree

based on

* License
* Modules
* Permissions

---

## Dashboard Service

Builds dashboards dynamically.

Widgets depend on

* User role
* License
* Enabled modules

---

## Notification Service

Responsible for

* In-app notifications
* Email
* SMS
* Push notifications

---

## Audit Service

Stores

* User activities
* Admin events
* Business events

Audit logs are immutable.

---

# Platform Request Flow

Every request follows the same pipeline.

```text
Client Request

↓

Authenticate

↓

Load Business Context

↓

Business Active?

↓

License Active?

↓

Plan Validation

↓

Feature Override

↓

Module Enabled?

↓

Permission Check

↓

Business Validation

↓

Execute

↓

Audit

↓

Response
```

---

# First-Run Setup

When StoqBook is installed for the first time, the setup wizard runs.

```text
First Boot

↓

Setup Wizard

↓

Create Business Profile

↓

Create Owner Account

↓

Create Default Store

↓

Assign Default License (Lifetime / Trial)

↓

Enable Default Modules

↓

Create Default Roles

↓

Create Default Settings

↓

Ready
```

After setup, the business owner can create additional stores, users, and configure the system.

---

# User Login Flow

```text
Open Login

↓

Authenticate

↓

Load Business Context

↓

Verify Business Status

↓

Load License

↓

Load Modules

↓

Load Features

↓

Load Permissions

↓

Generate Sidebar

↓

Generate Dashboard

↓

Home
```

---

# Authorization Pipeline

Every protected request

```text
Authenticated

↓

Business Valid

↓

License Valid

↓

Feature Available

↓

Module Enabled

↓

Permission Granted

↓

Business Rule

↓

Allow
```

---

# Dynamic Navigation

Navigation is never hardcoded.

Generated using

```text
License

+

Modules

+

Features

+

Permissions

↓

Navigation Tree
```

Every user sees a different sidebar based on their role and the business's license.

---

# Dynamic Dashboard

Dashboard widgets are generated from configuration.

Examples

* Today's Sales
* Revenue
* Profit
* Top Products
* Low Stock
* Pending Purchases
* Recent Sales

Unavailable widgets are hidden automatically.

---

# Business Events

Every major action generates an event.

Examples

```text
StoreCreated

StoreActivated

StoreSuspended

LicenseAssigned

ProductCreated

StockAdjusted

SaleCompleted

PurchaseReceived

EmployeeCreated

PermissionUpdated
```

These events power the audit log and can later power automation and integrations.

---

# Platform Configuration

Global configuration includes

* Currency defaults
* Timezone defaults
* Tax defaults
* Notification providers
* Branding
* Security policies
* Feature flags

---

# Failure Strategy

Platform failures are categorized.

Authentication Failure

↓

Authorization Failure

↓

Validation Failure

↓

Business Rule Failure

↓

System Failure

↓

Unexpected Failure

Each category returns a standardized error response.

---

# Scalability

The architecture is designed to scale independently.

Possible future expansion

* Multiple application servers
* Distributed workers
* Dedicated reporting services
* Dedicated notification services
* Search service
* Analytics service
* AI recommendation service

The platform architecture remains unchanged.

---

# Extensibility

New modules can be added without changing existing modules.

Example

```text
Existing

Products

Inventory

Sales

↓

Add

Accounting

↓

No existing module changes
```

Every new module simply registers

* Module
* Features
* Permissions
* Navigation
* Dashboard widgets

The platform automatically integrates it.

---

# Platform Principles

* Single-business per installation
* Configuration over hardcoding
* Service-oriented architecture
* Dynamic authorization
* Dynamic navigation
* Event-driven foundation
* Modular business capabilities
* Future-proof expansion
* Zero coupling between business modules

---

# Next Document

The next document (**02-business-structure.md**) defines the business structure, store management, warehouse organization, store lifecycle, and data ownership within a single-business installation.
