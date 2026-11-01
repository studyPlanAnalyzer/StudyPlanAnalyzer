/** @type {import('next').NextConfig} */

// Sent with every response. The app loads nothing from other origins except
// Google's sign-in (Google Identity Services: its script, button frame,
// stylesheet and requests, all under accounts.google.com/gsi/, as Google
// documents). Everything else comes from 'self': no framing of this app
// (clickjacking), no <base> or form hijacking, no plugins. 'unsafe-inline'
// for scripts is needed by Next.js's inline bootstrap scripts unless every
// page is rendered per request with a nonce; 'unsafe-eval' only in
// development, for hot reloading. HSTS leaves subdomains alone so it can't
// lock out any that aren't on HTTPS.
const isDev = process.env.NODE_ENV !== 'production';
const GOOGLE_GSI = 'https://accounts.google.com/gsi/';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} ${GOOGLE_GSI}client`,
  `style-src 'self' 'unsafe-inline' ${GOOGLE_GSI}style`,
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${GOOGLE_GSI}`,
  `frame-src ${GOOGLE_GSI}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The app doesn't use next/image. Turning the optimizer off removes the
  // /_next/image endpoint, which has had several security advisories.
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
