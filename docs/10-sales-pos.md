# 10-sales-pos.md

# Sales & Point of Sale (POS) Module

Version: **1.0.0**

---

# Overview

The Sales & POS module manages the complete customer selling process, from quotations and sales orders to invoicing, payments, returns, and receipt generation.

This module is optimized for both:

* Traditional invoice-based sales
* High-speed Point of Sale (POS)

Every successful sale automatically updates inventory, customer history, financial records, and business analytics.

---

# Objectives

The Sales module should provide:

* POS Billing
* Sales Orders
* Quotations
* Sales Invoices
* Customer Management
* Multiple Payment Methods
* Discounts & Coupons
* Returns & Refunds
* Credit Sales
* Loyalty Programs
* Gift Cards
* Receipt Printing
* Sales Analytics

---

# Sales Architecture

```text id="4a7m2d"
Sales
│
├── Quotations
├── Sales Orders
├── POS
├── Sales Invoice
├── Payments
├── Returns
├── Refunds
├── Loyalty
├── Gift Cards
├── Receipts
├── Reports
└── Audit
```

---

# Sales Lifecycle

```text id="m6q5j8"
Quotation

↓

Sales Order

↓

POS / Invoice

↓

Payment

↓

Inventory Update

↓

Receipt

↓

Completed
```

Retail businesses may skip quotations and sales orders, going directly to POS.

---

# Sales Channels

Supported channels

```text id="n8f4zt"
POS Counter

Online

Phone Order

WhatsApp

Walk-in

Wholesale

Internal Sale
```

Sales channel is recorded for reporting.

---

# Quotation

A quotation is a price proposal.

Contains

* Customer
* Products
* Quantity
* Valid Until
* Taxes
* Discounts

Quotations do not affect inventory.

---

# Sales Order

Sales Orders reserve inventory before invoicing.

Workflow

```text id="b2g9qs"
Sales Order

↓

Reserve Stock

↓

Payment

↓

Invoice

↓

Complete
```

Reservation is optional.

---

# POS Billing

POS is optimized for speed.

Features

* Barcode Scanning
* Product Search
* Touch Interface
* Quick Quantity Change
* Multiple Payments
* Receipt Printing
* Customer Selection
* Discount Application

---

# Barcode Scanning

Products can be added using

* Barcode Scanner
* QR Scanner
* Manual Search

---

# Sales Invoice

Every completed sale generates an invoice.

Invoice contains

* Invoice Number
* Customer
* Items
* Taxes
* Discounts
* Payment
* Total

Invoice numbers are configurable.

---

# Payment Methods

Supported

```text id="j9k4vh"
Cash

Card

UPI

Bank Transfer

Wallet

Gift Card

Store Credit

Split Payment
```

Multiple payment methods may be combined.

---

# Split Payments

Example

```text id="z8t2ld"
Cash

₹1000

+

UPI

₹500

=

₹1500
```

---

# Payment Status

```text id="r5x8pf"
Pending

Partially Paid

Paid

Refunded

Cancelled
```

Automatically maintained.

---

# Customer Selection

Sales may be

* Walk-in
* Registered Customer

Walk-in customer is automatically available.

---

# Customer Credit

Businesses may allow credit sales.

Workflow

```text id="v2n3ea"
Sale

↓

Outstanding Balance

↓

Customer Pays Later

↓

Balance Cleared
```

Credit limits are configurable.

---

# Discounts

Supported

* Item Discount
* Invoice Discount
* Percentage
* Fixed Amount
* Promotional Discount

Discount permissions are configurable.

---

# Coupon Support

Future support

Coupons may contain

* Code
* Validity
* Usage Limit
* Discount Rules

---

# Loyalty Program

Customers earn loyalty points.

Example

```text id="x5r7yn"
₹100

↓

1 Point
```

Points can later be redeemed.

Rules are configurable.

---

# Gift Cards

Supports

* Gift Card Issue
* Gift Card Recharge
* Gift Card Redemption
* Gift Card Balance

Gift cards behave as payment methods.

---

# Receipt Generation

Receipts are generated automatically.

Configurable elements

* Logo
* Header
* Footer
* Tax Details
* QR Code
* Barcode
* Terms

Supports

* Thermal Printer
* A4 Invoice
* PDF

---

# Inventory Integration

Inventory updates immediately after sale.

```text id="w6c9ub"
Invoice

↓

Inventory Movement (-)

↓

Current Stock Updated
```

---

# Sales Returns

Customers may return products.

Reasons

* Damaged
* Wrong Product
* Defective
* Exchange
* Customer Request

---

# Return Workflow

```text id="k7n2wx"
Return Requested

↓

Verification

↓

Inventory Received

↓

Refund

↓

Completed
```

Inventory is updated after successful return.

---

# Refund Methods

Supported

* Cash
* UPI
* Bank
* Wallet
* Store Credit
* Original Payment Method

Refund policies are configurable.

---

# Exchange

Customers may exchange products.

Workflow

```text id="a4x8jt"
Return

↓

Inventory Updated

↓

New Invoice

↓

Price Difference Calculated
```

---

# Sales Cancellation

Allowed only before payment completion, unless user has cancellation permission.

Completed sales require return transactions.

---

# Tax Calculation

Each invoice calculates

* Taxable Amount
* Tax
* Total Tax
* Grand Total

Supports inclusive and exclusive tax.

---

# Invoice Numbering

Example

```text id="g3r5vm"
INV-2026-000001

INV-2026-000002
```

Configurable by branch.

---

# Sales Search

Search by

* Invoice Number
* Customer
* Barcode
* Product
* Mobile Number

---

# Sales Filters

Examples

* Today's Sales
* Pending Payments
* Paid
* Returned
* Cancelled
* Cash Sales
* Credit Sales

---

# POS Dashboard

Widgets

* Today's Sales
* Today's Revenue
* Average Bill Value
* Transactions
* Refunds
* Top Cashier
* Best Selling Products

---

# Sales Reports

Supports

* Sales Register
* Daily Sales
* Monthly Sales
* Customer Sales
* Product Sales
* Tax Report
* Refund Report
* Payment Report
* Profit Report
* Cashier Report

---

# Receipt Printing

Supports

* Thermal Printers
* USB Printers
* Network Printers
* Bluetooth Printers
* PDF Download
* Email Receipt

---

# Offline POS

Future capability.

Supports

* Offline Billing
* Local Queue
* Automatic Synchronization
* Conflict Resolution

Useful during internet outages.

---

# Sales Permissions

```text id="t9w6qc"
sales.view

sales.create

sales.update

sales.cancel

sales.return

sales.refund

sales.discount

sales.credit

sales.export

sales.print
```

---

# Sales Audit

Every sales event is recorded.

Examples

* Invoice Created
* Payment Received
* Discount Applied
* Refund Processed
* Return Completed
* Receipt Printed

Audit records are immutable.

---

# Business Rules

* Completed sales immediately reduce inventory.
* Cancelled invoices do not affect inventory.
* Sales returns create positive inventory movements.
* Refunds cannot exceed the original payment.
* Invoice numbers must be unique.
* Gift card balance cannot become negative.
* Loyalty points are reversible on returns.
* Credit sales must respect customer credit limits.
* Discounts may require manager approval based on configuration.

---

# Future Enhancements

* Self Checkout
* Mobile POS
* AI Product Recommendations
* Dynamic Pricing
* Digital Receipts
* QR Payments
* Subscription Products
* Kitchen Display System
* Restaurant Mode
* Queue Management

---

# Module Relationships

```text id="d7u8ra"
Sales
│
├── Products
├── Inventory
├── Customers
├── Payments
├── Loyalty
├── Reports
├── Dashboard
├── Notifications
└── Audit
```

Sales is the primary revenue-generating module and integrates tightly with inventory, customers, and financial reporting.

---

# Next Document

**11-customers.md**

The next document defines the Customer Management (CRM Lite) module, including customer profiles, addresses, contacts, loyalty, credit management, communication history, segmentation, and customer analytics.
