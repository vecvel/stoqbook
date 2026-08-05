import { requirePermission } from "@/lib/authz/guard";
import { failFrom } from "@/lib/api/response";
import { auditEvent } from "@/lib/services/audit";
import { buildBackup } from "@/lib/services/backup";

/** Downloads a JSON snapshot of every row this business owns. */
export async function GET() {
  try {
    const ctx = await requirePermission("settings.backup", { onDenied: "throw",
      feature: "settings.backup",
    });

    const takenAt = new Date();
    const backup = await buildBackup(ctx, takenAt);

    // Taking a copy of the whole dataset is worth recording.
    await auditEvent(ctx, {
      event: "BackupDownloaded",
      moduleSlug: "settings",
      entityType: "backup",
      summary: `Backup taken (${Object.keys(backup.tables).length} tables)`,
    });

    const filename = `stoqbook-${backup.businessSlug}-${takenAt
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-")}.json`;

    return new Response(JSON.stringify(backup), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return failFrom(error);
  }
}
