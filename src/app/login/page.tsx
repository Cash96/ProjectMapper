import { LoginPanel } from "@/components/login-panel";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getErrorMessage(errorValue: string | string[] | undefined) {
  if (!errorValue) {
    return undefined;
  }

  if (Array.isArray(errorValue)) {
    return getErrorMessage(errorValue[0]);
  }

  if (errorValue === "invalid-credentials") {
    return "Username or password did not match the configured operator gate.";
  }

  return undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorMessage = getErrorMessage(params.error);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="px-2">
          <p className="section-label text-[var(--ink-500)]">Internal operator system</p>
          <h2 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-[var(--ink-950)] md:text-6xl">
            Govern AI migration work without surrendering product judgment.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--ink-700)]">
            ProjectMapper is built for traceable planning, doctrine protection, branch isolation, focused task execution, and plain-English review of real migration work.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="surface-card rounded-3xl p-5">
              <p className="section-label text-[var(--ink-500)]">Current mission</p>
              <p className="mt-3 text-lg font-semibold">RevEd V1 into RevEd V2</p>
              <p className="mt-2 text-sm leading-7 text-[var(--ink-700)]">
                Map source features into an already-living target architecture without recreating V1 sprawl.
              </p>
            </div>
            <div className="surface-card rounded-3xl p-5">
              <p className="section-label text-[var(--ink-500)]">Operating posture</p>
              <p className="mt-3 text-lg font-semibold">Confident builder, not confident decision maker</p>
              <p className="mt-2 text-sm leading-7 text-[var(--ink-700)]">
                Push execution hard after approval, escalate early when doctrine or UX direction becomes uncertain.
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <LoginPanel error={errorMessage} />
        </div>
      </div>
    </div>
  );
}