"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Submit button that reflects the enclosing form's pending state. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}

/** Labelled field wrapper with consistent spacing and error presentation. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string | string[];
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const messages = Array.isArray(error) ? error : error ? [error] : [];
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="text-xs font-medium text-foreground"
        >
          {label}
          {required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </label>
      ) : null}
      {children}
      {hint && messages.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
      {messages.map((m) => (
        <p key={m} className="text-[11px] font-medium text-destructive">
          {m}
        </p>
      ))}
    </div>
  );
}

export function FieldRow({
  children,
  cols = 2,
  className,
}: {
  children: React.ReactNode;
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Grouped section inside a long form. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-xs border border-border bg-card", className)}
    >
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <div className="flex flex-col gap-3 px-4 py-4">{children}</div>
    </section>
  );
}

/** Sticky footer for create/edit forms. */
export function FormActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Displays a server action's error message above a form. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-xs border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
      {message}
    </div>
  );
}
