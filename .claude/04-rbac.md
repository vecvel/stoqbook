# 04-rbac.md

# Dynamic Role-Based Access Control (RBAC)

Version: **1.0.0**

---

# Overview

The Role-Based Access Control (RBAC) system is responsible for determining **who can access what** within StoqBook.

The RBAC engine is completely **dynamic**, meaning:

* Roles are configurable.
* Permissions are configurable.
* Modules are configurable.
* Features are configurable.
* Navigation is generated dynamically.
* APIs are protected dynamically.
* Buttons and actions are permission-aware.

Nothing in the authorization system should be hardcoded.

---

# Design Goals

The RBAC system must provide:

* Unlimited Roles
* Unlimited Permissions
* Unlimited Modules
* Unlimited Features
* Permission-based Navigation
* Permission-based APIs
* Permission-based Buttons
* Permission-based Reports
* Store-level Access Scoping
* Dynamic Configuration

---

# RBAC Hierarchy

```text
Business

↓

Users

↓

Roles

↓

Permissions

↓

Features

↓

Modules

↓

Business Actions
```

---

# Authorization Pipeline

Every protected request passes through the RBAC engine.

```text
Authenticated

↓

Business Active?

↓

License Active?

↓

Module Enabled?

↓

Feature Enabled?

↓

Permission Exists?

↓

Permission Assigned?

↓

Business Validation?

↓

Allow
```

---

# RBAC Components

The RBAC engine consists of:

* Modules
* Features
* Permissions
* Roles
* Users
* Policies
* Authorization Engine

---

# Module

A Module is the highest functional unit.

Examples

```text
Dashboard

Products

Inventory

Purchases

Sales

POS

Customers

Suppliers

Employees

Reports

Expenses

Settings
```

A module can contain many features.

---

# Feature

A Feature represents a business capability.

Example

Inventory

```text
Stock Adjustment

Stock Transfer

Physical Count

Inventory Audit

Stock Reservation

Import Inventory

Export Inventory
```

Products

```text
Create Product

Edit Product

Delete Product

Import Products

Barcode Printing

QR Code Printing
```

A feature belongs to exactly one module.

---

# Permission

A Permission represents one action.

Naming Convention

```text
module.action
```

Examples

```text
products.view

products.create

products.update

products.delete

inventory.view

inventory.adjust

inventory.transfer

sales.create

sales.refund

reports.export

employees.invite
```

Permissions never contain business logic.

---

# Role

A Role is a collection of permissions.

Examples

```text
Owner

Manager

Cashier

Accountant

Inventory Manager

Warehouse Manager
```

A role can contain unlimited permissions.

---

# User

Users never receive permissions directly.

Instead

```text
User

↓

Role

↓

Permissions
```

This keeps permission management simple.

---

# Multiple Roles

A user may have multiple roles.

Example

John

* Cashier
* Inventory Manager

Final permissions are the union of all assigned roles.

---

# Permission Resolution

When multiple roles exist

```text
Role A

+

Role B

+

Role C

↓

Merged Permissions

↓

Authorization
```

Duplicate permissions are ignored.

---

# Default Roles

Every business installation starts with

```text
Owner

Manager

Cashier

Inventory Manager

Accountant
```

These roles are editable.

---

# Custom Roles

The business can create unlimited custom roles.

Examples

```text
Regional Manager

Warehouse Supervisor

Purchase Officer

Quality Inspector

Store Supervisor
```

No code changes required.

---

# Permission Categories

Example

Products

```text
View

Create

Update

Delete

Import

Export

Archive

Restore
```

Inventory

```text
View

Adjust

Transfer

Reserve

Audit

Import

Export
```

Sales

```text
View

Create

Refund

Void

Discount

Print

Cancel
```

Reports

```text
View

Export

Schedule
```

---

# Permission Groups

Permissions are grouped for easier management.

Example

Products

☐ View

☐ Create

☐ Update

☐ Delete

☐ Import

☐ Export

---

# Dynamic Navigation

Sidebar generation depends on

```text
License

↓

Module Enabled

↓

Feature Enabled

↓

Permission Exists

↓

Permission Assigned

↓

Display Menu
```

If any step fails

Menu is hidden.

---

# Dynamic Buttons

Buttons are permission-aware.

Examples

Product Page

```text
Create Button

↓

products.create
```

Delete Button

```text
products.delete
```

Export Button

```text
products.export
```

Unauthorized users never see the button.

---

# Dynamic Pages

Entire pages require permissions.

Example

Inventory Audit

Requires

```text
inventory.audit
```

Without permission

Access denied.

---

# API Authorization

Every API endpoint declares required permission.

Example

```text
POST /products

↓

products.create
```

Example

```text
DELETE /products/{id}

↓

products.delete
```

---

# Report Authorization

Reports are also permission-based.

Examples

```text
reports.sales

reports.inventory

reports.profit

reports.expense

reports.export
```

---

# Widget Authorization

Dashboard widgets require permissions.

Example

Revenue Widget

Requires

```text
dashboard.revenue
```

Profit Widget

Requires

```text
dashboard.profit
```

---

# Permission Matrix

Example

| Role              | Products | Inventory | Sales   | Reports   |
| ----------------- | -------- | --------- | ------- | --------- |
| Owner             | Full     | Full      | Full    | Full      |
| Manager           | Full     | Full      | Limited | View      |
| Cashier           | View     | None      | Create  | None      |
| Inventory Manager | View     | Full      | None    | Inventory |
| Accountant        | View     | View      | View    | Finance   |

---

# Permission Caching

Permissions should be cached after login.

Loaded once.

Rebuilt when

* Role changes
* Permission changes
* User changes role

---

# Authorization Response

Successful

```text
Authorized
```

Failure

```text
403 Forbidden
```

Never expose internal permission names.

---

# Role Lifecycle

```text
Create

↓

Assign Permissions

↓

Assign Users

↓

Update

↓

Archive

↓

Delete
```

Deletion is blocked while users are assigned.

---

# Permission Lifecycle

```text
Create

↓

Assign Feature

↓

Assign Module

↓

Available
```

Permissions should never be deleted once used.

Prefer archive instead.

---

# Module Lifecycle

```text
Create

↓

Register Features

↓

Register Permissions

↓

Enable

↓

Assign to Plans
```

---

# Feature Lifecycle

```text
Create

↓

Assign Module

↓

Register Permissions

↓

Enable

↓

Ready
```

---

# Business Owner Restrictions

The business Owner role has implicit access to all permissions.

Owner permissions include admin-level actions that other roles cannot access.

Examples

Admin

```text
business.settings

store.create

store.suspend

license.manage

roles.manage
```

Tenant permissions

```text
products.create

sales.create

inventory.adjust
```

Never mix both systems.

---

# Audit Logging

Every authorization change is logged.

Examples

* Role Created
* Role Updated
* Permission Added
* Permission Removed
* User Assigned
* User Removed

Audit logs are immutable.

---

# Future Support

RBAC supports future additions like

* Attribute-Based Access Control (ABAC)
* Time-based permissions
* Branch-level permissions
* Warehouse-level permissions
* Approval-based permissions
* Temporary permissions
* Delegated administration

without redesigning the core system.

---

# Best Practices

* Never hardcode permissions.
* Never hardcode roles.
* Never hardcode navigation.
* Never bypass authorization checks.
* Always authorize on the server.
* Hide unauthorized UI elements.
* Log all authorization changes.
* Keep platform RBAC separate from tenant RBAC.

---

# Next Document

**05-module-system.md**

The next document defines the dynamic module architecture, module registration, feature registration, navigation generation, module dependencies, lifecycle, and plugin-ready expansion model that allows StoqBook to grow without modifying existing modules.
