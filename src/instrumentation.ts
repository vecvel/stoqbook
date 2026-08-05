/**
 * Server start-up hook.
 *
 * Next.js calls `register()` once per server process, before any request. It is
 * the only place a long-lived background loop can be started without hanging it
 * off a request, which would make its lifetime depend on traffic.
 */
export async function register() {
  // The Edge runtime has no timers that outlive a request and no database
  // driver, so there is nothing to start there.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startTicker } = await import("@/lib/jobs/ticker");
  startTicker();
}
