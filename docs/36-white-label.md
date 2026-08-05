# 36-white-label.md

# White Label

Version: **1.0.0**

Status: **Partly built.** The theme is already fully tokenised; the branding
data is not yet configurable.

---

# What white label means here

Because StoqBook is **one business per installation**, white labelling is
simpler than in a multi-tenant SaaS: there is no per-request theme resolution
and no risk of one business seeing another's branding. The whole installation
wears one identity.

Two audiences:

1. **A business** putting its own name and logo on the product it runs.
2. **A reseller** shipping StoqBook as their own product.

The first is a settings problem. The second additionally needs the product
name and support links to change.

---

# What already works

Every colour is a CSS variable defined once in `globals.css` and consumed
through Tailwind tokens. Nothing in the codebase hard-codes a hex value.

```css
--bark:      /* #4B352A */   sidebar, primary surfaces
--copper:    /* #CA7842 */   accent, primary actions
--sage:      /* #B2CD9C */   success, positive states
--parchment: /* #F0F2BD */   light surfaces
```

Changing those four values re-skins the entire application. Radii are equally
constrained — only `rounded-xs` (2px) and `rounded-full` exist anywhere — so a
reskin cannot accidentally produce an inconsistent shape language.

The organisation profile (`organizations`) already holds `name`, `legal_name`,
`logo_url`, address, tax number and registration number, and those already
appear on documents.

---

# What is missing

**1. Branding settings.** Declare them in the `settings` module so they appear
on the settings page like everything else:

```ts
{ key: "branding.product_name",   label: "Product name",   type: "text", scope: "business", default: "StoqBook" },
{ key: "branding.primary_color",  label: "Primary colour", type: "text", scope: "business", default: "#4B352A" },
{ key: "branding.accent_color",   label: "Accent colour",  type: "text", scope: "business", default: "#CA7842" },
{ key: "branding.logo_url",       label: "Logo",           type: "text", scope: "business", default: "" },
{ key: "branding.favicon_url",    label: "Favicon",        type: "text", scope: "business", default: "" },
{ key: "branding.support_url",    label: "Support link",   type: "text", scope: "business", default: "" },
```

**2. Runtime theme injection.** The root layout reads the branding settings and
emits an override block:

```tsx
<style>{`:root{--bark:${h(primary)};--copper:${h(accent)}}`}</style>
```

Values must be validated as hex before injection — an unvalidated colour
setting is a stylesheet injection vector. Parse to `#RRGGBB` or discard.

**3. Product name in place of the literal.** `"StoqBook"` appears in the
sidebar, the auth layout, page titles and the licence screen. Those become
reads of `branding.product_name`, defaulting to `StoqBook`.

**4. Logo instead of the "S" mark.** The brand block already has the right
shape; it needs to render an image when one is configured.

---

# Document branding

Invoices and receipts are the part customers actually see, and they matter
more than the admin UI.

Already used: organisation name, address, tax number, `sales.receipt_footer`.

Should be added: logo on the invoice header, and a configurable invoice
footer distinct from the receipt footer — a thermal receipt and an A4 invoice
want different wording.

---

# Emails

Once outbound email exists (**28-job-queue.md**), templates need the same
treatment: logo, product name, colours, and a reply-to that is the business,
not the vendor. A branded product that sends mail signed by someone else
undoes the whole exercise.

---

# What stays fixed

Be explicit about the limits, so expectations are set:

* **Layout.** The information architecture is the product. White labelling
  changes identity, not structure.
* **The radius rule.** `rounded-xs` and `rounded-full` only. This is a design
  invariant, not a default.
* **No gradients.** Same.
* **Semantic colour meaning.** Success stays green-ish, danger stays red-ish. A
  reseller may pick the hue; they may not make danger look like success.

---

# Reseller considerations

**Licence key.** The vendor still issues it. A reseller reselling under their
own brand needs their own key issuance, which is out of scope for the
installation itself.

**Support links.** `branding.support_url` replaces vendor links.

**Attribution.** Whether "Powered by StoqBook" can be removed is a licensing
decision, not a technical one. If it is conditional, gate it on a feature
(`branding.remove_attribution`) so the licence controls it like everything
else.

---

# Build order

1. Branding settings in the registry.
2. Hex validation helper.
3. Theme injection in the root layout.
4. Product name reads.
5. Logo rendering — needs **30-file-storage.md** for upload; a URL field works
   before then.
6. Document branding.
7. Email templates, with the queue.

---

# Next Document

**37-multi-language.md**
