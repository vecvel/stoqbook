import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { sessions } from "@/db/schema";

export const SESSION_COOKIE = "stoqbook_session";
const DEFAULT_TTL_MINUTES = 60 * 12;

/** Only the hash is persisted, so a database leak cannot mint valid cookies. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreateSessionInput {
  /** The single installed business. Stored in `tenant_id` for schema stability. */
  businessId?: string | null;
  userId?: string | null;
  /** Store selected at sign-in. Stored in `active_branch_id`. */
  activeStoreId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  ttlMinutes?: number;
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const ttl = input.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttl * 60_000);

  await db.insert(sessions).values({
    token_hash: hashToken(token),
    tenant_id: input.businessId ?? null,
    user_id: input.userId ?? null,
    active_branch_id: input.activeStoreId ?? null,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    expires_at: expiresAt,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export type SessionRow = typeof sessions.$inferSelect;

/** Reads and validates the session referenced by the request cookie. */
export async function getSessionRow(): Promise<SessionRow | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.token_hash, hashToken(token)),
        isNull(sessions.revoked_at),
        gt(sessions.expires_at, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function setActiveStore(
  sessionId: string,
  storeId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ active_branch_id: storeId, updated_at: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function touchSession(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ last_seen_at: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    await db
      .update(sessions)
      .set({ revoked_at: new Date() })
      .where(eq(sessions.token_hash, hashToken(token)));
  }

  jar.delete(SESSION_COOKIE);
}

/** Revokes every session for a user — used on suspension or password change. */
export async function revokeUserSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revoked_at: new Date() })
    .where(and(eq(sessions.user_id, userId), isNull(sessions.revoked_at)));
}
