import type { Metadata, Viewport } from "next";

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
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
