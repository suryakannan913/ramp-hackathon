import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Bank-Change Guard",
  description: "Evidence-led review for vendor bank changes",
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
