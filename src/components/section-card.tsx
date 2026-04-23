import Link from "next/link";
import type { ReactNode } from "react";

export function SectionCard({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: { label: string; href: string };
}) {
  return (
    <section className="surface-card rounded-[1.2rem] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="section-label text-[var(--ink-500)]">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--ink-950)]">{title}</h2>
        </div>
        {action ? (
          <Link
            href={action.href}
            className="control-button-secondary text-xs sm:text-sm"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      <div className="mt-4 text-sm leading-6 text-[var(--ink-700)]">{children}</div>
    </section>
  );
}