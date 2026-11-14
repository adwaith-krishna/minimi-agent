import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Minimi — Research with memory',
  description:
    'A conversational research agent with temporal memory and evidence-grounded answers.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-white text-[#1c1e21] font-sans">
        {children}
      </body>
    </html>
  )
}
