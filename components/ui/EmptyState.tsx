export function EmptyState({
  title,
  description,
  action,
  icon = '🎓',
  titleAs: Title = 'h3',
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode; // optional, defaults to the dashboard's 🎓
  titleAs?: 'h2' | 'h3';
}) {
  return (
    <div className="rounded-[32px] bg-white px-6 py-16 text-center shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:py-20">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] bg-[#F7CC46] text-4xl">
        {icon}
      </div>

      <Title className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
        {title}
      </Title>

      <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#65615D] sm:text-base">
        {description}
      </p>

      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

// The dashboard's black pill button, for use as the `action`.
export const emptyStateActionClass =
  'inline-flex rounded-full bg-black px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-black/80';
