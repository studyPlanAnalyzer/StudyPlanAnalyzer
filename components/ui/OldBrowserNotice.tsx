// Next.js 16 and Tailwind v4 need Safari 16.4 / Chrome 111 / Firefox 111 or
// newer. On anything older the app's JavaScript can't even be parsed, so the
// page shows its text but nothing that JavaScript adds (like the Google
// sign-in button), and no error. This notice is the one thing that still works
// there: it uses plain scripts and inline styles, not the app's code.
//
// The first script is a class `static {}` block, the same syntax the framework
// uses. A browser that can't read it skips the script, so the flag stays unset
// and the second script (old-style JavaScript, readable everywhere) shows the
// notice. eval can't do this check: the site's security policy forbids it.
export const BROWSER_PROBE = 'class P{static{window.__browserOk=true}}';
export const SHOW_NOTICE =
  "if(!window.__browserOk){var n=document.getElementById('old-browser-notice');if(n)n.hidden=false}";

export function OldBrowserNotice() {
  return (
    <>
      <div
        id="old-browser-notice"
        role="alert"
        hidden
        style={{
          background: '#fff5dc',
          color: '#805500',
          padding: '12px 20px',
          textAlign: 'center',
          fontSize: 15,
          lineHeight: 1.5,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        This browser is too old to run StudyPlan Analyzer, so you won&apos;t be
        able to sign in. On an iPhone, update to iOS 16.4 or newer (Settings →
        General → Software Update). On other devices, update your browser.
      </div>
      <script dangerouslySetInnerHTML={{ __html: BROWSER_PROBE }} />
      <script dangerouslySetInnerHTML={{ __html: SHOW_NOTICE }} />
    </>
  );
}
