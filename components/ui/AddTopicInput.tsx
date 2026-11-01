'use client';

import { useState } from 'react';
import clsx from 'clsx';

import { Button } from './Button';
import { fieldClass } from './Field';

/** "Add a custom topic" field with an Add button; Enter also adds. */
export function AddTopicInput({
  onAdd,
  className,
}: {
  onAdd: (name: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState('');
  return (
    <div className={clsx('flex gap-2', className)}>
      <input
        className={`${fieldClass} flex-1`}
        placeholder="Add a custom topic"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAdd(value);
            setValue('');
          }
        }}
      />
      <Button
        onClick={() => {
          onAdd(value);
          setValue('');
        }}
      >
        Add
      </Button>
    </div>
  );
}
