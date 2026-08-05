# 41-ai-assistant.md

# AI Assistant

Version: **1.0.0**

Status: **Not built.** Phase 5 in **22-roadmap.md**.

---

# What it is for

A natural-language surface over data the user can already see. "How much did we
sell last week?", "which products are below reorder level?", "why is the
Andheri store's margin down?"

What it is **not**: a way to reach data the user is not entitled to, and not a
way to change data.

---

# Two hard rules

**1. The assistant never widens authorization.**

It runs as the signed-in user, through the same pipeline as every other entry
point. A cashier asking "what's our gross profit?" gets the same refusal the
dashboard gives them — because the assistant calls the same guarded services,
not the database.

This is not a filter applied to results. It is the assistant having no other
way in.

**2. The assistant does not write.**

Read-only, at least until the read path has been in production long enough to
trust. An LLM that can create an invoice can create the wrong invoice, and
inventory and ledger correctness is the thing this product is actually for.

If writes ever happen, they go through a proposal → human confirmation →
existing service path. Never direct.

---

# Architecture

The important decision: **tools, not SQL.**

```text
User question
   ↓
LLM with a tool catalogue
   ↓
Tool call  →  existing guarded service  →  data
   ↓
LLM composes an answer, citing figures
```

Letting a model write SQL against the schema means giving it the database. Even
read-only, that bypasses row scoping, soft-delete filtering, licence checks and
permission checks — every invariant the service layer maintains.

Tools are narrow functions with typed inputs, each already guarded:

```ts
const tools = [
  {
    name: "get_sales_summary",
    description: "Revenue, transactions, gross profit and average bill for a period.",
    input: { range: "today|week|month|quarter|year", storeId: "uuid?" },
    permission: "dashboard.view_financial",
    run: (ctx, input) => salesSummary({ ctx, period: resolvePeriod(input.range, tz), storeId }),
  },
  { name: "get_low_stock", permission: "inventory.view", run: … },
  { name: "run_report", permission: "reports.view", run: … },   // any implemented report
  { name: "search", permission: null, run: … },                  // already permission-filtered
];
```

The tool catalogue offered to the model is **filtered by the caller's
permissions before the request is made**. The model cannot call what it was
never told about, and cannot call what it was told about without the guard
running anyway. Two layers, deliberately.

`run_report` is the highest-leverage tool: 35 reports already exist, already
guarded, already returning structured columns and rows.

---

# Privacy

For a self-hosted product this is the question customers will actually ask, so
the answer must be plain.

* **Nothing leaves the installation unless the business enables it.** The
  feature is off by default and gated on a licence feature.
* **No training on business data.** Use an API that contractually excludes it,
  and say which.
* **Minimise what is sent.** Send aggregates, not row dumps. "Revenue by day
  for 14 days" is 14 numbers; sending the invoice table is unnecessary and
  reckless.
* **Never send** customer contact details, employee records, password hashes or
  licence keys.
* **Local models are a first-class option.** An installation that cannot send
  data anywhere should still get the feature via a local model, at lower
  quality. Design the provider interface for that from the start.

Every assistant conversation is audited: who asked, which tools ran, what was
sent to the provider. Not the answer text — the *actions*.

---

# Being honest about numbers

The failure mode that would destroy trust is a confidently wrong figure.

Mitigations, in order of importance:

1. **Never let the model do arithmetic.** It calls a tool; the tool computes
   with `money.ts`. The model's job is to phrase the result, not derive it.
2. **Cite the source.** "₹12,891 (Sales Register, 1–31 July, all stores)" with
   a link to the report. The user can verify in one click.
3. **State the scope.** Which store, which period, which filters. An unqualified
   number is a wrong number.
4. **Refuse rather than guess.** No tool for the question means "I can't answer
   that", not an estimate.

---

# Interface

A panel, not a page — reachable from anywhere, aware of what is on screen so
"this month" and "this store" resolve sensibly.

Every response shows which tools ran. Not buried in a debug view — visible, so
"where did that come from?" is always answerable.

---

# Cost

Per-question cost is small; runaway loops are not. Cap tool calls per question
(5 is generous), cap questions per user per day, and show usage in the admin
panel. A feature that can spend money needs a visible meter.

---

# Build order

1. Provider interface, with a local-model implementation alongside a hosted one.
2. Tool: `run_report`. It alone answers a large share of real questions.
3. Permission-filtered tool catalogue.
4. Chat panel with tool-call transparency and citations.
5. Audit logging.
6. More tools, driven by what people actually ask.
7. Writes — only if the read path has earned it.

---

# Do not build this first

Phase 5 for a reason. An assistant over incomplete data is worse than no
assistant: it will be asked about the email that was never sent and the
scheduled report that never ran. Finish the job queue (**28**) before this.

---

# Next Document

**42-ai-recommendations.md**
