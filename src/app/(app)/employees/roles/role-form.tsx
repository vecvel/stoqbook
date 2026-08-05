"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Icon } from "@/components/layout/icon";
import {
  Field,
  FieldRow,
  FormActions,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/shared/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

import { saveRole } from "../actions";

export interface PermissionOption {
  key: string;
  action: string;
  name: string;
  description?: string;
  /** Feature entitlement this permission depends on. */
  feature?: string;
  /** False when the tenant's plan does not include the feature. */
  available: boolean;
}

export interface PermissionGroupView {
  slug: string;
  name: string;
  icon: string;
  /** False when the module is not enabled by the licence. */
  moduleEnabled: boolean;
  permissions: PermissionOption[];
}

export function RoleForm({
  role,
  groups,
}: {
  role: {
    id?: string;
    name: string;
    description: string;
    isOwner: boolean;
    isSystem: boolean;
    granted: string[];
  };
  groups: PermissionGroupView[];
}) {
  const [state, action] = useActionState<ActionResult<{ id: string }>, FormData>(
    saveRole,
    { ok: true },
  );

  const [granted, setGranted] = useState<Set<string>>(
    () => new Set(role.granted),
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const errors = state.errors ?? {};
  const isEdit = Boolean(role.id);

  const selectable = useMemo(
    () =>
      groups.flatMap((g) =>
        g.moduleEnabled
          ? g.permissions.filter((p) => p.available).map((p) => p.key)
          : [],
      ),
    [groups],
  );

  function toggle(key: string) {
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(group: PermissionGroupView, on: boolean) {
    setGranted((current) => {
      const next = new Set(current);
      for (const permission of group.permissions) {
        if (!permission.available) continue;
        if (on) next.add(permission.key);
        else next.delete(permission.key);
      }
      return next;
    });
  }

  const grantedCount = [...granted].filter((k) => selectable.includes(k)).length;

  return (
    <form action={action} className="flex flex-col gap-4">
      {role.id ? <input type="hidden" name="id" value={role.id} /> : null}
      {!state.ok ? <FormError message={state.message} /> : null}

      <FormSection title="Role">
        <FieldRow cols={2}>
          <Field label="Role name" htmlFor="name" error={errors.name} required>
            <Input
              id="name"
              name="name"
              defaultValue={role.name}
              placeholder="Regional Manager"
              required
              autoFocus={!isEdit}
            />
          </Field>
          <Field label="Description" htmlFor="description">
            <Input
              id="description"
              name="description"
              defaultValue={role.description}
              placeholder="What this role is responsible for"
            />
          </Field>
        </FieldRow>

        {role.isOwner ? (
          <p className="rounded-xs border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
            The Owner role always holds every tenant permission, including those
            added by future modules. Its permission list is derived at request
            time and cannot be edited.
          </p>
        ) : role.isSystem ? (
          <p className="rounded-xs border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            This role was provisioned automatically. You can change its
            permissions freely — it will not be reset.
          </p>
        ) : null}
      </FormSection>

      {!role.isOwner ? (
        <>
          {/* Hidden inputs carry the selection; the checkboxes are display only. */}
          {[...granted].map((key) => (
            <input key={key} type="hidden" name="permissions" value={key} />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-border bg-card px-4 py-3">
            <div className="text-sm">
              <span className="font-semibold">{grantedCount}</span>
              <span className="text-muted-foreground">
                {" "}
                of {selectable.length} available permissions granted
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setGranted(new Set(selectable))}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setGranted(new Set())}
              >
                Clear all
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {groups.map((group) => {
              const availablePermissions = group.permissions.filter(
                (p) => p.available,
              );
              const allOn =
                availablePermissions.length > 0 &&
                availablePermissions.every((p) => granted.has(p.key));

              return (
                <section
                  key={group.slug}
                  className={cn(
                    "rounded-xs border border-border bg-card",
                    !group.moduleEnabled && "opacity-60",
                  )}
                >
                  <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon
                        name={group.icon}
                        className="size-3.5 text-muted-foreground"
                      />
                      <h3 className="truncate text-sm font-semibold">
                        {group.name}
                      </h3>
                      {!group.moduleEnabled ? (
                        <Badge variant="soft-neutral">Not licensed</Badge>
                      ) : null}
                    </div>
                    {group.moduleEnabled && availablePermissions.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggleGroup(group, !allOn)}
                        className="shrink-0 text-[11px] font-medium text-accent hover:underline"
                      >
                        {allOn ? "None" : "All"}
                      </button>
                    ) : null}
                  </header>

                  <ul className="divide-y divide-border">
                    {group.permissions.map((permission) => {
                      const disabled = !group.moduleEnabled || !permission.available;
                      return (
                        <li key={permission.key}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-2.5 px-3.5 py-2 transition-colors",
                              disabled
                                ? "cursor-not-allowed opacity-50"
                                : "hover:bg-muted/50",
                            )}
                          >
                            <Checkbox
                              checked={granted.has(permission.key)}
                              onCheckedChange={() =>
                                !disabled && toggle(permission.key)
                              }
                              disabled={disabled}
                              className="mt-0.5"
                              aria-label={permission.name}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm">
                                {permission.name}
                              </span>
                              <span className="block font-mono text-[10px] text-muted-foreground">
                                {permission.key}
                              </span>
                              {permission.description ? (
                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                  {permission.description}
                                </span>
                              ) : null}
                              {!permission.available && permission.feature ? (
                                <span className="mt-0.5 block text-[11px] text-warning">
                                  Requires the {permission.feature} feature
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      ) : null}

      <FormActions>
        <Button asChild variant="outline" size="sm">
          <Link href="/employees/roles">Cancel</Link>
        </Button>
        <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
          {isEdit ? "Save role" : "Create role"}
        </SubmitButton>
      </FormActions>
    </form>
  );
}
