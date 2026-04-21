import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";

export function PageHeader({
  eyebrow,
  title,
  description,
  status,
  actions = [],
}: {
  eyebrow: string;
  title: string;
  description?: string;
  status?: string;
  actions?: Array<{ label: string; href: string }>;
}) {
  return (
    <header className="surface-card-strong rounded-[1.5rem] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl min-w-0">
          <p className="section-label text-[var(--ink-500)]">{eyebrow}</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <h1 className="text-[1.7rem] font-semibold tracking-tight text-[var(--ink-950)] sm:text-[2rem]">{title}</h1>
            {status ? <StatusBadge label={status} tone="info" /> : null}
          </div>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-700)] sm:text-[0.95rem]">{description}</p>
          ) : null}
        </div>
        {actions.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="control-button-secondary"
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}