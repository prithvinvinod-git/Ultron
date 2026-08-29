import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/app/components/sidebar";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ultron — Personal Agentic Assistant",
  description:
    "Your own JARVIS-style agentic assistant — chat, voice, tools, and memory.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-ink" suppressHydrationWarning>
        <Sidebar />
        <main className="flex min-h-screen flex-col pl-[260px]">{children}</main>
      </body>
    </html>
  );
}