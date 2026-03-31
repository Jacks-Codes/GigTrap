import './globals.css';

export const metadata = {
  title: 'GigTrap',
  description: 'A classroom simulation about algorithmic management in gig work.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
