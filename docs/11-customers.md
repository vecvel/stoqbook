# 11-customers.md

# Customer Management Module

Version: **1.0.0**

---

# Overview

The Customer Management module is the central repository for all customer information and interactions.

It enables businesses to build long-term customer relationships by managing profiles, purchase history, loyalty programs, credit accounts, communication history, and customer analytics.

This module serves both retail walk-in customers and registered business customers.

---

# Objectives

The Customer module should provide:

* Customer Profiles
* Contact Management
* Customer Groups
* Multiple Addresses
* Purchase History
* Loyalty Programs
* Credit Accounts
* Communication History
* Customer Analytics
* Customer Tags
* Customer Notes

---

# Customer Architecture

```text id="u3a91q"
Customers
│
├── Profiles
├── Contacts
├── Addresses
├── Groups
├── Loyalty
├── Credit
├── Purchase History
├── Notes
├── Documents
├── Analytics
└── Audit
```

---

# Customer Lifecycle

```text id="q9x82m"
Created

↓

Verified

↓

Active

↓

VIP

↓

Inactive

↓

Archived
```

---

# Customer Types

Supported customer types

```text id="j5m21k"
Walk-in

Retail Customer

Wholesale Customer

Corporate Customer

Distributor

Employee
```

Additional customer types can be configured.

---

# Customer Profile

Every customer contains

General

* Customer Code
* Full Name
* Company Name
* Customer Type

Contact

* Mobile Number
* Email Address

Identity

* Tax Number
* Registration Number

Business

* Credit Limit
* Payment Terms

Status

* Active
* Blocked
* Archived

---

# Customer Identification

Each customer has

```text id="r4c93f"
Customer Code

Mobile Number

(Optional)

Email Address
```

Customer codes can be auto-generated.

Example

```text id="m2l17x"
CUS-000001

CUS-000002
```

---

# Customer Groups

Groups simplify pricing and reporting.

Examples

```text id="f8p43n"
Retail

Wholesale

VIP

Corporate

Distributor
```

A customer belongs to one primary group.

---

# Customer Tags

Tags provide flexible categorization.

Examples

```text id="z1g67a"
High Value

Frequent Buyer

Inactive

Preferred

Seasonal
```

Multiple tags are supported.

---

# Customer Addresses

Supports multiple addresses.

Examples

* Billing Address
* Shipping Address
* Office Address
* Home Address

One address may be marked as default.

---

# Purchase History

Every completed sale is linked to the customer.

History includes

* Invoice
* Date
* Amount
* Payment Status
* Products Purchased

Provides a complete purchase timeline.

---

# Loyalty Program

Customers may participate in loyalty programs.

Tracks

* Total Points
* Available Points
* Redeemed Points
* Expired Points

Points are earned according to configurable rules.

---

# Loyalty Redemption

Example

```text id="k7r29v"
500 Points

↓

₹250 Discount
```

Rules are configurable.

---

# Customer Credit

Businesses may allow customers to purchase on credit.

Customer account stores

* Credit Limit
* Outstanding Balance
* Available Credit

---

# Credit Workflow

```text id="t9e21m"
Sale

↓

Outstanding Balance

↓

Payment

↓

Balance Updated
```

---

# Credit Validation

Before a credit sale

```text id="x4h68p"
Requested Amount

↓

Available Credit

↓

Approved

↓

Invoice
```

Sales exceeding the limit require authorization.

---

# Communication History

Every interaction may be logged.

Examples

* Phone Call
* SMS
* Email
* WhatsApp
* Visit
* Complaint

---

# Customer Notes

Internal notes are supported.

Examples

* Preferred Payment Method
* Preferred Brand
* Delivery Instructions
* Relationship Notes

Notes are visible only to authorized employees.

---

# Customer Documents

Optional document storage.

Examples

* Tax Certificate
* Business License
* ID Proof
* Signed Agreement

---

# Customer Search

Search by

* Customer Name
* Customer Code
* Mobile Number
* Email
* Company Name

---

# Customer Filters

Examples

* Active
* Inactive
* VIP
* Wholesale
* Outstanding Balance
* High Value
* Recently Added

---

# Customer Dashboard

Widgets

* Total Customers
* New Customers
* Active Customers
* VIP Customers
* Outstanding Credit
* Top Customers
* Customer Growth

---

# Customer Analytics

Available analytics

* Total Purchases
* Lifetime Value
* Average Order Value
* Purchase Frequency
* Last Purchase Date
* Preferred Products
* Preferred Payment Method

---

# Customer Timeline

Example

```text id="g6w85y"
Customer Created

↓

First Purchase

↓

Earned Loyalty

↓

Credit Sale

↓

Payment Received

↓

Latest Purchase
```

Provides a complete customer journey.

---

# Customer Status

```text id="y2b91n"
Active

Inactive

Blocked

Archived
```

Blocked customers cannot make credit purchases.

---

# Customer Merge

Duplicate customers can be merged.

Merge combines

* Purchase History
* Loyalty Points
* Credit Balance
* Notes
* Addresses

Historical invoices remain intact.

---

# Customer Import

Supports

* CSV
* Excel

Fields

* Name
* Mobile
* Email
* Customer Group
* Credit Limit

Validation occurs before import.

---

# Customer Export

Supports

* CSV
* Excel
* PDF

Exports respect user permissions.

---

# Customer Notifications

Future support

* Birthday Wishes
* Loyalty Updates
* Promotional Offers
* Outstanding Payment Reminders

Notification templates are configurable.

---

# Customer Permissions

```text id="d8t54r"
customers.view

customers.create

customers.update

customers.delete

customers.import

customers.export

customers.credit

customers.loyalty

customers.merge
```

---

# Customer Audit

Every modification is logged.

Examples

* Customer Created
* Customer Updated
* Credit Limit Changed
* Loyalty Redeemed
* Customer Merged
* Status Changed

Audit records are immutable.

---

# Business Rules

* Customer codes must be unique within a tenant.
* Mobile numbers may be configured as unique.
* Walk-in customers require minimal information.
* Loyalty points are automatically reversed on refunded sales.
* Customer deletion is not allowed if sales exist.
* Blocked customers cannot receive additional credit.
* Credit sales cannot exceed configured limits without approval.
* Customer merges preserve all historical transactions.

---

# Future Enhancements

* AI Customer Segmentation
* Customer Lifetime Value Prediction
* Membership Cards
* Family Accounts
* Referral Programs
* Marketing Campaign Integration
* Customer Mobile App
* Digital Wallet
* Subscription Customers
* Geo-based Customer Insights

---

# Module Relationships

```text id="n4q18x"
Customers
│
├── Sales
├── Loyalty
├── Payments
├── Reports
├── Notifications
├── Dashboard
└── Audit
```

The Customer module serves as the CRM foundation of StoqBook, enabling businesses to understand, retain, and grow their customer base.

---

# Next Document

**12-suppliers.md**

The next document defines the Supplier Management module, including supplier profiles, purchase history, payment tracking, supplier performance, contracts, contacts, ratings, and procurement analytics.
