'use client';

/**
 * The dashboard's page headline: rises in on load and draws a yellow
 * underline. `size` replaces the default font size; `nowrap` keeps it on one
 * line, as the dashboard does.
 */
export function PageTitle({
  children,
  nowrap = false,
  size = 'text-[clamp(1.15rem,5.1vw,4rem)]',
  className = '',
}: {
  children: React.ReactNode;
  nowrap?: boolean;
  size?: string;
  className?: string;
}) {
  return (
    <>
      <h1
        className={`dashboard-headline relative inline-block ${nowrap ? 'whitespace-nowrap' : 'max-w-full'} ${size} font-extrabold leading-tight tracking-[-0.045em] ${className}`}
      >
        {children}
      </h1>

      <style jsx global>{`
        @keyframes headline-enter {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes underline-draw {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }

        .dashboard-headline {
          animation: headline-enter 700ms ease-out both;
        }

        .dashboard-headline::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: -5px;
          width: 100%;
          height: 3px;
          border-radius: 999px;
          background: #f7cc46;
          transform: scaleX(0);
          transform-origin: left;
          animation: underline-draw 900ms 400ms ease-out forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .dashboard-headline,
          .dashboard-headline::after {
            animation: none;
            opacity: 1;
            transform: none;
          }

          .dashboard-headline::after {
            transform: scaleX(1);
          }
        }
      `}</style>
    </>
  );
}
