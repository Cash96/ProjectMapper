"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  className,
  disabled = false,
}: {
  idleLabel: string;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={disabled || pending}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}