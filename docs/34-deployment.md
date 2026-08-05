# 34-deployment.md

# Deployment

Version: **1.0.0**

StoqBook ships as a **per-installation** product: one business, one database,
one deployment. That shapes every decision here.

---

# Stack

```text
Next.js 16 (App Router, Turbopack)   node 22+
PostgreSQL 17
Drizzle ORM + node-postgres
```

No Redis, no broker, no separate cache. Adding infrastructure to a product a
shopkeeper self-hosts is a cost with no matching benefit at this scale.

---

# Development

```bash
npm install
npm run db:up          # postgres 17 in docker, published on 5433
cp .env.example .env
npm run db:reset       # drop, push schema, seed demo data
npm run dev
```

`DATABASE_URL` must use `127.0.0.1`, not `localhost`. The container publishes
IPv4 only; on Windows `localhost` resolves to `::1` first, and drizzle-kit then
hangs with no error message. This has cost time before — the `.env.example`
comment exists for that reason.

Port 5433 rather than 5432 avoids colliding with a local Postgres.

---

# Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5433/db` |
| `NODE_ENV` | yes | `production` in production |
| `SEED_OWNER_EMAIL` | no | Demo seed only |
| `SEED_OWNER_PASSWORD` | no | Demo seed only |
| `STORAGE_DRIVER` | future | `local` \| `s3` |
| `STORAGE_PATH` | future | Must be outside `public/` |
| `JOB_TICK_SECRET` | future | Guards `/api/jobs/tick` |

Never commit `.env`. The seed passwords exist for the demo dataset and must
not survive into a real installation.

---

# Production build

```bash
npm ci
npx drizzle-kit migrate     # versioned migrations, not push
npm run build
npm run start
```

**Use `migrate` in production, never `push`.** `push` diffs against the live
database and will happily propose destructive changes; in a non-TTY shell it
either fails or needs `--force`. Neither belongs near production data.

The build is dynamic almost everywhere — only `/_not-found` is static. That is
correct: every page depends on the session and the licence. `/setup` is
explicitly `force-dynamic` because whether the installation is configured is
runtime state; prerendering it would bake in a stale answer and require a
database at build time.

---

# Docker

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Run as non-root. Mount the storage volume once **30-file-storage.md** lands.

---

# Reverse proxy

Terminate TLS at the proxy. Required headers:

```nginx
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Real-IP         $remote_addr;
```

The audit log and login history record IP from `x-forwarded-for`. Without it
every entry reads as the proxy, which quietly destroys the value of both.

---

# First run

1. Deploy with an empty database.
2. Run migrations.
3. Seed the registry and plans — modules, features, permissions, plans. The
   demo business must **not** be seeded into a real installation.
4. Visit the root; it redirects to `/setup`.
5. Complete the wizard: business, owner account, licence.
6. `/setup` closes permanently.

`setupBusiness()` refuses if a business already exists, and the action checks
again on submit, so a stale form cannot create a second one.

---

# Upgrades

```bash
git pull
npm ci
npx drizzle-kit migrate
npm run build
# restart
```

Take a `pg_dump` first (**33-backup-recovery.md**). Registry changes need a
reseed of modules/features/permissions so new permissions become assignable —
the Owner gets them automatically, other roles need editing.

Downtime is a restart. Zero-downtime needs two app instances behind the proxy
and backward-compatible migrations; for a single-shop deployment a
thirty-second restart out of hours is the better trade.

---

# Scaling

In order of when you would actually need it:

**1. Vertical.** More CPU and RAM. Covers a single business almost
indefinitely.

**2. Postgres tuning.** `shared_buffers`, `work_mem`, connection pool size.
The default pool is fine until it is not; watch pool exhaustion
(**31-monitoring.md**).

**3. Read replica.** Point reports at it. Reports are the only genuinely heavy
read path, and they tolerate replication lag.

**4. Separate worker process.** Once the job queue exists, run it apart from
the web process so a slow send cannot affect a request.

Horizontal web scaling works — the app is stateless, sessions live in the
database — but it is rarely the bottleneck for one business.

---

# Hardening

* [ ] TLS everywhere; HSTS at the proxy
* [ ] Postgres not exposed to the internet
* [ ] Non-root container user
* [ ] Storage root outside `public/`
* [ ] Real secrets in `.env`, demo seed passwords removed
* [ ] Automated `pg_dump`, verified monthly
* [ ] Log aggregation or at minimum retained container logs
* [ ] `/api/v1/health` monitored externally

---

# Next Document

**35-performance.md**
