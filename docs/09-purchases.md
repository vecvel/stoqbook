# 09-purchases.md

# Purchase Management Module

Version: **1.0.0**

---

# Overview

The Purchase Management module manages the complete procurement lifecycle, from requesting inventory to receiving goods, processing supplier invoices, making payments, and handling purchase returns.

Every purchase increases inventory through the Inventory module, ensuring accurate stock levels and valuation.

---

# Objectives

The Purchase module should provide:

* Purchase Requisitions
* Purchase Orders (PO)
* Supplier Management Integration
* Goods Receipt (GRN)
* Purchase Invoices
* Purchase Returns
* Partial Deliveries
* Payment Tracking
* Approval Workflows
* Purchase Analytics
* Audit Trail

---

# Purchase Architecture

```text id="o2m4g7"
Purchases
│
├── Purchase Requisition
├── Purchase Orders
├── Goods Receipt
├── Purchase Invoice
├── Payments
├── Returns
├── Attachments
├── Approvals
├── Reports
└── Audit
```

---

# Purchase Lifecycle

```text id="o5xnhs"
Purchase Requisition

↓

Purchase Order

↓

Approval

↓

Supplier Confirmation

↓

Goods Receipt

↓

Purchase Invoice

↓

Payment

↓

Completed
```

---

# Purchase Documents

Supported documents

```text id="e3mfdx"
Purchase Requisition (PR)

Purchase Order (PO)

Goods Receipt Note (GRN)

Supplier Invoice

Debit Note

Purchase Return
```

Each document has its own numbering sequence.

---

# Purchase Requisition

A Purchase Requisition is an internal request to buy products.

Example

```text id="bdkgh7"
Store Manager

↓

Request 50 Units

↓

Approval
```

Requisitions do not affect inventory.

---

# Purchase Order

A Purchase Order is issued to the supplier after approval.

Contains

* Supplier
* Products
* Quantities
* Prices
* Taxes
* Delivery Date
* Payment Terms

---

# Purchase Order Status

```text id="u1mvx9"
Draft

Pending Approval

Approved

Sent

Partially Received

Completed

Cancelled
```

---

# Purchase Approval

Approval may be configured based on

* Total Amount
* Department
* Branch
* User Role

Example

```text id="c4hdql"
Purchase < ₹50,000

↓

Manager Approval

Purchase > ₹50,000

↓

Owner Approval
```

Approval workflows are fully configurable.

---

# Supplier Confirmation

Suppliers may

* Accept
* Reject
* Request Changes

Order remains editable until confirmed.

---

# Goods Receipt Note (GRN)

Inventory is increased only after a GRN is completed.

Workflow

```text id="xtmfm4"
Receive Goods

↓

Inspect

↓

Record Received Quantity

↓

Generate GRN

↓

Inventory Updated
```

---

# Partial Receiving

A purchase order may be fulfilled in multiple shipments.

Example

Ordered

100 Units

Shipment 1

40 Units

Shipment 2

60 Units

Purchase Order remains **Partially Received** until completed.

---

# Inventory Integration

Inventory movement occurs only through GRN.

```text id="xtw8pl"
Purchase Order

↓

Goods Receipt

↓

Inventory Movement (+)

↓

Current Stock
```

Purchase creation alone does not increase stock.

---

# Supplier Invoice

Suppliers issue invoices after delivery.

Invoice stores

* Invoice Number
* Invoice Date
* Due Date
* Tax
* Discounts
* Freight
* Total Amount

---

# Payment Tracking

Payments support

```text id="mj0f5u"
Cash

Bank Transfer

Cheque

UPI

Credit

Online Gateway
```

Multiple payments per invoice are supported.

---

# Payment Status

```text id="9d0hms"
Unpaid

Partially Paid

Paid

Overpaid
```

Automatically calculated.

---

# Purchase Returns

Products can be returned to suppliers.

Reasons

* Damaged
* Wrong Item
* Expired
* Quality Issue
* Excess Quantity

Workflow

```text id="yrm0tt"
Return Created

↓

Approval

↓

Supplier Accepted

↓

Inventory Reduced

↓

Debit Note
```

---

# Purchase Cost Components

Total purchase cost may include

* Product Cost
* Tax
* Shipping
* Freight
* Customs
* Insurance
* Other Charges

Useful for accurate inventory valuation.

---

# Discount Management

Supports

* Percentage Discount
* Fixed Discount
* Item Discount
* Invoice Discount

---

# Tax Management

Each purchase calculates

* Taxable Amount
* Tax
* Total Tax
* Grand Total

Integrated with product tax settings.

---

# Supplier Mapping

Each purchase belongs to exactly one supplier.

A supplier may have unlimited purchase orders.

---

# Purchase Numbering

Purchase numbers are configurable.

Example

```text id="h4n2wq"
PO-2026-000001

PO-2026-000002
```

Separate sequences per branch are supported.

---

# Attachments

Purchase records may contain

* Quotations
* Supplier Invoice PDF
* Delivery Challan
* Images
* Contracts

---

# Purchase Cancellation

Purchase Orders can be cancelled only before goods receipt.

Completed GRNs require return transactions instead of cancellation.

---

# Purchase Search

Search by

* Purchase Number
* Supplier
* Product
* Invoice Number
* Status

---

# Purchase Filters

Examples

* Pending Approval
* Approved
* Received
* Partially Received
* Cancelled
* Paid
* Unpaid

---

# Purchase Dashboard

Widgets

* Today's Purchases
* Pending Approvals
* Outstanding Payments
* Top Suppliers
* Purchase Value
* Purchase Trends

---

# Purchase Reports

Supports

* Purchase Summary
* Purchase Register
* Supplier Purchase Report
* Outstanding Payments
* Purchase Return Report
* Tax Report
* Item Purchase History

---

# Purchase Permissions

```text id="ynh2eg"
purchases.view

purchases.create

purchases.update

purchases.approve

purchases.receive

purchases.cancel

purchases.return

purchases.export

purchases.payment
```

---

# Purchase Audit

Every purchase operation is logged.

Examples

* Purchase Created
* Purchase Approved
* GRN Generated
* Invoice Attached
* Payment Recorded
* Purchase Returned

Audit records cannot be modified.

---

# Business Rules

* Purchase Orders do not affect inventory.
* Inventory increases only after Goods Receipt.
* Goods Receipt cannot exceed ordered quantity unless over-receipt is allowed.
* Purchase Returns create negative inventory movements.
* Purchase numbers must be unique within a tenant.
* Payments cannot exceed invoice total unless overpayment is permitted.
* Cancelled purchase orders cannot be received.
* Every purchase belongs to exactly one supplier.
* Every inventory increase must have a corresponding ledger entry.

---

# Future Enhancements

* Supplier Portal
* RFQ (Request for Quotation)
* Vendor Comparison
* Auto Purchase Suggestions
* AI Supplier Recommendations
* OCR Invoice Scanning
* E-Invoicing Integration
* Procurement Contracts
* Blanket Purchase Orders
* Scheduled Recurring Purchases

---

# Module Relationships

```text id="x4l7rn"
Purchases
│
├── Suppliers
├── Products
├── Inventory
├── Payments
├── Reports
├── Dashboard
├── Notifications
└── Audit
```

Purchases act as the primary source of inbound inventory and supplier financial transactions.

---

# Next Document

**10-sales-pos.md**

The next document defines the complete Sales & Point of Sale (POS) module, including quotations, sales orders, invoices, POS billing, discounts, returns, payments, loyalty, gift cards, customer credit, receipt printing, and sales business rules.
