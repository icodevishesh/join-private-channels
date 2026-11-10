import 'dotenv/config';

// In dev mode Next.js blocks its dev assets for hosts other than localhost.
// Allow common tunnel domains (ngrok, Cloudflare), plus PUBLIC_URL's host if it's set in .env.
const publicHost = (() => {
  try {
    return new URL(process.env.PUBLIC_URL).hostname;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Server-only packages used by the shared bot code in src/.
  serverExternalPackages: ['mysql2', 'discord.js', 'grammy'],
  allowedDevOrigins: [
    ...(publicHost && publicHost !== 'localhost' ? [publicHost] : []),
    '*.ngrok-free.dev',
    '*.ngrok-free.app',
    '*.ngrok.app',
    '*.trycloudflare.com',
  ],
};

export default nextConfig;
