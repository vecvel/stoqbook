import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import {
  EmptyRow,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { loginHistory, sessions, users } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { currencySymbol, formatDateTime, humanise } from "@/lib/format";

import { buildSettingGroups } from "../settings-data";
import { SettingsPanel } from "../settings-panel";

export const metadata: Metadata = { title: "Security" };

const OUTCOME_TONES: Record<string, "soft-success" | "soft-destructive" | "soft-warning"> = {
  success: "soft-success",
  invalid_password: "soft-destructive",
  unknown_user: "soft-destructive",
  locked: "soft-warning",
  suspended: "soft-warning",
  login_disabled: "soft-warning",
  business_suspended: "soft-destructive",
  business_archived: "soft-destructive",
  inactive: "soft-warning",
};

export default async function SecurityPage() {
  const ctx = await requirePermission("settings.security", {
    feature: "settings.security",
  });

  const [groups, history, activeSessions] = await Promise.all([
    buildSettingGroups(ctx, { groups: ["Security"], scopes: ["business"] }),

    db
      .select({
        id: loginHistory.id,
        email: loginHistory.email,
        outcome: loginHistory.outcome,
        ip: loginHistory.ip_address,
        userAgent: loginHistory.user_agent,
        createdAt: loginHistory.created_at,
      })
      .from(loginHistory)
      .where(eq(loginHistory.tenant_id, ctx.business.id))
      .orderBy(desc(loginHistory.created_at))
      .limit(30),

    db
      .select({
        id: sessions.id,
        userName: users.full_name,
        userEmail: users.email,
        ip: sessions.ip_address,
        lastSeen: sessions.last_seen_at,
        expiresAt: sessions.expires_at,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.user_id))
      .where(eq(sessions.tenant_id, ctx.business.id))
      .orderBy(desc(sessions.last_seen_at))
      .limit(20),
  ]);

  const failures = history.filter((h) => h.outcome !== "success").length;

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title="Security"
        description="Password policy, lockout behaviour and session lifetime, plus the sign-in audit trail."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Security" },
        ]}
      />

      {failures > 0 ? (
        <Notice tone="warning" title={`${failures} failed sign-in attempt(s) recently`}>
          Review the history below. Repeated failures against a single account
          trigger a temporary lockout using the policy configured here.
        </Notice>
      ) : null}

      <SettingsPanel
        groups={groups}
        currencySymbol={currencySymbol(ctx.business.currency)}
      />

      <section>
        <h2 className="section-title mb-2">Active sessions</h2>
        <TableShell>
          <Table>
            <THead>
              <TH>User</TH>
              <TH>IP address</TH>
              <TH>Last seen</TH>
              <TH>Expires</TH>
            </THead>
            <TBody>
              {activeSessions.length === 0 ? (
                <EmptyRow colSpan={4}>No active sessions.</EmptyRow>
              ) : (
                activeSessions.map((session) => (
                  <TR key={session.id}>
                    <TD>
                      <div className="font-medium">{session.userName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {session.userEmail}
                      </div>
                    </TD>
                    <TD mono className="text-muted-foreground">
                      {session.ip ?? "—"}
                    </TD>
                    <TD className="text-muted-foreground">
                      {formatDateTime(session.lastSeen)}
                    </TD>
                    <TD className="text-muted-foreground">
                      {formatDateTime(session.expiresAt)}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableShell>
        <p className="mt-2 text-xs text-muted-foreground">
          Suspending an employee or changing their password revokes their sessions
          immediately.
        </p>
      </section>

      <section>
        <h2 className="section-title mb-2">Sign-in history</h2>
        <TableShell>
          <Table>
            <THead>
              <TH>When</TH>
              <TH>Email</TH>
              <TH>Outcome</TH>
              <TH>IP address</TH>
              <TH>Device</TH>
            </THead>
            <TBody>
              {history.length === 0 ? (
                <EmptyRow colSpan={5}>No sign-in attempts recorded.</EmptyRow>
              ) : (
                history.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                    </TD>
                    <TD>{entry.email}</TD>
                    <TD>
                      <Badge
                        variant={
                          OUTCOME_TONES[entry.outcome] ?? "soft-neutral"
                        }
                      >
                        {humanise(entry.outcome)}
                      </Badge>
                    </TD>
                    <TD mono className="text-muted-foreground">
                      {entry.ip ?? "—"}
                    </TD>
                    <TD className="max-w-[280px] truncate text-[11px] text-muted-foreground">
                      {entry.userAgent ?? "—"}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableShell>
      </section>
    </div>
  );
}
