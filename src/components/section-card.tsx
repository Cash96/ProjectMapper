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
    <section className="surface-card rounded-3xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label text-[var(--ink-500)]">{eyebrow}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        {action ? (
          <Link
            href={action.href}
            className="rounded-full border border-[var(--line-strong)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink-950)] transition hover:-translate-y-0.5"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      <div className="mt-5 text-sm leading-7 text-[var(--ink-700)]">{children}</div>
    </section>
  );
}