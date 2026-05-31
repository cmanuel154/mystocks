import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title:       'MyStocks — Marketplace Dashboard',
  description: 'Manage TikTok Shop & Shopee from one place',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
