type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-[var(--surface-muted)] text-[var(--ink-950)] border-[var(--line-strong)]",
  info: "bg-[rgba(50,95,155,0.14)] text-[#244d81] border-[rgba(50,95,155,0.22)]",
  success:
    "bg-[rgba(46,125,97,0.14)] text-[#23644d] border-[rgba(46,125,97,0.22)]",
  warning:
    "bg-[rgba(183,113,25,0.14)] text-[#8a560f] border-[rgba(183,113,25,0.22)]",
  danger:
    "bg-[rgba(187,77,63,0.14)] text-[#9f3d32] border-[rgba(187,77,63,0.22)]",
};

export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex min-h-8 shrink-0 items-center self-start whitespace-nowrap rounded-full border px-3 py-1.5 text-[0.74rem] font-semibold tracking-[0.01em] ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

export function toneFromRisk(risk: string): Tone {
  if (risk === "Low") {
    return "success";
  }

  if (risk === "Medium") {
    return "warning";
  }

  if (risk === "High" || risk === "Blocked") {
    return "danger";
  }

  return "neutral";
}

export function toneFromState(state: string): Tone {
  if (["Passed", "Passed Review", "Complete", "Merged"].includes(state)) {
    return "success";
  }

  if (["Executing", "Running", "Ready to Merge", "Approved", "Studying"].includes(state)) {
    return "info";
  }

  if (["Needs Revision", "Awaiting Review", "Awaiting My Input", "Proposed", "Planned", "Queued"].includes(state)) {
    return "warning";
  }

  if (["Failed", "Blocked", "Retry Requested", "Stopped"].includes(state)) {
    return "danger";
  }

  return "neutral";
}