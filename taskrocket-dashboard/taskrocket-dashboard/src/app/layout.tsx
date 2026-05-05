import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaskRocket Dashboard",
  description: "Client dashboards powered by TaskRocket",
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
