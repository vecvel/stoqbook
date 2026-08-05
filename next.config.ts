import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  typedRoutes: false,
  experimental: {
    // Server Actions handle every mutation; allow larger payloads for imports.
    serverActions: { bodySizeLimit: "10mb" },
    /* Lets the authorization pipeline call `forbidden()` / `unauthorized()`,
       which render `forbidden.tsx` / `unauthorized.tsx` with a real 403 or 401.
       Without this a page-level permission denial throws and surfaces as a 500
       Internal Server Error — indistinguishable from a crash, both to the user
       and in the logs. */
    authInterrupts: true,
  },
};

export default nextConfig;
