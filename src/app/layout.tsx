import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MetaPixel } from "@/components/meta/MetaPixel";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FSIQ Food Cost Analyzer",
  description: "FoodServiceIQ Food Cost Analyzer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';

  return (
    <html lang="en">
      <body className={inter.className}>
        {pixelId && <MetaPixel pixelId={pixelId} />}
        {children}
      </body>
    </html>
  );
}
