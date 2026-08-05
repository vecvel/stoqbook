# 17-settings.md

# Settings Module

Version: **1.0.0**

---

# Overview

The Settings module is the central configuration hub of StoqBook.

Every configurable aspect of the platform is managed here, including company information, branches, warehouses, taxes, invoice numbering, currencies, branding, permissions, integrations, notifications, feature flags, and module settings.

The Settings module is completely dynamic.

Each module can register its own settings without modifying the core system.

---

# Objectives

The Settings module should provide

* Organization Settings
* Branch Settings
* Warehouse Settings
* User Preferences
* Module Configuration
* Invoice Numbering
* Taxes
* Branding
* Localization
* Integrations
* Notification Settings
* Security Settings
* Feature Flags
* Backup & Restore
* Subscription Configuration

---

# Settings Architecture

```text id="c4nmr2"
Settings
│
├── Organization
├── Branches
├── Warehouses
├── Modules
├── Users
├── Roles
├── Taxes
├── Numbering
├── Branding
├── Localization
├── Integrations
├── Notifications
├── Security
├── Feature Flags
├── Backups
└── Audit
```

---

# Settings Hierarchy

Configuration follows a hierarchy.

```text id="3fy9qg"
Platform

↓

Tenant

↓

Branch

↓

Warehouse

↓

User
```

Higher levels provide defaults.

Lower levels override when permitted.

---

# Configuration Scope

Each setting belongs to one scope.

```text id="4awjv7"
Platform

Tenant

Branch

Warehouse

User
```

Example

Company Logo

→ Tenant

Theme

→ User

Tax Configuration

→ Tenant

Receipt Printer

→ Branch

---

# Organization Settings

Contains

* Company Name
* Legal Name
* Logo
* Favicon
* Address
* Email
* Phone
* Website
* GST/VAT Number
* Business Registration Number

---

# Branch Settings

Each branch stores

* Branch Name
* Code
* Address
* Contact
* Receipt Prefix
* Time Zone
* Currency Override (Optional)

---

# Warehouse Settings

Configuration includes

* Warehouse Name
* Code
* Address
* Default Receiving Area
* Inventory Policy

---

# User Preferences

Every user can configure

* Theme
* Language
* Time Format
* Date Format
* Dashboard Layout
* Default Branch
* Default Warehouse
* Notification Preferences

---

# Module Settings

Each module registers its own settings.

Example

Inventory

```text id="66snpv"
Negative Stock

Reservation Enabled

Default Valuation Method

Reorder Alerts
```

Sales

```text id="ow8jrw"
Allow Discounts

Maximum Discount

Default Payment Method

Receipt Footer
```

Purchases

```text id="l4c1xq"
Approval Required

Auto Receive

Supplier Credit Days
```

No module-specific settings are hardcoded into the Settings module.

---

# Dynamic Settings Registration

Modules register

```text id="jlwmv6"
Category

↓

Fields

↓

Validation

↓

Default Values

↓

Permissions

↓

UI Components
```

Settings pages are built dynamically.

---

# Feature Flags

Feature Flags enable or disable functionality without code changes.

Examples

```text id="z0qfd8"
POS

Inventory

Barcode

Gift Cards

Customer Credit

Multi Warehouse

API Access

Offline Mode
```

Feature flags may be controlled by

* Platform
* Subscription Plan
* Tenant

---

# Tax Settings

Supports

* GST
* VAT
* Sales Tax
* Service Tax
* Custom Taxes

Configuration

* Inclusive Tax
* Exclusive Tax
* Compound Tax
* Tax Groups

---

# Invoice Numbering

Each document type has its own sequence.

Examples

```text id="9f8gcu"
INV-2026-000001

PO-2026-000001

GRN-2026-000001

CUS-000001

SUP-000001
```

Configuration includes

* Prefix
* Suffix
* Starting Number
* Padding
* Reset Rule

---

# Number Reset

Supported

```text id="6oqbvi"
Never

Yearly

Monthly

Daily
```

---

# Currency Settings

Supports

* Default Currency
* Currency Symbol
* Decimal Precision
* Thousands Separator
* Exchange Rates (Future)

---

# Localization

Configuration includes

* Language
* Date Format
* Time Format
* Number Format
* Time Zone

Supports multiple languages.

---

# Branding

Tenant branding

* Logo
* Favicon
* Primary Color
* Secondary Color
* Login Background
* Invoice Logo
* Email Branding

---

# Receipt Settings

Configuration

* Receipt Width
* Header
* Footer
* QR Code
* Barcode
* Terms & Conditions
* Return Policy

---

# Email Settings

Supports

* Sender Name
* Sender Email
* SMTP Configuration
* Reply Address

Templates managed separately.

---

# SMS Settings

Configuration

* Provider
* API Credentials
* Default Sender ID

Optional module.

---

# WhatsApp Settings

Configuration

* Provider
* API Credentials
* Template Approval
* Default Business Number

---

# Integration Settings

Centralized integrations.

Examples

```text id="d9m7zl"
Payment Gateway

SMS Provider

WhatsApp

Email Provider

Accounting

E-commerce

Shipping

Cloud Storage
```

---

# Payment Settings

Configure

* Supported Payment Methods
* Default Method
* Cash Rounding
* Split Payments
* Refund Rules

---

# Security Settings

Configuration includes

* Password Policy
* Session Timeout
* Login Attempts
* Two-Factor Authentication
* Device Restrictions
* IP Restrictions

---

# Backup Settings

Configuration

* Automatic Backup
* Backup Frequency
* Retention Period
* Backup Location

---

# Restore Settings

Authorized users can restore

* Entire Tenant
* Selected Modules
* Configuration Only

---

# Notification Settings

Tenant-wide configuration

* Email Enabled
* SMS Enabled
* WhatsApp Enabled
* Push Notifications
* Broadcast Messages

---

# Business Hours

Configure

* Working Days
* Opening Time
* Closing Time
* Holidays

Useful for scheduling and reporting.

---

# Data Retention

Examples

* Audit Logs
* Notifications
* Sessions
* Reports
* Backups

Retention periods are configurable.

---

# Import / Export Settings

Supports

* Import Templates
* Export Formats
* Default Encoding
* Validation Rules

---

# System Preferences

Examples

* Auto Logout
* Pagination Size
* Default Page Size
* Auto Save
* Confirmation Dialogs

---

# Settings Search

Global search across all settings.

Search examples

* Tax
* Receipt
* Email
* Barcode
* Currency

---

# Settings Permissions

```text id="1j5grb"
settings.view

settings.update

settings.organization

settings.modules

settings.security

settings.tax

settings.numbering

settings.integrations

settings.backup

settings.restore
```

---

# Settings Audit

Every configuration change is recorded.

Examples

* Tax Updated
* Logo Changed
* Invoice Prefix Changed
* Module Enabled
* Feature Flag Updated
* Password Policy Modified

Audit records include

* Previous Value
* New Value
* Changed By
* Timestamp

---

# Business Rules

* Settings are scoped by hierarchy.
* Lower scopes may override higher scopes where permitted.
* Core platform settings are editable only by Platform Administrators.
* Tenant administrators cannot modify platform-level configuration.
* Feature flags affect only authorized tenants.
* Number sequences must remain unique within their scope.
* Configuration changes are audited.
* Disabled modules hide their settings automatically.
* Module settings are registered dynamically.

---

# Future Enhancements

* AI Configuration Assistant
* Configuration Versioning
* One-click Configuration Templates
* Environment Profiles
* Configuration Marketplace
* Remote Configuration Sync
* Smart Validation
* Settings Comparison
* Configuration Rollback
* Tenant Configuration Cloning

---

# Module Relationships

```text id="mk2rqp"
Settings
│
├── Platform
├── Subscription
├── Modules
├── RBAC
├── Products
├── Inventory
├── Sales
├── Purchases
├── Reports
├── Notifications
├── Security
└── Audit
```

The Settings module is the configuration backbone of StoqBook, enabling every module to expose and manage its own configurable behavior while maintaining strict scope isolation, security, and auditability.

---

# Next Document

**18-api-specification.md**

The next document defines the complete API architecture, including authentication, versioning, REST conventions, pagination, filtering, sorting, webhooks, rate limiting, error handling, idempotency, and API security.
