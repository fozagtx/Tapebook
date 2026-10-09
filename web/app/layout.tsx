import type { Metadata } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';
import { Navbar } from '@/components/navbar';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], weight: ['300', '400', '500', '600', '700'] });
const instrumentSerif = Instrument_Serif({ variable: '--font-instrument-serif', subsets: ['latin'], weight: '400', style: ['normal', 'italic'] });

export const metadata: Metadata = {
  title: 'Tapebook: a bug bounty layer for TapeOut circuits',
  description:
    'Circuit owners bond OKB behind "my circuit matches this spec". Anyone who finds one input where they disagree breaks the claim and takes the bond. Checked by TapeOut’s own on-chain eval on X Layer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
