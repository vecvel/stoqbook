import type { Metadata } from "next";
import { desc } from "drizzle-orm";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { requireAdmin } from "@/lib/authz/guard";
import { formatDate, truncate } from "@/lib/format";

import { deleteAnnouncement, saveAnnouncement } from "../actions";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  await requireAdmin("admin.announcement_manage");

  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      severity: announcements.severity,
      startsAt: announcements.starts_at,
      endsAt: announcements.ends_at,
      isActive: announcements.is_active,
    })
    .from(announcements)
    .orderBy(desc(announcements.created_at));

  const crudRows: CrudRow[] = rows.map((row) => ({
    id: row.id,
    values: {
      title: row.title,
      body: row.body,
      severity: row.severity,
      // Carried through the form so editing does not reset the start date.
      starts_at: row.startsAt.toISOString().slice(0, 10),
      ends_at: row.endsAt ? row.endsAt.toISOString().slice(0, 10) : "",
      is_active: row.isActive,
    },
    cells: {
      title: (
        <div>
          <div className="font-medium">{row.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {truncate(row.body, 80)}
          </div>
        </div>
      ),
      severity: (
        <StatusBadge
          status={
            row.severity === "critical"
              ? "critical"
              : row.severity === "warning"
                ? "high"
                : "medium"
          }
          label={row.severity}
        />
      ),
      window: (
        <span className="text-muted-foreground">
          {formatDate(row.startsAt)}
          {row.endsAt ? ` → ${formatDate(row.endsAt)}` : " → open"}
        </span>
      ),
      status: <StatusBadge status={row.isActive ? "active" : "inactive"} />,
    },
  }));

  return (
    <div className="page">
      <PageHeader
        title="Announcements"
        description="Post notices, reminders and advisories to everyone signed in to the business."
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Announcements" },
        ]}
      />

      <CrudPanel
        title="Announcements"
        description={`${rows.length} announcement${rows.length === 1 ? "" : "s"}`}
        addLabel="New announcement"
        emptyMessage="No announcements published."
        columns={[
          { key: "title", label: "Announcement" },
          { key: "severity", label: "Severity" },
          { key: "window", label: "Active window" },
          { key: "status", label: "Status", align: "right" },
        ]}
        rows={crudRows}
        fields={[
          {
            name: "title",
            label: "Title",
            placeholder: "Stock count this Sunday",
            required: true,
          },
          {
            name: "body",
            label: "Message",
            placeholder: "What the team needs to know",
            required: true,
          },
          {
            name: "severity",
            label: "Severity",
            type: "select",
            options: [
              { value: "info", label: "Information" },
              { value: "warning", label: "Warning" },
              { value: "critical", label: "Critical" },
            ],
          },
          {
            name: "starts_at",
            label: "Starts on",
            hint: "Blank shows it immediately.",
          },
          {
            name: "ends_at",
            label: "Ends on",
            hint: "Blank keeps it open-ended.",
          },
          { name: "is_active", label: "Active", type: "boolean" },
        ]}
        saveAction={saveAnnouncement}
        deleteAction={deleteAnnouncement}
        canWrite
        canDelete
      />
    </div>
  );
}
