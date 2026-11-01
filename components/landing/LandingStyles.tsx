// Animations for the landing page. Every element's resting style is its
// finished state; the "before" states only apply when motion is allowed, so
// reduced-motion visitors see the end result with no movement. Scroll-started
// visuals wait for Reveal to set data-reveal="in"; without JavaScript the
// <noscript> rule shows them finished.
const css = `
@keyframes lp-rise {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: none; }
}
@keyframes lp-pop {
  from { opacity: 0; transform: scale(0.4); }
  to { opacity: 1; transform: none; }
}
@keyframes lp-draw {
  0% { stroke-dashoffset: 1; opacity: 0; }
  1% { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 1; }
}
@keyframes lp-underline {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
@keyframes lp-climb {
  0%, 18% { transform: translate(32px, 270px); }
  26% { transform: translate(55px, 178px); }
  32%, 46% { transform: translate(77px, 200px); }
  54% { transform: translate(100px, 108px); }
  60%, 74% { transform: translate(122px, 130px); }
  82% { transform: translate(145px, 38px); }
  88%, 100% { transform: translate(167px, 60px); }
}

.lp-pop, .lp-star { transform-box: fill-box; transform-origin: center; }
.lp-draw { stroke-dasharray: 1; stroke-dashoffset: 0; }

.lp-underline { position: relative; white-space: nowrap; }
.lp-underline::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.04em;
  height: 0.14em;
  border-radius: 999px;
  background: #f7cc46;
  z-index: -1;
  transform-origin: left;
}

@media (prefers-reduced-motion: no-preference) {
  .lp-underline::after { animation: lp-underline 900ms 400ms ease-out both; }
  .lp-step { animation: lp-rise 600ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
  .lp-climber { animation: lp-climb 3.4s 700ms cubic-bezier(0.45, 0.05, 0.35, 1) both; }
  .lp-star { animation: lp-pop 500ms 4s cubic-bezier(0.2, 0.7, 0.2, 1.4) both; }

  [data-reveal='out'] .lp-draw { stroke-dashoffset: 1; opacity: 0; }
  [data-reveal='out'] .lp-pop { opacity: 0; }
  [data-reveal='in'] .lp-draw { animation: lp-draw 1.6s ease-out both; }
  [data-reveal='in'] .lp-pop { animation: lp-pop 450ms cubic-bezier(0.2, 0.7, 0.2, 1.4) both; }
}
`;

const noscriptCss =
  '<style>.lp-draw{stroke-dashoffset:0!important;opacity:1!important}.lp-pop{opacity:1!important}</style>';

export function LandingStyles() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <noscript dangerouslySetInnerHTML={{ __html: noscriptCss }} />
    </>
  );
}
