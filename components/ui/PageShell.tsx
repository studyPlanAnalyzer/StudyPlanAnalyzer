import clsx from 'clsx';

/** The cream page background every signed-in page uses. */
export function PageShell({
  children,
  withBottomNav = false,
  className,
}: {
  children: React.ReactNode;
  /** Leaves room for StudentBottomNav on phones. */
  withBottomNav?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'min-h-screen overflow-x-hidden bg-[#FAF9F6] text-black',
        withBottomNav && 'pb-24 sm:pb-8',
        className,
      )}
    >
      {children}
    </div>
  );
}

const WIDTH = {
  wide: 'max-w-[1400px] px-5 sm:px-7 lg:px-0',
  narrow: 'max-w-[900px] px-5 sm:px-7',
};

/** The page's main column, lined up with AppHeader of the same width. */
export function PageMain({
  children,
  width = 'wide',
  className,
}: {
  children: React.ReactNode;
  width?: keyof typeof WIDTH;
  className?: string;
}) {
  return (
    <main className={clsx('mx-auto w-full pt-5 sm:pt-8', WIDTH[width], className)}>
      {children}
    </main>
  );
}
