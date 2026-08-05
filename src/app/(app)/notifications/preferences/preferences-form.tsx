"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldRow,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/shared/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions";

import { saveMyNotificationPreferences } from "../preference-actions";

const CHANNELS = [
  { value: "in_app", label: "In-app" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
];

export function NotificationPreferencesForm({
  enabled,
  channels,
  quietFrom,
  quietTo,
  businessQuiet,
}: {
  enabled: boolean;
  channels: string[];
  quietFrom: string;
  quietTo: string;
  businessQuiet: string | null;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    saveMyNotificationPreferences,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={action}>
      <FormSection
        title="My notifications"
        description="These apply to you alone. Critical notifications are always delivered, whatever is set here."
      >
        {!state.ok ? <FormError message={state.message} /> : null}

        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="enabled" value="on" defaultChecked={enabled} />
          Send me notifications
        </label>

        <div>
          <span className="field-label">Channels</span>
          <div className="mt-1.5 flex flex-wrap gap-4">
            {CHANNELS.map((c) => (
              <label
                key={c.value}
                className="flex cursor-pointer items-center gap-1.5 text-sm"
              >
                <Checkbox
                  name="channels"
                  value={c.value}
                  defaultChecked={
                    channels.length === 0
                      ? c.value === "in_app"
                      : channels.includes(c.value)
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            A channel still has to be switched on for the business and included
            in the rule for the event.
          </p>
        </div>

        <FieldRow cols={2}>
          <Field
            label="Quiet hours from"
            htmlFor="quiet_from"
            hint="24-hour clock, e.g. 22:00. Blank means none."
          >
            <Input
              id="quiet_from"
              name="quiet_from"
              type="time"
              defaultValue={quietFrom}
            />
          </Field>
          <Field label="Quiet hours to" htmlFor="quiet_to">
            <Input
              id="quiet_to"
              name="quiet_to"
              type="time"
              defaultValue={quietTo}
            />
          </Field>
        </FieldRow>

        {businessQuiet ? (
          <p className="text-xs text-muted-foreground">
            The business already holds non-critical notifications {businessQuiet}.
            Your window applies on top of that.
          </p>
        ) : null}

        <div>
          <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
            Save preferences
          </SubmitButton>
        </div>
      </FormSection>
    </form>
  );
}
