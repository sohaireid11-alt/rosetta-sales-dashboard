import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host")?.split(",")[0] ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0] ?? (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;

  return {
    title: "Rosetta Sales Performance",
    description: "Sales performance tracking for Rosetta Languages.",
    metadataBase: new URL(baseUrl),
    icons: { icon: "/rosetta-logo-horizontal.png", shortcut: "/rosetta-logo-horizontal.png" },
    openGraph: {
      title: "Rosetta Languages | Sales Performance",
      description: "Revenue, conversion, and service mix in one view.",
      images: [{ url: `${baseUrl}/og.png`, width: 1200, height: 630, alt: "Rosetta Languages Sales Performance" }],
    },
    twitter: { card: "summary_large_image", title: "Rosetta Languages | Sales Performance", images: [`${baseUrl}/og.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
