import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyPlan Analyzer",
  description:
    "Turn your child's exam results into a clear study plan until the next exam.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
