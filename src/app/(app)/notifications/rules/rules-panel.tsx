"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldRow,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/shared/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";

import {
  deleteNotificationRule,
  deleteNotificationTemplate,
  saveNotificationRule,
  saveNotificationTemplate,
  sendBroadcast,
} from "../admin-actions";

const CHANNELS = [
  { value: "in_app", label: "In-app" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "push", label: "Push" },
  { value: "webhook", label: "Webhook" },
];

const PRIORITIES = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "silent", label: "Silent" },
];

export interface RuleView {
  id: string;
  event: string;
  recipientRoles: string[];
  channels: string[];
  priority: string;
  isActive: boolean;
}

export interface TemplateView {
  id: string;
  event: string;
  channel: string;
  locale: string;
  subject: string;
  title: string;
  body: string;
  version: number;
  isActive: boolean;
}

export interface RoleOption {
  slug: string;
  name: string;
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                      */
/* -------------------------------------------------------------------------- */

export function RulesEditor({
  rules,
  roles,
  events,
}: {
  rules: RuleView[];
  roles: RoleOption[];
  events: string[];
}) {
  const [editing, setEditing] = useState<RuleView | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  // Close-on-success runs inside the action, not in an effect watching `state`.
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await saveNotificationRule(prev, form);
      if (result.ok && result.message) {
        toast.success(result.message);
        setEditing(null);
        setCreating(false);
      }
      return result;
    },
    { ok: true },
  );

  const open = creating || editing !== null;

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteNotificationRule(id);
      if (result.ok) toast.success(result.message ?? "Deleted.");
      else toast.error(result.message ?? "Could not delete the rule.");
    });
  }

  return (
    <section className="overflow-hidden rounded-xs border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Rules</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Who is told about an event, on which channels. An event with no rule
            goes in-app to whoever can act on it.
          </p>
        </div>
        {!open ? (
          <Button
            variant="accent"
            size="sm"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
          >
            Add rule
          </Button>
        ) : null}
      </header>

      {open ? (
        <form action={action} className="border-b border-border px-4 py-3">
          {editing ? (
            <input type="hidden" name="id" value={editing.id} />
          ) : null}

          {!state.ok ? <FormError message={state.message} /> : null}

          <FieldRow cols={3}>
            <Field
              label="Event"
              htmlFor="rule_event"
              hint="The event name published by a module."
              required
            >
              <Input
                id="rule_event"
                name="event"
                list="known-events"
                defaultValue={editing?.event ?? ""}
                placeholder="LowStock"
                required
              />
              <datalist id="known-events">
                {events.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </Field>
            <Field label="Priority" htmlFor="rule_priority">
              <select
                id="rule_priority"
                name="priority"
                defaultValue={editing?.priority ?? "medium"}
                className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Active" htmlFor="rule_is_active">
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox
                  id="rule_is_active"
                  name="is_active"
                  value="on"
                  defaultChecked={editing?.isActive ?? true}
                />
                Rule is in force
              </label>
            </Field>
          </FieldRow>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <span className="field-label">Channels</span>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {CHANNELS.map((c) => (
                  <label
                    key={c.value}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <Checkbox
                      name="channels"
                      value={c.value}
                      defaultChecked={
                        editing
                          ? editing.channels.includes(c.value)
                          : c.value === "in_app"
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <span className="field-label">Recipients by role</span>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {roles.map((r) => (
                  <label
                    key={r.slug}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <Checkbox
                      name="recipient_roles"
                      value={r.slug}
                      defaultChecked={editing?.recipientRoles.includes(r.slug)}
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
              Save rule
            </SubmitButton>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {rules.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No rules configured. Every event falls back to in-app delivery.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs font-medium">
                  {rule.event}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {rule.recipientRoles.length > 0
                    ? rule.recipientRoles.join(", ")
                    : "Fallback recipients"}
                  {" · "}
                  {rule.channels.join(", ")}
                </span>
              </span>
              <Badge
                variant={
                  rule.priority === "critical" ? "soft-destructive" : "soft-neutral"
                }
              >
                {rule.priority}
              </Badge>
              {!rule.isActive ? (
                <Badge variant="soft-warning">Inactive</Badge>
              ) : null}
              <span className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setCreating(false);
                    setEditing(rule);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => remove(rule.id)}
                >
                  Delete
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

export function TemplatesEditor({
  templates,
  events,
  canManage,
}: {
  templates: TemplateView[];
  events: string[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<TemplateView | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  // Close-on-success runs inside the action, not in an effect watching `state`.
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await saveNotificationTemplate(prev, form);
      if (result.ok && result.message) {
        toast.success(result.message);
        setEditing(null);
        setCreating(false);
      }
      return result;
    },
    { ok: true },
  );

  const open = creating || editing !== null;

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteNotificationTemplate(id);
      if (result.ok) toast.success(result.message ?? "Deleted.");
      else toast.error(result.message ?? "Could not delete the template.");
    });
  }

  return (
    <section className="overflow-hidden rounded-xs border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Templates</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Override the built-in wording for an event. Use{" "}
            <code>{"{{variable}}"}</code> placeholders; unknown ones are left
            visible rather than blanked.
          </p>
        </div>
        {canManage && !open ? (
          <Button
            variant="accent"
            size="sm"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
          >
            Add template
          </Button>
        ) : null}
      </header>

      {open ? (
        <form action={action} className="border-b border-border px-4 py-3">
          {editing ? (
            <input type="hidden" name="id" value={editing.id} />
          ) : null}

          {!state.ok ? <FormError message={state.message} /> : null}

          <FieldRow cols={4}>
            <Field label="Event" htmlFor="tpl_event" required>
              <Input
                id="tpl_event"
                name="event"
                /* Its own list, not the rules editor's `known-events`. Sharing
                   that id worked only because both panels happen to be on the
                   same page; the autocomplete would silently die the moment
                   this editor were used anywhere else. */
                list="template-known-events"
                defaultValue={editing?.event ?? ""}
                placeholder="LowStock"
                required
              />
              <datalist id="template-known-events">
                {events.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </Field>
            <Field label="Channel" htmlFor="tpl_channel">
              <select
                id="tpl_channel"
                name="channel"
                defaultValue={editing?.channel ?? "in_app"}
                className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              >
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Locale" htmlFor="tpl_locale">
              <Input
                id="tpl_locale"
                name="locale"
                defaultValue={editing?.locale ?? "en"}
                placeholder="en"
              />
            </Field>
            <Field label="Active" htmlFor="tpl_is_active">
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox
                  id="tpl_is_active"
                  name="is_active"
                  value="on"
                  defaultChecked={editing?.isActive ?? true}
                />
                In use
              </label>
            </Field>
          </FieldRow>

          <FieldRow cols={2}>
            <Field
              label="Subject"
              htmlFor="tpl_subject"
              hint="Email only."
            >
              <Input
                id="tpl_subject"
                name="subject"
                defaultValue={editing?.subject ?? ""}
                placeholder="Optional"
              />
            </Field>
            <Field label="Title" htmlFor="tpl_title" required>
              <Input
                id="tpl_title"
                name="title"
                defaultValue={editing?.title ?? ""}
                placeholder="{{product}} is running low"
                required
              />
            </Field>
          </FieldRow>

          <Field label="Body" htmlFor="tpl_body" required>
            <Textarea
              id="tpl_body"
              name="body"
              rows={3}
              defaultValue={editing?.body ?? ""}
              placeholder="Only {{quantity}} left at {{store}}. Reorder level is {{minimum}}."
              required
            />
          </Field>

          <div className="mt-3 flex items-center gap-2">
            <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
              Save template
            </SubmitButton>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {templates.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No templates. Notifications use the wording built into each module.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs font-medium">
                  {tpl.event}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {tpl.title}
                </span>
              </span>
              <Badge variant="soft-neutral">{tpl.channel}</Badge>
              <span className="text-[11px] text-muted-foreground">
                v{tpl.version} · {tpl.locale}
              </span>
              {!tpl.isActive ? (
                <Badge variant="soft-warning">Inactive</Badge>
              ) : null}
              {canManage ? (
                <span className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setCreating(false);
                      setEditing(tpl);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive"
                    disabled={pending}
                    onClick={() => remove(tpl.id)}
                  >
                    Delete
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Broadcast                                                                  */
/* -------------------------------------------------------------------------- */

export function BroadcastForm() {
  const [state, action] = useActionState<ActionResult, FormData>(sendBroadcast, {
    ok: true,
  });

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={action}>
      <FormSection
        title="Broadcast"
        description="Sends an in-app notification to every active user immediately. There is no undo, so check the wording first."
      >
        {!state.ok ? <FormError message={state.message} /> : null}

        <FieldRow cols={3}>
          <Field label="Title" htmlFor="bc_title" required>
            <Input
              id="bc_title"
              name="title"
              placeholder="Stock-take on Sunday"
              required
            />
          </Field>
          <Field label="Priority" htmlFor="bc_priority">
            <select
              id="bc_priority"
              name="priority"
              defaultValue="medium"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Link"
            htmlFor="bc_action_url"
            hint="Where the notification takes the reader."
          >
            <Input
              id="bc_action_url"
              name="action_url"
              placeholder="/inventory/counts"
            />
          </Field>
        </FieldRow>

        <Field label="Message" htmlFor="bc_body" required>
          <Textarea
            id="bc_body"
            name="body"
            rows={3}
            placeholder="The shop closes at 4pm on Sunday for the quarterly count."
            required
          />
        </Field>

        <div>
          <SubmitButton variant="accent" size="sm" pendingLabel="Sending…">
            Send broadcast
          </SubmitButton>
        </div>
      </FormSection>
    </form>
  );
}
