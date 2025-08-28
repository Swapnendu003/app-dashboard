import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Rubik } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
});

export const metadata: Metadata = {
  title: "Keploy Coverage Dashboard",
  description: "Keploy is an AI-powered tool that generates test cases and mocks/stubs for unit, integration, and API testing, helping developers achieve 90% test coverage in minutes. With open-source automation and enhanced test reliability, Keploy simplifies testing workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
