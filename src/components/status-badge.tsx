type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-white/88 text-[var(--ink-950)] border-[var(--line-strong)]",
  info: "bg-[rgba(50,95,155,0.12)] text-[var(--signal-blue)] border-[rgba(50,95,155,0.18)]",
  success:
    "bg-[rgba(46,125,97,0.12)] text-[var(--signal-green)] border-[rgba(46,125,97,0.18)]",
  warning:
    "bg-[rgba(183,113,25,0.12)] text-[var(--signal-amber)] border-[rgba(183,113,25,0.18)]",
  danger:
    "bg-[rgba(187,77,63,0.12)] text-[var(--signal-red)] border-[rgba(187,77,63,0.18)]",
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
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${toneClasses[tone]}`}
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

  if (["Executing", "Running", "Ready to Merge", "Approved"].includes(state)) {
    return "info";
  }

  if (["Needs Revision", "Awaiting Review", "Awaiting My Input", "Proposed", "Planned"].includes(state)) {
    return "warning";
  }

  if (["Failed", "Blocked", "Retry Requested", "Stopped"].includes(state)) {
    return "danger";
  }

  return "neutral";
}