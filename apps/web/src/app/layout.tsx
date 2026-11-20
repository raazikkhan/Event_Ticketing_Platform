import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Event Ticketing Platform',
  description: 'High-concurrency event ticketing platform with zero double-booking guarantee.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#0F172A] text-[#F1F5F9]">{children}</body>
    </html>
  );
}
