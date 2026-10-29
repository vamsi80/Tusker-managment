import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { Inter } from "next/font/google";
import localFont from "next/font/local";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Headings and numbers, as in the mobile app: Archivo Expanded (stand-in for
// the brand's Aktiv Grotesk Extended). Everything you read stays Inter.
const archivoExpanded = localFont({
  src: [
    { path: "../assets/fonts/ArchivoExpanded-Regular.ttf", weight: "400" },
    { path: "../assets/fonts/ArchivoExpanded-Medium.ttf", weight: "500" },
    { path: "../assets/fonts/ArchivoExpanded-SemiBold.ttf", weight: "600" },
    { path: "../assets/fonts/ArchivoExpanded-Bold.ttf", weight: "700" },
  ],
  variable: "--font-archivo-expanded",
  display: "swap",
});

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
      <body className={`${inter.variable} ${archivoExpanded.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster closeButton position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
