# 08-inventory.md

# Inventory Management Module

Version: **1.0.0**

---

# Overview

The Inventory Module is the heart of StoqBook.

Every stock movement inside the platform must pass through the inventory engine.

Inventory is **ledger-driven**, meaning stock is never manually overwritten. Every increase or decrease in stock creates an immutable inventory movement.

This provides complete traceability and auditability.

---

# Objectives

The Inventory module should provide:

* Real-time Stock Tracking
* Complete Stock Ledger
* Multi-Branch Inventory
* Multi-Warehouse Inventory
* Batch Tracking
* Expiry Tracking
* Stock Reservations
* Stock Transfers
* Stock Adjustments
* Physical Stock Count
* Inventory Audit
* Low Stock Alerts
* Inventory Valuation

---

# Inventory Architecture

```text
Inventory
│
├── Current Stock
├── Stock Ledger
├── Stock Movements
├── Reservations
├── Transfers
├── Adjustments
├── Physical Counts
├── Reorder Rules
├── Batch Management
├── Expiry Management
└── Audit
```

---

# Core Principle

Stock is **never edited directly**.

Every stock change creates an Inventory Movement.

Example

```text
Purchase Received

↓

Inventory Movement (+50)

↓

Current Stock Updated
```

---

```text
Sale Completed

↓

Inventory Movement (-2)

↓

Current Stock Updated
```

---

# Inventory Structure

Inventory belongs to

```text
Tenant

↓

Branch

↓

Warehouse

↓

Product

↓

Inventory
```

---

# Current Stock

Current stock represents the available quantity.

Current stock is derived from

```
Opening Stock

+

Purchases

+

Transfers In

+

Adjustments In

-

Sales

-

Returns to Supplier

-

Transfers Out

-

Damages

-

Expired

-

Adjustments Out
```

---

# Stock Ledger

The stock ledger is immutable.

Every stock event creates one ledger entry.

Example

| Date  | Event    | Quantity | Balance |
| ----- | -------- | -------: | ------: |
| 1 Jan | Opening  |     +100 |     100 |
| 2 Jan | Sale     |       -5 |      95 |
| 3 Jan | Purchase |      +20 |     115 |
| 5 Jan | Damage   |       -2 |     113 |

Ledger entries are never edited.

---

# Inventory Movement Types

Supported movement types

```text
Opening Stock

Purchase

Sale

Sale Return

Purchase Return

Transfer In

Transfer Out

Adjustment

Damage

Expired

Reserved

Released

Production

Consumption
```

Future movement types can be added dynamically.

---

# Inventory States

Every stock quantity belongs to a state.

```text
Available

Reserved

Damaged

Expired

In Transit

Pending Inspection
```

---

# Available Stock

Stock that can be sold immediately.

---

# Reserved Stock

Stock allocated for

* Orders
* Transfers
* Reservations

Cannot be sold.

---

# Damaged Stock

Products marked damaged.

Removed from sellable inventory.

---

# Expired Stock

Expired products.

Cannot be sold.

---

# In Transit

Inventory currently moving between warehouses.

---

# Pending Inspection

Received inventory waiting for verification.

Not sellable.

---

# Opening Stock

Opening stock initializes inventory.

Allowed only

* New Product
* New Warehouse
* New Branch

Every opening stock creates a ledger movement.

---

# Stock Adjustment

Stock adjustment corrects discrepancies.

Reasons

* Counting Error
* Damaged Product
* Missing Product
* Found Product
* Administrative Correction

Adjustments require reason codes.

---

# Adjustment Flow

```text
Adjustment Requested

↓

Approval (Optional)

↓

Ledger Entry

↓

Stock Updated

↓

Audit Log
```

---

# Stock Transfer

Supports

Branch → Branch

Warehouse → Warehouse

Warehouse → Branch

Transfer lifecycle

```text
Created

↓

Approved

↓

Dispatched

↓

In Transit

↓

Received

↓

Completed
```

Inventory changes only after receipt.

---

# Transfer Validation

Transfer requires

* Active Source
* Active Destination
* Available Stock
* Permission

---

# Physical Stock Count

Supports periodic inventory counting.

Workflow

```text
Create Count

↓

Assign Employees

↓

Count Products

↓

Compare

↓

Variance Report

↓

Approval

↓

Adjustment
```

---

# Variance Calculation

Variance

```
Expected Quantity

-

Physical Quantity

=

Difference
```

Positive

Stock Found

Negative

Stock Lost

---

# Inventory Reservation

Reservations temporarily block inventory.

Examples

* Customer Order
* Internal Request
* Transfer

Flow

```text
Reserve

↓

Available Stock Reduced

↓

Order Completed

↓

Reservation Released
```

---

# Reservation Expiry

Reservations may expire automatically.

Expired reservations release stock.

---

# Batch Management

Products may use batches.

Each batch stores

* Batch Number
* Manufacturing Date
* Expiry Date
* Quantity

Example

```text
Milk

↓

Batch A

↓

150 Units
```

---

# Expiry Management

Supports

* Expiry Tracking
* Near Expiry Alerts
* Expired Reports

Expired inventory cannot be sold.

---

# Reorder Levels

Each product may define

* Minimum Stock
* Maximum Stock
* Reorder Quantity

Example

```
Current Stock

15

Minimum

20

↓

Generate Alert
```

---

# Automatic Reorder Suggestions

Future capability.

Based on

* Sales History
* Average Consumption
* Lead Time

Suggested Purchase Quantity generated automatically.

---

# Inventory Valuation

Supported valuation methods

```text
FIFO

LIFO

Weighted Average

Specific Identification
```

Tenant selects one method.

---

# FIFO

First In

First Out

Common for retail.

---

# LIFO

Last In

First Out

Available where applicable.

---

# Weighted Average

Average product cost.

Suitable for many retail businesses.

---

# Inventory Search

Supports search by

* Product Name
* SKU
* Barcode
* Batch
* Warehouse
* Branch

---

# Inventory Filters

Examples

* Low Stock
* Out of Stock
* Overstock
* Damaged
* Reserved
* Expired
* Near Expiry

---

# Inventory Dashboard

Widgets

* Inventory Value
* Total Stock
* Low Stock
* Out of Stock
* Fast Moving
* Slow Moving
* Expired Products
* Damaged Stock

---

# Inventory Reports

Supports

Stock Summary

Stock Ledger

Movement History

Inventory Valuation

Transfer Report

Adjustment Report

Damage Report

Expiry Report

Reservation Report

---

# Low Stock Alerts

Triggers when

```
Current Stock

≤

Minimum Stock
```

Notifications sent to

* Owner
* Manager
* Inventory Manager

---

# Inventory Permissions

```text
inventory.view

inventory.adjust

inventory.transfer

inventory.reserve

inventory.audit

inventory.import

inventory.export

inventory.count

inventory.approve_adjustment
```

---

# Inventory Audit

Every inventory operation creates an audit record.

Examples

* Opening Stock Created
* Stock Adjusted
* Transfer Approved
* Transfer Received
* Batch Updated
* Reservation Created

Audit records cannot be modified.

---

# Business Rules

* Stock cannot become negative unless negative stock is enabled.
* Every stock movement creates a ledger entry.
* Ledger entries are immutable.
* Transfers require source and destination.
* Reserved stock cannot be sold.
* Expired stock cannot be sold.
* Damaged stock cannot be sold.
* Inventory adjustments require a reason.
* Inventory counts should create variance reports.
* Inventory history is never deleted.

---

# Future Enhancements

* RFID Support
* IoT Warehouse Sensors
* AI Demand Forecasting
* Auto Purchase Suggestions
* Mobile Inventory Scanner
* Voice Stock Lookup
* Smart Warehouse Routing
* Pick & Pack Optimization
* Inventory Heat Maps

---

# Module Relationships

```text
Inventory
│
├── Products
├── Purchases
├── Sales
├── Warehouses
├── Branches
├── Reports
├── Dashboard
├── Notifications
└── Audit
```

Inventory is the central operational module connecting purchasing, sales, warehousing, and reporting.

---

# Next Document

**09-purchases.md**

The next document defines the complete Purchase Management module, including purchase requisitions, purchase orders, goods receipt notes (GRN), supplier invoices, approvals, payment workflows, purchase returns, and supplier performance tracking.
