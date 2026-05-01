import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOLIDWORKS Drawing Generator",
  description: "AI-powered automatic drawing generation for SOLIDWORKS parts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
