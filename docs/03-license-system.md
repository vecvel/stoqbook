# 03-license-system.md

# License System Architecture

Version: **1.0.0**

---

# Overview

The License System determines **what the business is entitled to use**.

It is completely independent of authentication, authorization, and billing.

A license grants the business access to platform capabilities.

Billing only determines **how the license is acquired or maintained**.

This separation allows StoqBook to support:

* Perpetual (lifetime) per-installation purchases — most common
* Annual Maintenance Contract (AMC) subscriptions
* Trial periods for new installations
* Internal / development builds
* Promotional licenses

without changing the core application.

---

# How Licensing Works in a Per-Installation Model

StoqBook is sold to one business. That business receives a license.

The license is installed at setup time. The business owner can view and manage the license from the admin panel.

The business owner **does not** pay StoqBook each month — they pay the vendor (you) when they purchase the software. The vendor then issues the appropriate license.

Optionally, the business owner can choose to create plans for their own stores — for example if they operate a franchise and want to gate features per franchise location. This is an optional advanced use case.

---

# License Architecture

```text
Installation

↓

License

↓

Plan

↓

Entitlements

↓

Modules

↓

Features

↓

Limits

↓

Business
```

---

# Core Concepts

## License

A license represents the agreement between the vendor (you) and the business (customer).

The business owns exactly one active license.

A license determines:

* Plan
* Billing Mode
* Start Date
* Expiry Date
* Status
* Feature Overrides
* Resource Limits

---

## Plan

A reusable template that defines what a license includes.

Example

```text
Trial

Starter

Professional

Business

Enterprise

Lifetime
```

A plan never belongs to the business directly — the business gets a license that references a plan.

---

## Entitlement

An entitlement represents access to something.

Examples

* POS
* Barcode Printing
* Multi Store
* API
* Loyalty
* Advanced Reports

---

## Limit

Limits define resource usage ceilings.

Examples

* Maximum Products
* Maximum Employees
* Maximum Stores
* Maximum Warehouses
* Maximum Storage
* Maximum API Calls

A null limit means unlimited.

---

# Billing Modes

Billing mode determines how the license is obtained.

```text
Lifetime

Subscription

Trial

Manual

Internal
```

---

## Lifetime

One-time purchase.

Never expires.

**This is the recommended billing mode for per-installation sales.**

The business pays once and uses the software indefinitely.

---

## Subscription

Recurring payment.

Supports:

* Monthly
* Quarterly
* Yearly

Useful for Annual Maintenance Contracts (AMC).

Automatically renewed.

---

## Trial

Temporary evaluation period.

Automatically expires.

Can later convert to Lifetime or Subscription.

---

## Manual

Managed entirely by the vendor (you).

No automatic payment processing.

Useful for:

* Special customers
* Promotions
* Partners
* Negotiations

---

## Internal

Used for development and testing.

Billing disabled.

Unlimited control.

---

# License Status

```text
Pending

Active

Expired

Suspended

Cancelled
```

---

## Pending

Created.

Not activated.

---

## Active

Fully operational.

---

## Expired

License validity ended.

Business cannot operate.

---

## Suspended

Temporarily disabled.

Reasons

* Billing issue
* Security issue
* Manual action by vendor

---

## Cancelled

License permanently terminated.

Business enters archive process.

---

# Plan Structure

Every plan contains:

General

* Name
* Description
* Display Order

Modules

* Enabled Modules

Features

* Enabled Features

Limits

* Stores
* Employees
* Products
* Warehouses
* Storage

Capabilities

* POS
* Loyalty
* API
* Barcode
* Reports

---

# Example Plans

## Trial

* 1 Store
* 3 Employees
* 100 Products
* Basic Reports
* 30-day validity

---

## Starter

* POS
* Purchases
* Inventory
* Sales
* Reports
* 5 Employees
* 1 Store

---

## Professional

* Unlimited Products
* Barcode
* Multi User
* Customers
* Suppliers
* Reports
* 3 Stores

---

## Business

* Multi Store
* Loyalty
* Advanced Reports
* Warehouses
* 10 Stores

---

## Enterprise / Lifetime

Everything enabled.

No limits by default.

Recommended for per-installation perpetual sales.

---

# Feature Entitlements

Every feature belongs to a module.

Example

Inventory

```text
Stock Adjustment

Stock Transfer

Physical Count

Inventory Audit
```

Products

```text
Variants

Barcode

QR

Bulk Import

Bulk Export
```

Plans simply enable or disable features.

---

# Module Entitlements

Modules are enabled independently.

Example

```text
Dashboard

Products

Inventory

Sales

POS

Customers

Suppliers

Employees

Reports
```

A disabled module is completely hidden from all users.

---

# License Overrides

Overrides modify what the business can do without creating a new plan.

Example

Business on Professional Plan

Overrides

```text
Unlimited Products

Unlimited Stores

Advanced Reports

API Enabled
```

Overrides always take precedence over plan defaults.

---

# Resource Limits

Examples

```text
Products

Unlimited

Employees

25

Stores

5

Warehouses

10

Storage

50 GB
```

Unlimited values are supported (null in database).

---

# License Validation

Every protected request validates the license.

```text
Load Business

↓

Load License

↓

License Active?

↓

License Expired?

↓

Plan Loaded?

↓

Feature Allowed?

↓

Limit Reached?

↓

Continue
```

---

# Upgrade Flow

```text
Trial

↓

Professional

↓

Business

↓

Enterprise / Lifetime
```

No business data changes.

Only license changes.

---

# Downgrade Flow

Before downgrade

Validate

* Product Count
* Store Count
* Employee Count
* Storage

If limits exceed target plan

Downgrade blocked until compliant.

---

# Trial Conversion

```text
Trial

↓

Purchase (one-time or AMC)

↓

Lifetime or Subscription activated
```

Business data remains unchanged.

---

# Internal Licenses

Internal licenses are used for:

* Development
* Testing
* Vendor Demo Environments

Characteristics

* No billing
* Unlimited access

---

# Perpetual License (Most Common)

The default for a per-installation sale.

The business pays the vendor once.

The vendor issues a lifetime license with the purchased plan.

No recurring billing unless the business wants AMC support.

---

# Vendor Controls

You (the vendor) can:

* Create Plans
* Clone Plans
* Archive Plans
* Assign Licenses
* Upgrade
* Downgrade
* Override Limits
* Override Features
* Change Billing Mode
* Extend Expiry
* Grant Lifetime
* Suspend
* Reactivate

These controls are accessible through the admin panel (or directly in the database during setup).

---

# Billing Separation

Billing never controls permissions directly.

Instead

```text
Billing / Payment

↓

License

↓

Plan

↓

Entitlements

↓

Permissions
```

This keeps billing completely independent from authorization.

---

# License Expiry

When expired

* Login disabled
* API disabled
* POS disabled
* Background jobs paused

Data remains intact.

The vendor reactivates the license after the business renews.

---

# Renewal

Renewal only updates

* Expiry Date
* Billing Record
* License Status

Nothing else changes.

---

# Feature Availability

A feature is available only if

```text
License Active

↓

Plan Includes Feature

↓

Override Doesn't Disable

↓

Module Enabled

↓

Permission Granted
```

---

# Principles

* The business owns one license.
* Billing mode is independent of authorization.
* Plans are reusable templates.
* Overrides are preferred over custom plans.
* Features are data-driven.
* Limits are configurable.
* Perpetual lifetime licenses are the standard for per-installation sales.
* Enterprise customers use the same architecture.

---

# Next Document

**04-rbac.md**

This document will define the complete dynamic Role-Based Access Control system, including modules, features, permissions, roles, authorization, navigation generation, permission inheritance, and UI visibility.
