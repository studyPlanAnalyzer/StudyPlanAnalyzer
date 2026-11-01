'use client';

import { useEffect, useRef, useState } from 'react';

// Marks its box data-reveal="in" the first time it scrolls into view, which
// starts the CSS animations inside it (see LandingStyles). Without
// IntersectionObserver it shows the finished state straight away.
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal={inView ? 'in' : 'out'} className={className}>
      {children}
    </div>
  );
}
