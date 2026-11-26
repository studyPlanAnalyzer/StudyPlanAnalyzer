'use client';

import { useState } from 'react';
import clsx from 'clsx';

import { Button } from './Button';
import { fieldClass } from './Field';

/**
 * "Add a custom topic" field with an Add button; Enter also adds. A name
 * already in `existing` (ignoring case and spaces) isn't added twice: the
 * field says so instead, as the Subjects page does.
 */
export function AddTopicInput({
  onAdd,
  existing = [],
  className,
}: {
  onAdd: (name: string) => void;
  existing?: string[];
  className?: string;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const norm = (n: string) => n.trim().replace(/\s+/g, ' ').toLowerCase();

  function add() {
    const name = value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (existing.some((n) => norm(n) === norm(name))) {
      setError(`“${name}” is already in the list. Tick it there instead.`);
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
