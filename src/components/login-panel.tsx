export function LoginPanel({ error }: { error?: string }) {
  return (
    <div className="surface-card-strong w-full max-w-md rounded-[2rem] p-8">
      <p className="section-label text-[var(--ink-500)]">Operator gate</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">ProjectMapper</h1>
      <p className="mt-4 text-sm leading-7 text-[var(--ink-700)]">
        Founder-controlled migration command center for doctrine-governed AI execution.
      </p>
      <form action="/api/auth/login" method="post" className="mt-8 space-y-5">
        <div>
          <label
            htmlFor="username"
            className="mb-2 block text-sm font-medium text-[var(--ink-950)]"
          >
            Username
          </label>
          <input
            id="username"
            name="username"
            defaultValue="cash96"
            className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 outline-none transition focus:border-[var(--signal-blue)]"
            autoComplete="username"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-medium text-[var(--ink-950)]"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 outline-none transition focus:border-[var(--signal-blue)]"
            autoComplete="current-password"
          />
        </div>
        {error ? (
          <p className="rounded-2xl border border-[rgba(187,77,63,0.18)] bg-[rgba(187,77,63,0.08)] px-4 py-3 text-sm text-[var(--signal-red)]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="bg-surface-rail w-full rounded-full px-5 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5"
        >
          Enter command center
        </button>
      </form>
      <div className="mt-8 rounded-3xl border border-[var(--line-soft)] bg-white/70 p-4 text-sm leading-6 text-[var(--ink-700)]">
        <p className="font-medium text-[var(--ink-950)]">Current operator account</p>
        <p className="mt-1">Username is fixed to cash96. Password is provided through environment configuration.</p>
      </div>
    </div>
  );
}