# 19-business-rules.md

# Platform Business Rules

Version: **1.0.0**

---

# Overview

The Business Rules module defines the core operational rules of StoqBook.

These rules are enforced across every module to ensure data consistency, tenant isolation, security, predictable workflows, and reliable business operations.

Business Rules are **not UI rules** and **not database constraints**. They define how the platform behaves regardless of the client application.

---

# Objectives

The Business Rules module defines

* Platform Rules
* Tenant Rules
* Subscription Rules
* Module Rules
* Inventory Rules
* Sales Rules
* Purchase Rules
* Customer Rules
* Financial Rules
* Security Rules
* Approval Rules
* Audit Rules

---

# Business Rule Hierarchy

```text id="u8k2rx"
Platform Rules

↓

Subscription Rules

↓

Tenant Rules

↓

Module Rules

↓

Workflow Rules

↓

User Permissions
```

Higher-level rules always take precedence.

---

# Tenant Isolation Rules

Every business operates independently.

Rules

* Every record belongs to one tenant.
* Users cannot access another tenant's data.
* Reports never mix tenant data.
* APIs always require tenant context.
* Audit logs remain tenant-specific.
* Notifications are tenant scoped.

Cross-tenant access is only available to Platform Super Admins.

---

# Subscription Rules

Subscription controls feature availability.

Rules

* Features unavailable in the current plan are inaccessible.
* Disabled modules are hidden automatically.
* API access depends on subscription.
* Storage limits depend on subscription.
* Employee limits depend on subscription.
* Branch limits depend on subscription.
* Warehouse limits depend on subscription.

Enterprise tenants may receive custom plans with unlimited or negotiated limits.

---

# Enterprise License Rules

Some organizations may purchase a lifetime or enterprise license.

Rules

* Monthly billing can be disabled.
* Subscription expiry is optional.
* Features are manually assigned.
* Platform updates remain available.
* Enterprise licenses may be permanent or contract-based.
* Billing module can be disabled completely.

This allows StoqBook to support large companies that purchase the platform outright.

---

# Module Rules

Every module may be

```text id="kv3mh5"
Enabled

Disabled

Hidden

Read Only
```

Disabled modules

* disappear from navigation
* disable APIs
* disable reports
* disable dashboard widgets
* disable permissions automatically

---

# RBAC Rules

Authorization always follows RBAC.

Rules

* Users inherit permissions from roles.
* Multiple roles are supported.
* Explicit deny overrides allow (if configured).
* Permissions are evaluated before business logic.
* Hidden modules cannot grant permissions.
* Super Admin bypasses tenant permissions.
* Dev Admin bypasses all permissions.

---

# Branch Rules

Rules

* Every transaction belongs to one branch.
* Branch-restricted users only access assigned branches.
* Reports respect branch permissions.
* Transfers require source and destination branches.

---

# Warehouse Rules

Rules

* Inventory belongs to warehouses.
* Warehouse transfers require approval (optional).
* Warehouse permissions are enforced separately.
* Stock calculations are warehouse-aware.

---

# Product Rules

Rules

* SKU must be unique within a tenant.
* Barcode uniqueness is configurable.
* Deleted products cannot appear in new sales.
* Archived products remain in historical records.
* Product prices cannot be negative.
* Product stock cannot become invalid.

---

# Inventory Rules

Rules

* Every stock movement is recorded.
* Inventory cannot silently change.
* Manual adjustment requires permission.
* Stock history is immutable.
* Transfers create two stock movements.
* Returns automatically adjust inventory.
* Inventory valuation updates automatically.

---

# Negative Stock Rules

Tenant setting

```text id="mg9d2a"
Allow

Disallow
```

If disabled

Sales cannot exceed available stock.

---

# Sales Rules

Rules

* Sales require at least one item.
* Completed sales cannot be edited.
* Cancelled invoices remain in history.
* Refunds create reverse transactions.
* Discounts require permissions if above configured limits.
* Payment status updates automatically.

---

# Purchase Rules

Rules

* Purchase Orders require suppliers.
* Goods Receipt updates inventory.
* Purchase cancellation reverses inventory if allowed.
* Supplier balances update automatically.
* Completed purchases cannot be modified.

---

# Customer Rules

Rules

* Customer deletion is prohibited when transactions exist.
* Loyalty points reverse on refunds.
* Credit sales respect credit limits.
* Blocked customers cannot purchase on credit.
* Walk-in customers require minimal information.

---

# Supplier Rules

Rules

* Suppliers cannot be deleted when purchases exist.
* Outstanding balances update automatically.
* Blocked suppliers cannot receive purchase orders.
* Supplier history is immutable.

---

# Employee Rules

Rules

* Every employee belongs to one tenant.
* Suspended employees cannot log in.
* Archived employees remain in reports.
* Attendance cannot be edited after payroll lock (future).

---

# Financial Rules

Rules

* Revenue is calculated from completed sales.
* Refunds reduce revenue.
* Expenses reduce profit.
* Taxes follow configured tax rules.
* Currency precision follows tenant configuration.

---

# Invoice Number Rules

Rules

* Numbers must be unique.
* Deleted invoices never reuse numbers.
* Numbering follows configured prefixes.
* Sequence resets only according to configuration.

---

# Approval Rules

Approval workflows are configurable.

Examples

Purchase Approval

```text id="s7e3mb"
Below ₹50,000

↓

Auto Approve
```

```text id="b0c8hn"
Above ₹50,000

↓

Manager Approval
```

Examples

Discount Approval

Large discounts require manager approval.

Inventory Adjustment

Large quantity adjustments require approval.

---

# Import Rules

Rules

* Validation occurs before import.
* Duplicate detection is configurable.
* Partial imports are supported.
* Failed records produce detailed reports.

---

# Export Rules

Rules

* Export respects permissions.
* Hidden fields remain hidden.
* Sensitive information requires additional permissions.
* Large exports execute in background jobs.

---

# Notification Rules

Rules

* Notifications are event-driven.
* Notification preferences are respected.
* Critical alerts may bypass quiet hours.
* Broadcasts require explicit permissions.

---

# Report Rules

Rules

* Reports never modify data.
* Reports respect tenant isolation.
* Reports respect branch permissions.
* Reports respect module availability.
* Scheduled reports run with owner permissions.

---

# Dashboard Rules

Rules

* Dashboard widgets are permission-based.
* Hidden modules hide widgets.
* Layout is user-specific.
* Financial widgets require financial permissions.

---

# Audit Rules

Every important action must be logged.

Examples

* Login
* Product Created
* Sale Completed
* Permission Changed
* Settings Updated
* Subscription Changed

Audit records

* Cannot be modified
* Cannot be deleted
* Are time-stamped
* Record acting user

---

# Soft Delete Rules

Supported entities use soft deletion.

Rules

* Historical records remain available.
* Deleted records are hidden by default.
* Restore is permission-controlled.
* Permanent deletion is restricted.

---

# Security Rules

Rules

* HTTPS required.
* Authentication required.
* Sessions expire automatically.
* Password policy enforced.
* API rate limiting enforced.
* Sensitive data encrypted.
* File uploads validated.

---

# Data Integrity Rules

Rules

* Foreign references must remain valid.
* Transactions are atomic.
* Partial writes are rolled back.
* Duplicate requests are prevented using idempotency where applicable.

---

# Performance Rules

Rules

* Large reports use background processing.
* Imports use queues.
* Exports use queues.
* Notifications use queues.
* Expensive calculations are cached where appropriate.

---

# Configuration Rules

Rules

* Platform settings override tenant defaults where applicable.
* Tenant settings override module defaults.
* User preferences override display-only settings.
* Invalid configurations are rejected.

---

# Feature Flag Rules

Rules

* Disabled features are inaccessible.
* APIs for disabled features are unavailable.
* Navigation updates automatically.
* Permissions for disabled modules are ignored.

---

# Disaster Recovery Rules

Rules

* Backups must be restorable.
* Audit logs survive restores where possible.
* Failed jobs are retryable.
* Critical failures generate alerts.

---

# Cross-Module Rules

```text id="p9v4dt"
Sales

↓

Inventory Updates

↓

Customer History

↓

Reports Updated

↓

Dashboard Updated

↓

Notifications Sent

↓

Audit Logged
```

Every business action propagates consistently across related modules.

---

# Rule Evaluation Order

```text id="z6m1ke"
Authentication

↓

Tenant Validation

↓

Subscription Validation

↓

RBAC Permission Check

↓

Business Rule Validation

↓

Workflow Validation

↓

Database Transaction

↓

Audit

↓

Notifications

↓

Response
```

---

# Business Rules Audit

Every rule violation may be logged.

Examples

* Unauthorized Access
* Invalid Discount
* Stock Shortage
* Subscription Limit Exceeded
* Approval Rejected
* Validation Failure

---

# Business Rules Permissions

```text id="h4r9np"
rules.view

rules.manage

approvals.manage

subscriptions.override

security.override
```

Only Platform Administrators and Dev Administrators should modify platform-wide rules.

---

# Future Enhancements

* AI Rule Engine
* Visual Workflow Builder
* No-Code Business Rules
* Conditional Rule Builder
* Rule Versioning
* Rule Simulation
* Automated Compliance Checks
* Business Policy Templates
* Regional Compliance Packs
* AI Rule Optimization

---

# Module Relationships

```text id="k8f2yw"
Business Rules
│
├── Authentication
├── RBAC
├── Subscription
├── Products
├── Inventory
├── Sales
├── Purchases
├── Customers
├── Suppliers
├── Employees
├── Reports
├── Notifications
├── Settings
└── Audit
```

The Business Rules module is the governance layer of StoqBook. It ensures every operation across the platform follows consistent, secure, auditable, and configurable business policies while supporting multi-tenant deployments, enterprise licensing, and future extensibility.

---

# Next Document

**20-workflows.md**

The next document defines the complete workflow engine, including configurable approval flows, event automation, state transitions, conditional branching, task assignments, and workflow execution across all StoqBook modules.
