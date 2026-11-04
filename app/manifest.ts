import type { MetadataRoute } from 'next';
import { PWA_BACKGROUND, PWA_THEME } from '@/lib/pwa/platform';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'StudyPlan Analyzer',
    short_name: 'StudyPlan',
    description:
      "Turn your child's exam results into a clear study plan until the next exam.",
    // A signed-out parent is sent from here to /login by the proxy, as usual.
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: PWA_BACKGROUND,
    theme_color: PWA_THEME,
    // The only sizes the logo exists in. Neither is marked "maskable": the
    // artwork in icon.png runs past the safe zone, so a circular Android mask
    // would clip it.
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/logo.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
    ],
  };
}
