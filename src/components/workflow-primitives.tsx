import Link from "next/link";
import type { ReactNode } from "react";

import { StatusBadge, type Tone } from "@/components/status-badge";

export type WorkflowState = "not-started" | "in-progress" | "blocked" | "ready" | "complete";

function getWorkflowStateLabel(state: WorkflowState) {
  if (state === "in-progress") {
    return "In progress";
  }

  if (state === "not-started") {
    return "Not started";
  }

  return state.charAt(0).toUpperCase() + state.slice(1);
}

function getWorkflowStateTone(state: WorkflowState): Tone {
  if (state === "complete") {
    return "success";
  }

  if (state === "ready") {
    return "info";
  }

  if (state === "blocked") {
    return "warning";
  }

  if (state === "in-progress") {
    return "info";
  }

  return "neutral";
}

function getWorkflowStepClass(state: WorkflowState, active: boolean) {
  if (active) {
    return "step-card step-card-active";
  }

  if (state === "complete") {
    return "step-card step-card-complete";
  }

  if (state === "blocked") {
    return "step-card step-card-blocked";
  }

  if (state === "ready") {
    return "step-card step-card-ready";
  }

  return "step-card";
}

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

export function WorkflowHero({
  stepLabel,
  progressLabel,
  title,
  description,
  state,
  badges = [],
}: {
  stepLabel: string;
  progressLabel: string;
  title: string;
  description?: string;
  state: WorkflowState;
  badges?: Array<{ label: string; tone?: Tone }>;
}) {
  return (
    <section className="workflow-hero">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="section-label text-[var(--signal-blue)]">You are here</p>
            <StatusBadge label={getWorkflowStateLabel(state)} tone={getWorkflowStateTone(state)} />
          </div>
          <h2 className="mt-2 text-[1.45rem] font-semibold tracking-tight text-[var(--ink-950)] sm:text-[1.9rem]">{stepLabel}</h2>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-[var(--ink-500)]">{progressLabel}</p>
          <p className="mt-3 text-base font-medium text-[var(--ink-950)]">{title}</p>
          {description ? <p className="mt-1.5 max-w-xl text-sm leading-6 text-[var(--ink-700)]">{description}</p> : null}
        </div>
        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {badges.map((badge) => (
              <StatusBadge key={`${badge.label}-${badge.tone ?? "neutral"}`} label={badge.label} tone={badge.tone} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function StickyNextActionBar({
  stepLabel,
  action,
  description,
}: {
  stepLabel: string;
  action?: { label: string; href: string };
  description?: string;
}) {
  if (!action) {
    return null;
  }

  return (
    <div className="sticky-next-action-bar">
      <div className="min-w-0">
        <p className="section-label text-[var(--signal-blue)]">Next action</p>
        <p className="mt-1 text-sm font-semibold text-[var(--ink-950)]">{stepLabel}</p>
        {description ? <p className="mt-1 text-sm text-[var(--ink-700)]">{description}</p> : null}
      </div>
      <Link href={action.href} className="control-button-primary w-full sm:w-auto">
        {action.label}
      </Link>
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
    state: WorkflowState;
    active?: boolean;
    badges?: Array<{ label: string; tone?: Tone }>;
    href?: string;
  }>;
}) {
  return (
    <div className="step-rail">
      {steps.map((step) => {
        const className = getWorkflowStepClass(step.state, Boolean(step.active));
        const content = (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="section-label text-[var(--ink-500)]">Step {step.number}</p>
                <p className="mt-2 text-base font-semibold text-[var(--ink-950)]">{step.title}</p>
              </div>
              <StatusBadge label={getWorkflowStateLabel(step.state)} tone={getWorkflowStateTone(step.state)} />
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{step.description}</p>
            {step.badges?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {step.badges.map((badge) => (
                  <StatusBadge key={`${step.number}-${badge.label}`} label={badge.label} tone={badge.tone} />
                ))}
              </div>
            ) : null}
          </>
        );

        return (
          step.href ? (
            <Link key={step.number} href={step.href} className={className}>
              {content}
            </Link>
          ) : (
            <div key={step.number} className={className}>
              {content}
            </div>
          )
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