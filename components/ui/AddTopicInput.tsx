'use client';

import { useState } from 'react';
import clsx from 'clsx';

import { Button } from './Button';
import { fieldClass } from './Field';

type Elsewhere = { names: string[]; message: (name: string) => string };
const norm = (n: string) => n.trim().replace(/\s+/g, ' ').toLowerCase();

/** Why `name` can't be added (already listed here or elsewhere), or null. */
export function duplicateMessage(name: string, existing: string[], elsewhere: Elsewhere[] = []): string | null {
  if (existing.some((n) => norm(n) === norm(name))) return `“${name}” is already in the list. Tick it there instead.`;
  const other = elsewhere.find((e) => e.names.some((n) => norm(n) === norm(name)));
  return other ? other.message(name) : null;
}

/**
 * "Add a custom topic" field with an Add button; Enter also adds. A name
 * already in `existing` (the list shown right above it) or in one of
 * `elsewhere` (topics added on another step) isn't added twice: the field
 * says where it already is instead, as the Subjects page does.
 */
export function AddTopicInput({
  onAdd,
  existing = [],
  elsewhere = [],
  className,
}: {
  onAdd: (name: string) => void;
  existing?: string[];
  elsewhere?: Elsewhere[];
  className?: string;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add() {
    const name = value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const problem = duplicateMessage(name, existing, elsewhere);
    if (problem) {
      setError(problem);
      return;
    }
    onAdd(name);
    setValue('');
    setError(null);
  }

  return (
    <div className={className}>
      <div className={clsx('flex gap-2')}>
        <input
          className={`${fieldClass} flex-1`}
          placeholder="Add a custom topic"
          value={value}
          aria-invalid={!!error}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add}>Add</Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
