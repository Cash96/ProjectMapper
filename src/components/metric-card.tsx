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
    <article className="surface-card rounded-[1.35rem] p-4 sm:p-5">
      <p className="section-label text-[var(--ink-500)]">{label}</p>
      <strong className="mt-3 block text-3xl font-semibold tracking-tight text-[var(--ink-950)] sm:text-4xl">{value}</strong>
      {detail ? <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{detail}</p> : null}
    </article>
  );
}