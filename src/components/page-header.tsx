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
    <header className="surface-card-strong rounded-[1.75rem] p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="section-label text-[var(--ink-500)]">{eyebrow}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight md:text-[2rem]">{title}</h1>
            {status ? <StatusBadge label={status} tone="info" /> : null}
          </div>
          {description ? (
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--ink-700)]">{description}</p>
          ) : null}
        </div>
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-full border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink-950)] transition hover:-translate-y-0.5"
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