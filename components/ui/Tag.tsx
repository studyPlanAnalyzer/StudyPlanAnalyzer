import clsx from 'clsx';

const TONE = {
  black: 'bg-black text-white',
  white: 'bg-white text-black',
  mint: 'bg-[#a4e5c7] text-black',
  coral: 'bg-[#EDB1AA] text-black',
};

/** A small uppercase label, such as "Step 2 of 6" or "Subject 1". */
export function Tag({
  children,
  tone = 'black',
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex w-fit items-center rounded-full px-3.5 py-1 text-sm font-bold uppercase tracking-wide',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
