import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vision RPS — Rock Paper Scissors',
  description: 'A browser-only camera-powered Rock Paper Scissors game.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
