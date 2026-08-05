"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive, CheckCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import {
  archiveNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "./actions";

export function MarkAllRead() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsRead();
          if (result.ok) toast.success(result.message ?? "Done.");
        })
      }
    >
      <CheckCheck className="size-3.5" />
      Mark all read
    </Button>
  );
}

/**
 * A row that marks itself read on interaction, then follows its deep link if it
 * has one — the behaviour a notification inbox is expected to have.
 */
export function NotificationRow({
  id,
  isRead,
  actionUrl,
  children,
}: {
  id: string;
  isRead: boolean;
  actionUrl: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      if (!isRead) await markNotificationRead(id);
      if (actionUrl) router.push(actionUrl);
    });
  }

  return (
    <div className="flex items-start gap-2 px-4 py-3">
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className="min-w-0 flex-1 text-left"
      >
        {children}
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={pending}
        aria-label="Archive notification"
        title="Archive"
        onClick={() =>
          startTransition(async () => {
            const result = await archiveNotification(id);
            if (!result.ok) toast.error(result.message ?? "Could not archive.");
          })
        }
      >
        <Archive />
      </Button>
    </div>
  );
}
