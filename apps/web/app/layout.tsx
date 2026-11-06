import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Knowledge Copilot',
  description: 'Chat with your documents. Answers grounded in your own sources, with citations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
