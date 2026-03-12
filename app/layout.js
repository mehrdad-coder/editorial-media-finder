import './globals.css';

export const metadata = {
  title: 'MediaFinder — Editorial Image Discovery',
  description: 'AI-driven editorial media discovery tool for newsrooms. Search WordPress, Shutterstock, Getty, AP, and Reuters in one place.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
