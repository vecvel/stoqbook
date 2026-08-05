# 37-multi-language.md

# Multi-Language

Version: **1.0.0**

Status: **Not built.** The application is English-only, with one exception:
notification templates already carry a `locale` column.

Target languages from **16-notifications.md**: English, Hindi, Assamese,
Arabic. Arabic makes this a right-to-left problem as well as a translation
problem, which is a much bigger change than it first appears.

---

# Four separable problems

Conflating these is the usual reason localisation projects stall.

| Problem | Nature | Difficulty |
|---|---|---|
| UI strings | Extract and translate | Large but mechanical |
| Formatting — dates, numbers, money | Already centralised | Small |
| Business data — product names | Per-record translation | Medium, optional |
| RTL layout | Every layout decision | Large, and not mechanical |

Ship them in that order. Formatting first, because it is nearly free.

---

# Formatting (nearly done)

Everything already routes through `src/lib/format.ts` and
`src/lib/timezone.ts`. No component calls `toLocaleString` directly. That means
locale-aware formatting is a change in **one file**:

```ts
export function formatMoney(value, { currency, locale = "en-IN" }) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}
```

Two things must not change with locale:

* **Stored values.** Money is `numeric(18,4)`; arithmetic stays on scaled
  BigInt regardless of display.
* **Document numbers.** `INV-2026-000001` is an identifier, not a formatted
  number. Never localise digits in it.

---

# UI strings

The honest assessment: there are several thousand strings across pages,
components, actions and error messages, and none are extracted. This is the
bulk of the work.

Approach:

```text
src/locales/
├── en.json      source of truth
├── hi.json
├── as.json
└── ar.json
```

```ts
const t = await getTranslations(locale);
<PageHeader title={t("customers.title")} description={t("customers.subtitle", { count })} />
```

Rules:

* **English is the source.** Keys are never translated at the call site.
* **Never concatenate.** `t("orders.count", { n })` with the plural handled by
  `Intl.PluralRules` — not `` `${n} ` + t("orders") ``, which is unfixable in
  languages with case.
* **Interpolate, never build sentences from fragments.** Word order differs.
* **A missing key renders the key**, visibly. Silent fallback to English hides
  gaps until a customer finds them.

The registry is a special case: module names, feature names, permission names
and setting labels are data. Translate by key
(`registry.products.name`), falling back to the declared English string.

---

# Business data

Product names, category names and unit names are business content, not UI
copy. Most businesses will not want them translated; some will.

If needed, a sidecar table rather than columns on every entity:

```sql
create table translations (
  tenant_id   uuid not null,
  entity_type text not null,      -- 'product'
  entity_id   uuid not null,
  locale      text not null,
  field       text not null,      -- 'name'
  value       text not null,
  primary key (tenant_id, entity_type, entity_id, locale, field)
);
```

Fall back to the base record when no row exists. Do **not** translate SKUs,
codes or document numbers.

---

# Right-to-left

The part that is genuinely hard, and the reason Arabic should not be promised
casually.

Tailwind logical properties handle most of it, but only if used consistently:

```text
ml-4  →  ms-4        margin-inline-start
pr-2  →  pe-2        padding-inline-end
left-0 → start-0
text-left → text-start
```

The current codebase uses physical properties throughout. Converting is
mechanical but touches nearly every component, and the conversion must be
complete — a single stray `ml-4` in RTL is immediately visible.

What logical properties do **not** solve:

* Icons implying direction — chevrons, arrows, the sidebar collapse control.
* Charts. Axis direction and legend placement need explicit handling.
* Tables. Column order reverses; numeric columns still align to the number.
* The POS layout, which is spatially designed and needs deliberate mirroring.

Set `dir` on `<html>` from the locale and test the whole application, not a
sample. RTL bugs cluster in exactly the screens nobody re-checks.

---

# Numerals

Hindi and Arabic can use different numeral systems. For a retail product,
**keep Western Arabic numerals (0–9) for money and quantities** unless a
business explicitly asks otherwise. Staff read prices faster in the numerals
they were trained on, and mixed numerals on a receipt cause errors.

---

# Notification templates

The only part already designed for this. `notification_templates` has
`locale`, and the resolver picks by `(event, channel)`. Extend it to
`(event, channel, locale)`, falling back to `en`, and choose the locale from
the recipient's preference rather than the business default.

---

# Build order

1. Locale setting; `Intl` wired through `format.ts`. Small, immediate value.
2. Extract strings to `en.json` with a lint rule against literals in JSX.
3. Add `hi` — a second LTR language proves the extraction without RTL.
4. Locale-aware notification templates.
5. Business-data translations, if asked for.
6. RTL: convert to logical properties, then Arabic. Treat as its own project.

Steps 1–4 are worth doing regardless. Step 6 should not begin until someone is
actually paying for Arabic.

---

# Next Document

**38-public-api.md**
