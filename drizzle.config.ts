import "dotenv/config";
import { defineConfig } from "drizzle-kit";

function getDrizzleUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  let urlStr = rawUrl.trim();

  // On Windows, 'localhost' often resolves to IPv6 (::1) while local Postgres listens on IPv4.
  urlStr = urlStr
    .replace("@localhost:", "@127.0.0.1:")
    .replace("@localhost/", "@127.0.0.1/");

  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const isLocalHost =
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "db" ||
      host === "postgres" ||
      host === "host.docker.internal" ||
      host === "0.0.0.0";

    if (!isLocalHost && !parsed.searchParams.has("sslmode") && !parsed.searchParams.has("ssl")) {
      parsed.searchParams.set("sslmode", "require");
      urlStr = parsed.toString();
    }
  } catch {
    // Ignore parse error, use urlStr directly
  }

  return urlStr;
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: getDrizzleUrl(process.env.DATABASE_URL ?? ""),
  },
  verbose: true,
  strict: false,
});

