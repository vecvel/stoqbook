import Link from "next/link";

/**
 * Split sign-in layout: brand panel on the left, form on the right.
 * Flat colour blocks only — the brand palette does the work, no gradients.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <aside className="relative hidden w-[46%] flex-col justify-between bg-bark p-10 text-parchment lg:flex xl:w-[42%]">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xs bg-parchment text-lg font-bold text-bark">
            S
          </span>
          <span className="text-lg font-semibold tracking-tight">StoqBook</span>
        </Link>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            The modern retail operating system.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-parchment/70">
            Inventory, point of sale, purchasing, customers, suppliers,
            employees and reporting — one configurable system that scales from
            a single counter to a national chain.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              "Ledger-driven inventory with a complete audit trail",
              "Dynamic roles and permissions, nothing hardcoded",
              "Multi-store and multi-warehouse from day one",
              "Owned outright, installed for one business",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-copper" />
                <span className="text-parchment/85">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-parchment/50">
          <span>Version 1.0.0</span>
          <span className="size-1 rounded-full bg-parchment/30" />
          <span>Perpetual licence</span>
          <span className="size-1 rounded-full bg-parchment/30" />
          <span>API-first</span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <Link
            href="/"
            className="mb-8 flex items-center gap-2.5 lg:hidden"
            aria-label="StoqBook home"
          >
            <span className="flex size-8 items-center justify-center rounded-xs bg-bark text-sm font-bold text-parchment">
              S
            </span>
            <span className="font-semibold tracking-tight">StoqBook</span>
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
