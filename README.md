<div align="center">

# 📦 StoqBook

### *The Modern Retail Operating System*

[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16_App_Router-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?logo=tailwindcss)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-C5F74F?logo=postgresql)](https://orm.drizzle.team/)

</div>

---

<img width="1669" height="851" alt="Screenshot 2026-08-14 at 12 01 38 PM" src="https://github.com/user-attachments/assets/9ef30760-6192-439c-a3cc-264e19acfc05" />


## 📖 Overview

**StoqBook** is an enterprise-grade, modern retail operating system designed for multi-store inventory control, point of sale, purchasing workflows, employee management, and real-time business intelligence. Built with Next.js 16 (App Router), React 19, Drizzle ORM, and PostgreSQL, StoqBook delivers lighting-fast performance and seamless operational management.

---

## ✨ Key Features

- 🏬 **Multi-Store & Warehouse Operations**: Manage multiple physical stores and warehouses with real-time stock transfer and tracking.
- 📊 **Real-Time Analytics & Dashboard**: Key performance metrics, sales trends, stock movement visual analytics using Recharts.
- 📦 **Smart Inventory Control**: Automated reorder point alerts, opening stock tools, product cataloging, and unit specifications.
- 🧾 **Purchasing & Sales Workflows**: Complete purchase order lifecycle, customer quotations, billing, and supplier contracts.
- 👥 **HR & Employee Access Control**: Fine-grained Role-Based Access Control (RBAC), system guard contexts, and entitlements.
- 📑 **Excel Import/Export System**: High-speed bulk data import and export powered by `exceljs` and strict data validation specifications.
- ⚙️ **Background Job Processing**: Dedicated background worker daemon (`src/worker.ts`) for cron triggers, report generation, and system health checks.
- 🔒 **Security & Audit Logs**: Comprehensive audit trails recording business events, user actions, and system modifications.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router with Server Actions & API Routes)
- **UI & Styling**: React 19, Tailwind CSS v4, Radix UI primitives, Lucide Icons, Sonner toasts
- **State & Charts**: Recharts, Zod schemas, React Hook Form integrations
- **Database & ORM**: PostgreSQL, Drizzle ORM, Drizzle Kit
- **Background Worker**: `tsx` daemon with job queues and runner tasks
- **Containerization**: Docker & Docker Compose

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20+ 
- **npm**: v10+
- **Docker & Docker Compose**: For local PostgreSQL database setup

### Installation & Environment Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/vecvel/stoqbook.git
   cd stoqbook
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your database credentials:
   ```bash
   cp .env.example .env
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Start Database & Run Setup**:
   ```bash
   # Starts Docker PostgreSQL, pushes database schema, and seeds default data
   npm run setup
   ```

5. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

6. **Start Background Worker (Optional / Concurrent)**:
   ```bash
   npm run worker
   ```

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Next.js development server |
| `npm run build` | Builds production bundle |
| `npm run start` | Starts Next.js production server |
| `npm run setup` | Starts DB container, pushes schema, and seeds data |
| `npm run db:up` | Starts PostgreSQL container via Docker Compose |
| `npm run db:push` | Pushes Drizzle schema changes directly to DB |
| `npm run db:seed` | Seeds database with initial system roles & plans |
| `npm run db:studio` | Launches Drizzle Studio interface |
| `npm run worker` | Runs the background worker process |

---

## 📁 Repository Structure

```
stoqbook/
├── src/
│   ├── app/              # Next.js App Router (Pages, Layouts, Server Actions, API V1)
│   ├── components/       # Shared UI components, layout shells, charts, data tables
│   ├── db/               # Drizzle schemas (Admin, Catalog, Inventory, Purchasing, Sales, System)
│   ├── lib/              # Core business services, authz guard, excel specs, job handlers
│   └── worker.ts         # Standalone background worker process
├── docs/                 # Architectural specifications & domain documentation
├── docker-compose.yml    # PostgreSQL container orchestration
├── drizzle.config.ts     # Drizzle Kit configuration
└── package.json
```

---

## 🔒 Copyright & License

**Copyright © 2026 vecvel. All Rights Reserved.**

This software is **proprietary** and strictly confidential. 

- **No Public License**: No permission or license (personal, commercial, or modification) is granted without the explicit prior written consent of the author, **vecvel**.
- Please review the full terms in the [LICENSE](LICENSE) file before accessing or referencing this codebase.
- For inquiries, licensing, or permissions: [support@vecvel.com](mailto:support@vecvel.com).

---

<div align="center">
  <sub>Developed & Maintained by <b><a href="https://github.com/vecvel">vecvel</a></b></sub>
</div>
