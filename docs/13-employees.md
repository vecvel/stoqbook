# 13-employees.md

# Employee Management Module

Version: **1.0.0**

---

# Overview

The Employee Management module is responsible for managing all users working within a tenant.

It provides employee profiles, organizational hierarchy, branch assignments, departments, shifts, attendance, leave management, activities, and role assignments.

This module integrates closely with the RBAC system to ensure employees can only access the resources required for their responsibilities.

---

# Objectives

The Employee module should provide:

* Employee Profiles
* Branch Assignment
* Department Management
* Designation Management
* Role Assignment
* Attendance
* Shift Management
* Leave Management
* Activity Logs
* Employee Documents
* Employee Analytics

---

# Employee Architecture

```text
Employees
│
├── Profiles
├── Departments
├── Designations
├── Branch Assignments
├── Roles
├── Attendance
├── Shifts
├── Leave
├── Documents
├── Activities
├── Performance
└── Audit
```

---

# Employee Lifecycle

```text
Invited

↓

Registered

↓

Verified

↓

Active

↓

Suspended

↓

Resigned

↓

Archived
```

---

# Employee Profile

Every employee contains

Personal

* Employee ID
* Full Name
* Gender
* Date of Birth

Contact

* Mobile
* Email
* Address

Employment

* Joining Date
* Employment Type
* Department
* Designation
* Branch

System

* Username
* Login Email
* Status

---

# Employment Types

Supported types

```text
Permanent

Contract

Part Time

Intern

Temporary
```

---

# Employee Code

Example

```text
EMP-000001

EMP-000002

EMP-000003
```

Auto-generated or manually assigned.

---

# Departments

Departments organize employees.

Examples

```text
Sales

Inventory

Warehouse

Accounts

Administration

Management
```

Departments are tenant configurable.

---

# Designations

Examples

```text
Cashier

Store Manager

Warehouse Manager

Accountant

Sales Executive

Inventory Executive
```

Unlimited designations supported.

---

# Branch Assignment

An employee belongs to one primary branch.

Future support

* Multiple Branch Assignment
* Temporary Branch Assignment

---

# Employee Roles

Every employee is assigned one or more RBAC roles.

Example

```text
Employee

↓

Store Manager

↓

Manager Role

↓

Permissions
```

Employees inherit permissions through assigned roles.

---

# Login Access

Employee login may be

```text
Enabled

Disabled
```

Employees without login can still exist for attendance and HR records.

---

# Employee Status

```text
Pending

Active

Suspended

Resigned

Archived
```

---

# Attendance

Attendance records include

* Date
* Check In
* Check Out
* Working Hours
* Status

Status examples

```text
Present

Absent

Late

Half Day

Leave

Holiday
```

---

# Attendance Workflow

```text
Check In

↓

Working Hours

↓

Check Out

↓

Attendance Calculated
```

---

# Shift Management

Supports

* Morning Shift
* Evening Shift
* Night Shift
* Rotational Shift

Each shift contains

* Start Time
* End Time
* Break Duration
* Grace Time

---

# Leave Management

Leave types

```text
Casual Leave

Sick Leave

Paid Leave

Unpaid Leave

Maternity Leave

Emergency Leave
```

Tenant can define custom leave types.

---

# Leave Workflow

```text
Employee Request

↓

Manager Approval

↓

Leave Granted

↓

Attendance Updated
```

Approval workflow is configurable.

---

# Employee Documents

Supports storing

* Government ID
* Employment Contract
* Offer Letter
* Resume
* Certificates
* Bank Details

Document visibility is permission controlled.

---

# Employee Activity

Every employee activity is tracked.

Examples

* Login
* Logout
* Product Created
* Sale Completed
* Purchase Approved
* Stock Adjusted

Useful for auditing.

---

# Employee Timeline

```text
Employee Created

↓

Joined

↓

Role Assigned

↓

Branch Assigned

↓

Attendance

↓

Promotion

↓

Resignation
```

---

# Employee Performance

Future metrics

* Sales Performance
* Attendance %
* Inventory Accuracy
* Average Billing Time
* Customer Ratings
* Productivity Score

---

# Employee Search

Search by

* Employee ID
* Name
* Mobile
* Email
* Department
* Designation

---

# Employee Filters

Examples

* Active
* Suspended
* Department
* Branch
* Shift
* Role
* Attendance Status

---

# Employee Dashboard

Widgets

* Total Employees
* Present Today
* Absent Today
* Late Arrivals
* Upcoming Birthdays
* Leave Requests
* New Employees

---

# Employee Reports

Supports

* Employee Directory
* Attendance Report
* Leave Report
* Activity Report
* Branch Employee Report
* Department Report
* Shift Report

---

# Employee Notifications

Examples

* Shift Reminder
* Leave Approval
* Attendance Reminder
* Password Reset
* Account Suspension
* New Assignment

---

# Employee Permissions

```text
employees.view

employees.create

employees.update

employees.delete

employees.invite

employees.suspend

employees.attendance

employees.leave

employees.export
```

---

# Employee Audit

Every employee-related operation is recorded.

Examples

* Employee Created
* Employee Updated
* Role Changed
* Branch Changed
* Shift Assigned
* Attendance Updated
* Leave Approved
* Employee Suspended

Audit records cannot be modified.

---

# Business Rules

* Every employee belongs to exactly one tenant.
* Employee IDs must be unique within a tenant.
* Employees can have multiple roles.
* Employees cannot access disabled modules.
* Suspended employees cannot log in.
* Archived employees remain available in historical records.
* Attendance records cannot be deleted after payroll processing.
* Employee activities are permanently logged.

---

# Future Enhancements

* Payroll
* Biometric Attendance
* Face Recognition
* GPS Attendance
* Employee Mobile App
* Performance Reviews
* Goal Management
* Training Management
* Asset Assignment
* Expense Claims

---

# Module Relationships

```text
Employees
│
├── RBAC
├── Branches
├── Departments
├── Attendance
├── Sales
├── Purchases
├── Inventory
├── Dashboard
├── Reports
└── Audit
```

The Employee module provides the workforce management layer for StoqBook while integrating tightly with RBAC, auditing, attendance, and operational modules.

---

# Next Document

**14-reporting.md**

The next document defines the Reporting & Analytics module, including operational reports, financial reports, dashboards, KPIs, exports, scheduled reports, custom report builder, and business intelligence architecture.
