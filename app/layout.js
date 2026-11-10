import './globals.css';

export const metadata = {
  title: 'Spaceship',
  description: 'Spaceship admin panel',
};

export const viewport = { width: 'device-width', initialScale: 1 };

// Applies the saved theme (light / dark / system) before the page paints, so there's no flash.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
