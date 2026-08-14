import type { Metadata, Viewport } from "next";
import NextTopLoader from "nextjs-toploader";

import { Toaster } from "@/components/ui/sonner";
import {Montserrat} from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "StoqBook — The Modern Retail Operating System",
    template: "%s · StoqBook",
  },
  description:
    "Retail management for one business: inventory, POS, purchasing, customers, suppliers, employees and reporting in one configurable system.",
  applicationName: "StoqBook",
};

const font = Montserrat({
  subsets:["latin"],
  variable:"--font-sans",
  display:"swap",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4B352A" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1512" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={font.className}>
        <NextTopLoader
          color="#CA7842"
          initialPosition={0.08}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 10px #CA7842,0 0 5px #CA7842"
        />
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
