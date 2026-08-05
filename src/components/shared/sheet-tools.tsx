"use client";

import { useActionState, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Notice } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/actions";
import type { ImportReport } from "@/lib/excel";

import { importSheet } from "@/app/(app)/sheet-actions";

/**
 * Bulk spreadsheet controls for a list page.
 *
 * The template button comes first on purpose. An import that starts from the
 * generated template — with its example row, dropdowns and Notes sheet — almost
 * always succeeds; one that starts from the operator's own column order almost
 * always fails on the first upload, and that first failure is what makes people
 * give up on bulk entry and go back to typing.
 */
export function SheetTools({
  slug,
  label,
  canImport,
  canExport,
}: {
  slug: string;
  /** Entity name for the dialog copy, e.g. "products". */
  label: string;
  canImport: boolean;
  canExport: boolean;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, action] = useActionState<ActionResult<ImportReport>, FormData>(
    async (prev, form) => {
      const result = await importSheet(prev, form);
      if (result.ok) {
        toast.success(result.message ?? "Imported.");
        formRef.current?.reset();
      } else {
        toast.error(result.message ?? "Could not import the file.");
      }
      return result;
    },
    { ok: true },
  );

  const report = state.data;
  const failedRows = report?.rows.filter((r) => !r.ok) ?? [];

  if (!canImport && !canExport) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        {canImport ? (
          <Button asChild variant="ghost" size="sm">
            <a href={`/api/v1/sheets/${slug}?mode=template`}>
              <FileSpreadsheet className="size-3.5" />
              Template
            </a>
          </Button>
        ) : null}

        {canExport ? (
          <Button asChild variant="outline" size="sm">
            <a href={`/api/v1/sheets/${slug}?mode=export`}>
              <Download className="size-3.5" />
              Export
            </a>
          </Button>
        ) : null}

        {canImport ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Upload className="size-3.5" />
            Import
          </Button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import {label}</DialogTitle>
            <DialogDescription>
              Upload a filled-in .xlsx file. Every row is checked before anything
              is saved, so a file with mistakes changes nothing.
            </DialogDescription>
          </DialogHeader>

          <form ref={formRef} action={action} className="flex flex-col gap-3">
            <input type="hidden" name="slug" value={slug} />

            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xs border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:border-accent/60">
              <FileSpreadsheet className="size-6 text-muted-foreground" />
              <span className="text-sm font-medium">Choose an .xlsx file</span>
              <span className="text-[11px] text-muted-foreground">
                Start from the template if you have not already.
              </span>
              <input
                type="file"
                name="file"
                accept=".xlsx"
                required
                className="mt-1 text-xs"
              />
            </label>

            {report?.missingHeaders?.length ? (
              <Notice tone="danger" title="Columns are missing">
                The file has no{" "}
                <strong>{report.missingHeaders.join(", ")}</strong> column.
                Download the template and copy your data into it.
              </Notice>
            ) : state.ok === false && state.message ? (
              <Notice tone="danger" title="Nothing was imported">
                {state.message}
              </Notice>
            ) : null}

            {report?.unknownHeaders?.length ? (
              <Notice tone="info">
                Ignored column(s) the template does not use:{" "}
                {report.unknownHeaders.join(", ")}.
              </Notice>
            ) : null}

            {failedRows.length > 0 ? (
              <div className="max-h-60 overflow-y-auto rounded-xs border border-border scrollbar-thin">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="w-16 px-2 py-1.5 text-left font-semibold">
                        Row
                      </th>
                      <th className="px-2 py-1.5 text-left font-semibold">
                        Problem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {failedRows.map((r) => (
                      <tr key={r.row}>
                        <td className="px-2 py-1.5 font-mono text-muted-foreground">
                          {r.row}
                        </td>
                        <td className="px-2 py-1.5 text-destructive">
                          {r.errors.join(" ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {state.ok && report && report.imported > 0 ? (
              <Notice tone="success" title="Imported">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" />
                  {report.created} created · {report.updated} updated
                  {report.skipped > 0 ? ` · ${report.skipped} skipped` : ""}
                </span>
              </Notice>
            ) : null}

            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" />
              Rows are matched on their code or SKU, so importing the same file
              twice updates the records rather than duplicating them.
            </p>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
              <SubmitButton variant="accent" size="sm" pendingLabel="Importing…">
                Import
              </SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
