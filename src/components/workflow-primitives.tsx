import Link from "next/link";
import type { ReactNode } from "react";

import { StatusBadge, type Tone } from "@/components/status-badge";

export function MetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="metric-tile">
      <p className="section-label text-[var(--ink-500)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-950)]">{value}</p>
      {detail ? <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{detail}</p> : null}
    </div>
  );
}

export function NextActionCard({
  eyebrow,
  title,
  description,
  action,
  badges = [],
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
  badges?: Array<{ label: string; tone?: Tone }>;
}) {
  return (
    <div className="next-action-card p-5 sm:p-6">
      <p className="section-label text-[var(--signal-blue)]">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--ink-950)]">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-[var(--ink-700)]">{description}</p>
      {badges.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {badges.map((badge) => (
            <StatusBadge key={`${badge.label}-${badge.tone ?? "neutral"}`} label={badge.label} tone={badge.tone} />
          ))}
        </div>
      ) : null}
      {action ? (
        <div className="mt-5">
          <Link href={action.href} className="control-button-primary inline-flex">
            {action.label}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function SegmentedLinkTabs({
  items,
}: {
  items: Array<{ label: string; href: string; active?: boolean; badge?: string }>;
}) {
  return (
    <div className="segmented-control">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`segmented-option ${item.active ? "segmented-option-active" : ""}`.trim()}
        >
          <span>{item.label}</span>
          {item.badge ? <span className="ml-2 text-xs uppercase tracking-[0.14em] text-inherit/70">{item.badge}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function SelectablePanel({
  href,
  selected = false,
  children,
}: {
  href: string;
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`selection-card ${selected ? "selection-card-active" : ""}`.trim()}>
      {children}
    </Link>
  );
}

export function StepRail({
  steps,
}: {
  steps: Array<{
    number: number;
    title: string;
    description: string;
    state: "current" | "complete" | "upcoming";
    badges?: Array<{ label: string; tone?: Tone }>;
  }>;
}) {
  return (
    <div className="step-rail">
      {steps.map((step) => {
        const stateClass =
          step.state === "current"
            ? "step-card step-card-active"
            : step.state === "complete"
              ? "step-card step-card-complete"
              : "step-card";

        return (
          <div key={step.number} className={stateClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="section-label text-[var(--ink-500)]">Step {step.number}</p>
                <p className="mt-2 text-base font-semibold text-[var(--ink-950)]">{step.title}</p>
              </div>
              <StatusBadge
                label={step.state === "complete" ? "Complete" : step.state === "current" ? "Current" : "Queued"}
                tone={step.state === "complete" ? "success" : step.state === "current" ? "info" : "neutral"}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{step.description}</p>
            {step.badges?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {step.badges.map((badge) => (
                  <StatusBadge key={`${step.number}-${badge.label}`} label={badge.label} tone={badge.tone} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function FieldShell({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="field-shell">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {hint ? <p className="field-hint">{hint}</p> : null}
      {children}
    </div>
  );
}