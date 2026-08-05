import "server-only";

import ExcelJS from "exceljs";

import type { ColumnSpec, SheetSpec } from "./types";

/**
 * Workbook construction and parsing (shared by templates, exports and imports).
 *
 * Real `.xlsx`, not CSV renamed. A retail operator's bulk edit happens in Excel
 * or LibreOffice with dropdowns and number formats intact; CSV loses all of that
 * and mangles leading zeros on barcodes, which is exactly the data that must not
 * change.
 */

const BRAND = {
  /* The palette, without the leading # that ARGB does not take. Kept here
     rather than read from CSS because a workbook is not a web page. */
  header: "FF4B352A",
  headerText: "FFF0F2BD",
  accent: "FFCA7842",
  sample: "FFF0F2BD",
  border: "FFD8D2CC",
};

const NUMBER_FORMATS: Record<string, string> = {
  money: "#,##0.00",
  quantity: "#,##0.###",
  number: "#,##0.##",
  integer: "#,##0",
  date: "yyyy-mm-dd",
};

function applyHeaderRow(sheet: ExcelJS.Worksheet, columns: ColumnSpec[]) {
  const header = sheet.getRow(1);
  header.values = columns.map((c) => c.header);
  header.height = 22;

  columns.forEach((column, i) => {
    const cell = header.getCell(i + 1);
    cell.font = { bold: true, color: { argb: BRAND.headerText }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND.header },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    // A required column is marked in the cell itself; a legend nobody reads is
    // no use when the file is opened three weeks later.
    if (column.required) {
      cell.value = `${column.header} *`;
    }
    sheet.getColumn(i + 1).width = column.width ?? Math.max(14, column.header.length + 4);

    const format = NUMBER_FORMATS[column.type];
    if (format) sheet.getColumn(i + 1).numFmt = format;
  });

  header.commit?.();
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/**
 * Builds the downloadable template: headers, one example row, dropdowns for
 * enumerated columns, and a Notes sheet explaining every field.
 */
export async function buildTemplate(
  spec: SheetSpec,
  references: Record<string, string[]> = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StoqBook";
  wb.created = new Date(0); // Deterministic: the same spec yields the same file.

  const sheet = wb.addWorksheet(spec.name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  applyHeaderRow(sheet, spec.columns);

  /* One example row, visibly tinted and labelled in the Notes sheet as safe to
     delete. Without an example, every operator's first attempt fails on date or
     boolean formatting. */
  const example = sheet.getRow(2);
  example.values = spec.columns.map((c) => c.example ?? "");
  spec.columns.forEach((_, i) => {
    example.getCell(i + 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND.sample },
    };
  });

  /* Dropdowns down a generous number of rows. Excel needs an explicit range, so
     this is a bound rather than "the whole column". */
  const VALIDATION_ROWS = 2000;
  spec.columns.forEach((column, i) => {
    const values =
      column.type === "enum"
        ? column.options
        : column.type === "boolean"
          ? ["Yes", "No"]
          : column.type === "lookup" && column.lookup
            ? references[column.lookup.name]
            : undefined;

    if (!values?.length) return;

    // Excel rejects a formula list longer than 255 characters; past that the
    // dropdown is dropped and the Notes sheet carries the values instead.
    const formula = `"${values.join(",")}"`;
    if (formula.length > 255) return;

    const letter = sheet.getColumn(i + 1).letter;
    for (let row = 2; row <= VALIDATION_ROWS; row += 1) {
      sheet.getCell(`${letter}${row}`).dataValidation = {
        type: "list",
        allowBlank: !column.required,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: "Not an allowed value",
        error: `Choose one of: ${values.slice(0, 12).join(", ")}${values.length > 12 ? "…" : ""}`,
      };
    }
  });

  /* ---- Notes sheet ---------------------------------------------------- */
  const notes = wb.addWorksheet("Notes");
  notes.getColumn(1).width = 28;
  notes.getColumn(2).width = 14;
  notes.getColumn(3).width = 12;
  notes.getColumn(4).width = 80;

  const title = notes.addRow([`${spec.name} import template`]);
  title.font = { bold: true, size: 14, color: { argb: BRAND.header } };
  notes.addRow([spec.description]);
  notes.addRow([]);
  notes.addRow([
    "Row 2 of the data sheet is an example. Delete it before importing, or leave it and it will be imported.",
  ]);
  notes.addRow(["Columns marked * are required."]);
  for (const note of spec.notes ?? []) notes.addRow([note]);
  notes.addRow([]);

  const head = notes.addRow(["Column", "Type", "Required", "Notes"]);
  head.font = { bold: true, color: { argb: BRAND.headerText } };
  head.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND.header },
    };
  });

  for (const column of spec.columns) {
    const allowed =
      column.type === "enum"
        ? column.options?.join(", ")
        : column.type === "boolean"
          ? "Yes / No"
          : column.type === "lookup" && column.lookup
            ? (references[column.lookup.name] ?? []).join(", ") || "no records yet"
            : "";

    const help = [column.help, allowed ? `Allowed: ${allowed}` : ""]
      .filter(Boolean)
      .join(" ");

    const row = notes.addRow([
      column.header,
      column.type,
      column.required ? "Yes" : "No",
      help,
    ]);
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    row.getCell(1).font = { bold: true };
  }

  return toBuffer(await wb.xlsx.writeBuffer());
}

/**
 * exceljs returns its own `Buffer` shape from `writeBuffer()`, which does not
 * line up with Node's under `@types/node`. Copying through a `Uint8Array` view is
 * the honest conversion rather than a double cast that hides a real mismatch.
 */
function toBuffer(data: ExcelJS.Buffer): Buffer {
  return Buffer.from(data as unknown as ArrayBuffer);
}

/** Builds an export workbook from already-shaped rows. */
export async function buildExport(
  spec: SheetSpec,
  rows: Record<string, unknown>[],
  meta: { businessName: string; generatedBy: string; generatedAt: Date },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StoqBook";

  const sheet = wb.addWorksheet(spec.name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  applyHeaderRow(sheet, spec.columns);

  for (const row of rows) {
    sheet.addRow(
      spec.columns.map((c) => {
        const value = row[c.key];
        if (value === null || value === undefined) return "";
        if (c.type === "boolean") return value ? "Yes" : "No";
        if (c.type === "money" || c.type === "quantity" || c.type === "number") {
          const n = Number(value);
          return Number.isFinite(n) ? n : "";
        }
        if (c.type === "integer") {
          const n = Number(value);
          return Number.isFinite(n) ? Math.trunc(n) : "";
        }
        if (c.type === "date") {
          return value instanceof Date ? value : new Date(String(value));
        }
        return String(value);
      }),
    );
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: spec.columns.length },
  };

  /* Provenance sheet. An exported figure that turns up in a meeting three months
     later needs to say when it was taken and by whom, or nobody can tell whether
     it is still true. */
  const about = wb.addWorksheet("About");
  about.getColumn(1).width = 22;
  about.getColumn(2).width = 46;
  about.addRow(["Business", meta.businessName]);
  about.addRow(["Export", spec.name]);
  about.addRow(["Rows", rows.length]);
  about.addRow(["Generated at", meta.generatedAt.toISOString()]);
  about.addRow(["Generated by", meta.generatedBy]);
  about.getColumn(1).font = { bold: true };

  return toBuffer(await wb.xlsx.writeBuffer());
}

export interface ParsedSheet {
  /** Header text as found, in column order. */
  headers: string[];
  /** One entry per data row: the raw cell values keyed by column key. */
  rows: { row: number; values: Record<string, unknown> }[];
  /** Headers in the file that the spec does not declare. */
  unknownHeaders: string[];
  /** Required spec columns absent from the file. */
  missingHeaders: string[];
}

/**
 * Reads an uploaded workbook against a spec.
 *
 * Headers are matched case-insensitively and ignore the ` *` required marker and
 * surrounding whitespace, so a file round-tripped through Excel or Google Sheets
 * still lines up. Column *order* is not assumed — operators reorder columns.
 */
export async function parseWorkbook(
  spec: SheetSpec,
  data: ArrayBuffer,
): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);

  // The spec's own sheet if present, else the first one that is not Notes.
  const sheet =
    wb.getWorksheet(spec.name) ??
    wb.worksheets.find((w) => w.name !== "Notes" && w.name !== "About") ??
    wb.worksheets[0];

  if (!sheet) {
    return { headers: [], rows: [], unknownHeaders: [], missingHeaders: [] };
  }

  const normalise = (value: unknown) =>
    String(value ?? "")
      .replace(/\*/g, "")
      .trim()
      .toLowerCase();

  const byHeader = new Map(spec.columns.map((c) => [normalise(c.header), c]));

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  const columnAt = new Map<number, ColumnSpec>();
  const unknownHeaders: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = String(cell.value ?? "").trim();
    headers.push(text);
    const match = byHeader.get(normalise(text));
    if (match) columnAt.set(colNumber, match);
    else if (text) unknownHeaders.push(text);
  });

  const found = new Set([...columnAt.values()].map((c) => c.key));
  const missingHeaders = spec.columns
    .filter((c) => c.required && !found.has(c.key))
    .map((c) => c.header);

  const rows: { row: number; values: Record<string, unknown> }[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const values: Record<string, unknown> = {};
    let hasAny = false;

    for (const [colNumber, column] of columnAt) {
      const cell = row.getCell(colNumber);
      let value: unknown = cell.value;

      // Formula cells carry {formula, result}; a hyperlink carries {text}; and
      // styled text arrives as a richText run list.
      if (value && typeof value === "object") {
        if ("result" in value) value = (value as { result: unknown }).result;
        else if ("text" in value) value = (value as { text: unknown }).text;
        else if ("richText" in value) {
          value = (value as { richText: { text: string }[] }).richText
            .map((r) => r.text)
            .join("");
        }
      }

      if (value !== null && value !== undefined && String(value).trim() !== "") {
        hasAny = true;
      }
      values[column.key] = value;
    }

    // A blank row in the middle of a sheet is formatting, not data.
    if (hasAny) rows.push({ row: rowNumber, values });
  });

  return { headers, rows, unknownHeaders, missingHeaders };
}
