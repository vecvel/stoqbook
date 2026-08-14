"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";

import { saveEmployee } from "./actions";

export interface EmployeeFormValues {
  id?: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  address: string;
  joiningDate: string;
  employmentType: string;
  departmentId: string;
  designationId: string;
  storeId: string;
  loginEnabled: boolean;
  status: string;
  roleIds: string[];
}

export const EMPTY_EMPLOYEE: EmployeeFormValues = {
  employeeCode: "",
  fullName: "",
  email: "",
  phone: "",
  gender: "",
  dateOfBirth: "",
  address: "",
  joiningDate: new Date().toISOString().slice(0, 10),
  employmentType: "permanent",
  departmentId: "",
  designationId: "",
  storeId: "",
  loginEnabled: true,
  status: "active",
  roleIds: [],
};

export interface RoleOption {
  id: string;
  name: string;
  description: string | null;
  isSuperAdmin: boolean;
}

export function EmployeeForm({
  values,
  roles,
  stores,
  departments,
  designations,
  passwordMinLength,
  canManageRoles,
  isSelf,
}: {
  values: EmployeeFormValues;
  roles: RoleOption[];
  stores: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  passwordMinLength: number;
  canManageRoles: boolean;
  isSelf: boolean;
}) {
  const [state, action] = useActionState<ActionResult<{ id: string }>, FormData>(
    saveEmployee,
    { ok: true },
  );

  const [loginEnabled, setLoginEnabled] = useState(values.loginEnabled);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    () => new Set(values.roleIds),
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const errors = state.errors ?? {};
  const isEdit = Boolean(values.id);

  function toggleRole(id: string) {
    setSelectedRoles((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {[...selectedRoles].map((id) => (
        <input key={id} type="hidden" name="role_ids" value={id} />
      ))}
      {!state.ok ? <FormError message={state.message} /> : null}

      <FormSection title="Personal">
        <FieldRow cols={2}>
          <Field
            label="Full name"
            htmlFor="full_name"
            error={errors.full_name}
            required
          >
            <Input
              id="full_name"
              name="full_name"
              defaultValue={values.fullName}
              placeholder="Priya Nair"
              required
              autoFocus={!isEdit}
            />
          </Field>
          <Field
            label="Employee code"
            htmlFor="employee_code"
            hint={isEdit ? undefined : "Generated automatically if left blank."}
          >
            <Input
              id="employee_code"
              name="employee_code"
              defaultValue={values.employeeCode}
              placeholder="EMP-000001"
              className="font-mono"
              readOnly={isEdit}
            />
          </Field>
        </FieldRow>

        <FieldRow cols={3}>
          <Field label="Email" htmlFor="email" error={errors.email} required>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={values.email}
              required
            />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={values.phone}
            />
          </Field>
          <Field label="Date of birth" htmlFor="date_of_birth">
            <Input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              defaultValue={values.dateOfBirth}
            />
          </Field>
        </FieldRow>

        <Field label="Address" htmlFor="address">
          <Textarea
            id="address"
            name="address"
            rows={2}
            defaultValue={values.address}
          />
        </Field>
      </FormSection>

      <FormSection title="Employment">
        <FieldRow cols={3}>
          <Field label="Joining date" htmlFor="joining_date">
            <Input
              id="joining_date"
              name="joining_date"
              type="date"
              defaultValue={values.joiningDate}
            />
          </Field>
          <Field label="Employment type" htmlFor="employment_type">
            <select
              id="employment_type"
              name="employment_type"
              defaultValue={values.employmentType}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="permanent">Permanent</option>
              <option value="contract">Contract</option>
              <option value="part_time">Part time</option>
              <option value="intern">Intern</option>
              <option value="temporary">Temporary</option>
            </select>
          </Field>
          <Field label="Primary store" htmlFor="store_id">
            <select
              id="store_id"
              name="store_id"
              defaultValue={values.storeId}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="">No store</option>
              {stores.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>

        <FieldRow cols={3}>
          <Field label="Department" htmlFor="department_id">
            <select
              id="department_id"
              name="department_id"
              defaultValue={values.departmentId}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Designation" htmlFor="designation_id">
            <select
              id="designation_id"
              name="designation_id"
              defaultValue={values.designationId}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="">None</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Status"
            htmlFor="status"
            hint={isSelf ? "You cannot change your own status." : undefined}
          >
            <select
              id="status"
              name="status"
              defaultValue={values.status}
              disabled={isSelf}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60"
            >
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="resigned">Resigned</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </FieldRow>
      </FormSection>

      <FormSection
        title="Portal access"
        description="Employees without portal access still exist for attendance and HR records."
      >
        <label className="flex items-center justify-between gap-3 rounded-xs border border-border px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium">
              Allow sign in to StoqBook
            </span>
            <span className="block text-xs text-muted-foreground">
              Counts towards your plan&apos;s seat limit.
            </span>
          </span>
          <Switch
            name="login_enabled"
            checked={loginEnabled}
            onCheckedChange={(v) => setLoginEnabled(Boolean(v))}
          />
        </label>

        {loginEnabled ? (
          <Field
            label={isEdit ? "Reset password" : "Password"}
            htmlFor="password"
            error={errors.password}
            hint={
              isEdit
                ? "Leave blank to keep the current password. Changing it signs the user out everywhere."
                : `At least ${passwordMinLength} characters, mixed case and a number.`
            }
            required={!isEdit}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder={isEdit ? "Unchanged" : ""}
              required={!isEdit}
            />
          </Field>
        ) : null}
      </FormSection>

      {canManageRoles ? (
        <FormSection
          title="Roles"
          description="Permissions come only from roles. Assigning several grants the union of them."
        >
          {selectedRoles.size === 0 ? (
            <p className="rounded-xs border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              With no role assigned this employee can sign in but will see
              nothing.
            </p>
          ) : null}

          <ul className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => (
              <li key={role.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xs border border-border px-3 py-2.5 transition-colors hover:bg-muted/50">
                  <Checkbox
                    checked={selectedRoles.has(role.id)}
                    onCheckedChange={() => toggleRole(role.id)}
                    className="mt-0.5"
                    aria-label={role.name}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium">{role.name}</span>
                      {role.isSuperAdmin ? (
                        <Badge variant="soft-accent">Full access</Badge>
                      ) : null}
                    </span>
                    {role.description ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {role.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </FormSection>
      ) : null}

      <FormActions>
        <Button asChild variant="outline" size="sm">
          <Link href={values.id ? `/employees/${values.id}` : "/employees"}>
            Cancel
          </Link>
        </Button>
        <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
          {isEdit ? "Save changes" : "Create employee"}
        </SubmitButton>
      </FormActions>
    </form>
  );
}
