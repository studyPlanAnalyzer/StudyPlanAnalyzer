import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

import { fieldShapeClass } from "./Field";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Layout classes for the label + field box (className styles the field). */
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, containerClassName, id, ...rest }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className={clsx("grid gap-1.5", containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-black">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(fieldShapeClass, error && "!border-red-400", className)}
          {...rest}
        />
        {hint && !error && <p className="text-sm text-[#65615D]">{hint}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
