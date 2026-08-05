import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Password hashing using scrypt from the Node standard library.
 *
 * Format: `scrypt$<saltHex>$<hashHex>` — self-describing so the algorithm can
 * be rotated later without breaking existing hashes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}

export interface PasswordPolicy {
  minLength: number;
}

/** Returns a list of human-readable problems; empty means acceptable. */
export function validatePassword(
  password: string,
  policy: PasswordPolicy = { minLength: 8 },
): string[] {
  const errors: string[] = [];
  if (password.length < policy.minLength) {
    errors.push(`Must be at least ${policy.minLength} characters.`);
  }
  if (!/[a-z]/.test(password)) errors.push("Must contain a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Must contain an uppercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Must contain a number.");
  return errors;
}
