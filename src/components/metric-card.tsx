export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="surface-card rounded-[1.5rem] p-5">
      <p className="section-label text-[var(--ink-500)]">{label}</p>
      <strong className="mt-4 block text-4xl font-semibold tracking-tight">{value}</strong>
      {detail ? <p className="mt-2 text-sm text-[var(--ink-700)]">{detail}</p> : null}
    </article>
  );
}