# 15-dashboard.md

# Dashboard Module

Version: **1.0.0**

---

# Overview

The Dashboard is the primary workspace of StoqBook.

It provides every user with a personalized, real-time overview of the information that matters most based on their role, permissions, branch, modules, and responsibilities.

The dashboard is fully dynamic. Nothing is hardcoded.

Every card, widget, chart, table, notification, and shortcut is generated based on:

* Enabled Modules
* User Role
* Permissions
* Branch Access
* Warehouse Access
* Subscription Features
* Tenant Configuration

---

# Objectives

The Dashboard should provide

* Personalized Workspace
* Real-time KPIs
* Dynamic Widgets
* Charts & Analytics
* Recent Activities
* Notifications
* Quick Actions
* Module Shortcuts
* Branch-specific Insights
* Employee-specific Views

---

# Dashboard Architecture

```text id="n8j3kp"
Dashboard
│
├── KPI Cards
├── Widgets
├── Charts
├── Quick Actions
├── Notifications
├── Activities
├── Reports
├── Shortcuts
├── Tasks
└── Custom Layout
```

---

# Dashboard Generation Flow

```text id="x6v2mn"
User Login

↓

Authentication

↓

RBAC

↓

Enabled Modules

↓

Subscription Features

↓

Dashboard Builder

↓

Personalized Dashboard
```

---

# Dashboard Types

Every role gets a different dashboard.

Examples

```text id="b4l2qv"
Owner Dashboard

Store Manager Dashboard

Cashier Dashboard

Inventory Dashboard

Warehouse Dashboard

Purchase Dashboard

Sales Dashboard

Accountant Dashboard

Developer Dashboard
```

---

# Owner Dashboard

Widgets

* Today's Revenue
* Monthly Revenue
* Gross Profit
* Net Profit
* Inventory Value
* Outstanding Payments
* Top Selling Products
* Sales Trend
* Purchase Trend
* Employee Performance
* Branch Performance
* Low Stock Alerts

---

# Store Manager Dashboard

Widgets

* Today's Sales
* Pending Orders
* Inventory Status
* Staff Attendance
* Low Stock
* Customer Visits
* Recent Sales
* Branch Performance

---

# Cashier Dashboard

Widgets

* Today's Bills
* Today's Revenue
* Current Shift Sales
* Pending Payments
* Quick POS
* Recent Transactions

---

# Inventory Dashboard

Widgets

* Current Inventory
* Low Stock
* Out of Stock
* Damaged Products
* Expired Products
* Stock Transfers
* Pending Adjustments

---

# Purchase Dashboard

Widgets

* Pending Purchase Orders
* Goods Awaiting Receipt
* Outstanding Supplier Payments
* Purchase Trends
* Supplier Performance

---

# Sales Dashboard

Widgets

* Daily Revenue
* Orders
* Refunds
* Best Sellers
* Sales by Hour
* Payment Distribution

---

# Accountant Dashboard

Widgets

* Cash Flow
* Revenue
* Expenses
* Taxes
* Outstanding Receivables
* Outstanding Payables

---

# Dynamic Widgets

Widgets are registered by modules.

Example

Inventory Module

Registers

```text id="y5c6hr"
Inventory Value

Low Stock

Out of Stock
```

Sales Module

Registers

```text id="u1m7sd"
Today's Sales

Revenue

Refunds
```

The dashboard automatically discovers available widgets.

---

# Widget Registration

Each widget contains

```text id="v8g3pa"
Name

Description

Permission

Module

Priority

Refresh Interval

Configuration
```

---

# Widget Visibility

Widgets are shown only if

```text id="k7w5el"
Module Enabled

AND

Permission Granted

AND

Subscription Allows

AND

Branch Accessible
```

---

# KPI Cards

Examples

```text id="n3t8ym"
Revenue

Profit

Inventory Value

Products

Customers

Suppliers

Employees

Orders
```

KPIs update automatically.

---

# Charts

Supported charts

```text id="a6h4rz"
Bar Chart

Line Chart

Area Chart

Pie Chart

Donut Chart

Heat Map
```

---

# Real-Time Updates

Dashboard supports

* Live Sales
* Live Inventory
* Live Notifications
* Live Stock Alerts
* Live Orders

Refresh interval is configurable.

---

# Dashboard Layout

Users may customize

* Widget Position
* Widget Size
* Hidden Widgets
* Favorite Widgets

Layout is saved per user.

---

# Widget Sizes

Supported

```text id="d4j8xp"
Small

Medium

Large

Full Width
```

---

# Drag & Drop

Users can

* Move Widgets
* Resize Widgets
* Remove Widgets
* Restore Widgets

No administrator intervention required.

---

# Quick Actions

Common shortcuts

```text id="q2r5cf"
New Sale

Add Product

Receive Purchase

Stock Adjustment

New Customer

New Supplier

Create Employee
```

Visible according to permissions.

---

# Recent Activities

Displays recent actions.

Examples

* Product Created
* Sale Completed
* Purchase Approved
* Inventory Adjusted
* Employee Added

---

# Notifications Panel

Displays

* Low Stock
* Pending Approval
* System Updates
* Subscription Alerts
* Failed Jobs

Notifications are prioritized.

---

# Pending Tasks

Examples

* Approve Purchase
* Approve Leave
* Verify Stock Count
* Complete Transfer
* Pending Payments

---

# Favorites

Users can pin

* Reports
* Products
* Customers
* Suppliers
* Frequently Used Pages

---

# Branch Switching

Users with multiple branch access may switch dashboards.

Dashboard updates automatically.

---

# Global Search

Dashboard provides global search.

Searches

* Products
* Customers
* Suppliers
* Employees
* Invoices
* Purchases
* Transfers

Results respect permissions.

---

# Dashboard Filters

Examples

```text id="m9x2lh"
Today

Week

Month

Quarter

Year

Branch

Warehouse
```

Widgets update automatically when filters change.

---

# Dashboard Themes

Supports

* Light Mode
* Dark Mode
* System Theme

Tenant branding is supported.

---

# Dashboard Personalization

Users may configure

* Default Landing Page
* Default Branch
* Preferred Charts
* Default Filters
* Widget Layout

Settings are stored individually.

---

# Empty State

When no data exists

Dashboard displays

* Welcome Message
* Setup Checklist
* Product Wizard
* First Sale Guide
* Import Data Links

Helping new businesses onboard quickly.

---

# Dashboard Performance

Optimization strategies

* Widget Lazy Loading
* Background Refresh
* Cached KPIs
* Aggregated Metrics
* Incremental Updates

Large widgets load independently.

---

# Dashboard Permissions

```text id="p7e3tv"
dashboard.view

dashboard.customize

dashboard.export

dashboard.manage_widgets

dashboard.view_financial

dashboard.view_branch
```

---

# Dashboard Audit

Every customization is logged.

Examples

* Widget Added
* Widget Removed
* Layout Changed
* Favorite Added
* Default Dashboard Changed

---

# Business Rules

* Dashboard is generated dynamically.
* Hidden modules never expose widgets.
* Widgets respect RBAC.
* Widgets respect subscription limits.
* Financial widgets require financial permissions.
* Users only see branch-specific data.
* Layout changes affect only the current user.
* Dashboard remains functional even if a module is disabled.

---

# Future Enhancements

* AI Dashboard Assistant
* Voice Dashboard
* Predictive KPIs
* Natural Language Queries
* AI Business Health Score
* Smart Widget Recommendations
* Executive Dashboard
* Multi-Screen Dashboard
* TV Dashboard Mode
* Embedded External Analytics

---

# Module Relationships

```text id="r6q1zn"
Dashboard
│
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

The Dashboard acts as the unified control center of StoqBook, providing every user with a personalized, real-time operational view while adapting automatically to roles, permissions, enabled modules, and subscription plans.

---

# Next Document

**16-notifications.md**

This document defines the Notification System, including in-app notifications, email notifications, SMS/WhatsApp support, event-driven triggers, notification templates, scheduling, channels, priorities, and user notification preferences.
