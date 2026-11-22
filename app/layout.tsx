import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Grounded AI - Chat Agent with Web Search',
  description: 'Production-grade chat agent with web search tool, temporal memory, and grounded verification',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen overflow-hidden">{children}</body>
    </html>
  );
}
