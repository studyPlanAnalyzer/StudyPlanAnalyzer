import { HTMLAttributes } from "react";
import clsx from "clsx";

/** The dashboard's white card surface, without padding. */
export const cardClass = "rounded-[32px] bg-white shadow-[0_12px_30px_rgba(0,0,0,0.07)]";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(cardClass, "p-5", className)}
      {...rest}
    />
  );
}
