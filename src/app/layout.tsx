import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FSIQ Food Cost Analyzer",
  description: "FoodServiceIQ Food Cost Analyzer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
