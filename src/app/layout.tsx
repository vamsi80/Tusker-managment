import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { SubTaskSheetProvider } from "@/contexts/subtask-sheet-context";
import { GlobalSubTaskSheet } from "@/components/global-subtask-sheet";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Tusker Management — Project & Task Management Platform",
  description: "Streamline your project workflow with Tusker Management. Track tasks, manage teams, and deliver projects on time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SubTaskSheetProvider>
            {children}
            <Suspense fallback={null}>
              <GlobalSubTaskSheet />
            </Suspense>
            <Toaster closeButton position="top-right" />
          </SubTaskSheetProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
