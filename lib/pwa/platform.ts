// The app's cream page background and yellow accent.
export const PWA_BACKGROUND = '#FAF9F6';
export const PWA_THEME = '#F7CC46';

/** Remembers that the install button or iPhone hint was dismissed. */
export const INSTALL_DISMISSED_KEY = 'sp_install_dismissed';

// Chrome can offer installing before React has started, so an inline script in
// the root layout holds on to the event until PwaPrompts is ready. preventDefault
// keeps Chrome's own banner away. Old-style JavaScript, like OldBrowserNotice.
export const CAPTURE_INSTALL_PROMPT =
  "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e;window.dispatchEvent(new Event('installpromptready'))});";

/**
 * Safari itself on an iPhone or iPad. Not Chrome, Firefox, Edge or Opera on
 * iOS, and not an app's built-in browser (Facebook, Messenger, ...), whose
 * User-Agent has no "Version/... Safari/...". iPadOS Safari calls itself a Mac,
 * but no Mac has a touch screen.
 */
export function isIosSafari(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1);
  return (
    ios &&
    /Version\/[\d.]+.*Safari\//.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)
  );
}
