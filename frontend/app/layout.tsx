import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/contexts/AuthProvider";
import { ToastProvider } from "@/components/Toast";

const bricolageSans = Bricolage_Grotesque({
  variable: "--font-bricolage-sans",
  subsets: ["latin"],
});

const ibmMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TaskFlow | AI-Powered Kanban Board",
  description: "TaskFlow is a premium, real-time Kanban board that uses Gemini 3 to automatically break down your goals into actionable tasks.",
  keywords: ["Kanban", "AI Productivity", "Task Management", "FastAPI", "Next.js", "Gemini AI"],
  authors: [{ name: "TaskFlow Team" }],
  openGraph: {
    title: "TaskFlow | AI-Powered Kanban Board",
    description: "Manage your projects with real-time sync and AI-generated task breakdowns.",
    type: "website",
    url: "https://taskflow.ai",
    images: [
      {
        url: "/taskflow-icon.png",
        width: 800,
        height: 800,
        alt: "TaskFlow Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TaskFlow | AI-Powered Kanban Board",
    description: "Real-time Kanban board with AI task breakdown.",
    images: ["/taskflow-icon.png"],
  },
  icons: {
    icon: [
      { url: "/taskflow-icon.png", sizes: "32x32", type: "image/png" },
      { url: "/taskflow-icon.png", sizes: "any" } // Fallback
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bricolageSans.variable} ${ibmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950">
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
