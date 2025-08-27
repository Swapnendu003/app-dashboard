import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Rubik } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
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
        className={`${poppins.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
