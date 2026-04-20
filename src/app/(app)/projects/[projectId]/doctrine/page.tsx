import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, toneFromState } from "@/components/status-badge";
import { getLatestAnalysisRun } from "@/lib/analysis-store";
import { getLatestDoctrineVersion, getRecentDoctrineVersions } from "@/lib/doctrine-store";
import { getProject } from "@/lib/project-helpers";

type DoctrinePageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function joinLines(items: string[]) {
  return items.join("\n");
}

export default async function DoctrinePage({ params, searchParams }: DoctrinePageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await getProject(projectId);
  const latestAnalysisRun = await getLatestAnalysisRun(projectId);
  const latestDoctrineVersion = await getLatestDoctrineVersion(projectId);
  const recentDoctrineVersions = await getRecentDoctrineVersions(projectId, 5);
  const doctrineAction = getSearchValue(query.doctrine);
  const version = getSearchValue(query.version);
  const error = getSearchValue(query.error);
  const feedbackMessage = error
    ? error
    : doctrineAction && version
      ? `Doctrine v${version} ${doctrineAction.replace(/-/g, " ")}.`
      : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Doctrine"
        title="Doctrine"
        description="Current draft and version history."
        status={project.doctrine.approvalState}
        actions={[
          { label: "Open analysis", href: `/projects/${project.id}/analysis` },
          { label: "Review approvals", href: `/projects/${project.id}/approvals` },
        ]}
      />

      {feedbackMessage ? (
        <div className="rounded-3xl border border-[rgba(50,95,155,0.18)] bg-[rgba(50,95,155,0.08)] px-5 py-4 text-sm text-[var(--signal-blue)]">
          {feedbackMessage}
        </div>
      ) : null}

      <SectionCard eyebrow="Generation" title="Grounded doctrine draft generation">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p>Generate or refresh the doctrine draft from the latest analysis.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge label={latestAnalysisRun ? `Analysis v${latestAnalysisRun.version} ready` : "Analysis required"} tone={latestAnalysisRun ? "success" : "warning"} />
              <StatusBadge label={`Gemini ${process.env.GEMINI_API_KEY ? "configured" : "pending"}`} tone={process.env.GEMINI_API_KEY ? "success" : "warning"} />
            </div>
          </div>
          <form action={`/api/projects/${project.id}/doctrine/generate`} method="post" className="w-full max-w-xl space-y-3">
            <textarea
              name="feedback"
              rows={3}
              className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--signal-blue)]"
              placeholder="Optional feedback"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-surface-rail rounded-full px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5"
                disabled={!latestAnalysisRun}
              >
                {latestDoctrineVersion ? "Regenerate doctrine draft" : "Generate doctrine draft"}
              </button>
            </div>
          </form>
        </div>
      </SectionCard>

      {latestDoctrineVersion ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <SectionCard eyebrow="Current draft" title={`Doctrine v${latestDoctrineVersion.version}`}>
              <p>{latestDoctrineVersion.content.summary}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <StatusBadge label={latestDoctrineVersion.status} tone={toneFromState(latestDoctrineVersion.status)} />
                <StatusBadge label={`Based on analysis ${latestDoctrineVersion.analysisRunId ?? "manual"}`} tone="info" />
                <StatusBadge label={`Updated ${new Date(latestDoctrineVersion.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`} tone="neutral" />
              </div>
              {latestDoctrineVersion.revisionFeedback ? (
                <div className="mt-4 rounded-3xl border border-[rgba(183,113,25,0.18)] bg-[rgba(183,113,25,0.08)] px-4 py-3 text-sm text-[var(--signal-amber)]">
                  Revision feedback: {latestDoctrineVersion.revisionFeedback}
                </div>
              ) : null}
            </SectionCard>

            <SectionCard eyebrow="Version history" title="Stored doctrine versions">
              <div className="space-y-3">
                {recentDoctrineVersions.map((doctrineVersion) => (
                  <article key={doctrineVersion.id} className="surface-item p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-[var(--ink-950)]">v{doctrineVersion.version}</p>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge label={doctrineVersion.status} tone={toneFromState(doctrineVersion.status)} />
                        <StatusBadge label={new Date(doctrineVersion.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} tone="neutral" />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </SectionCard>
          </div>

          <SectionCard eyebrow="Editable doctrine" title="Edit before approval">
            <form action={`/api/projects/${project.id}/doctrine/save`} method="post" className="space-y-4">
              <input type="hidden" name="doctrineId" value={latestDoctrineVersion.id} />
              <div>
                <label htmlFor="summary" className="mb-2 block text-sm font-medium text-[var(--ink-950)]">
                  Summary
                </label>
                <textarea
                  id="summary"
                  name="summary"
                  rows={5}
                  defaultValue={latestDoctrineVersion.content.summary}
                  className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--signal-blue)]"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <label htmlFor="architecturePatterns" className="mb-2 block text-sm font-medium text-[var(--ink-950)]">
                    Architectural patterns
                  </label>
                  <textarea
                    id="architecturePatterns"
                    name="architecturePatterns"
                    rows={8}
                    defaultValue={joinLines(latestDoctrineVersion.content.architecturePatterns)}
                    className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--signal-blue)]"
                  />
                </div>
                <div>
                  <label htmlFor="uxPatterns" className="mb-2 block text-sm font-medium text-[var(--ink-950)]">
                    UX patterns
                  </label>
                  <textarea
                    id="uxPatterns"
                    name="uxPatterns"
                    rows={8}
                    defaultValue={joinLines(latestDoctrineVersion.content.uxPatterns)}
                    className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--signal-blue)]"
                  />
                </div>
                <div>
                  <label htmlFor="interactionPatterns" className="mb-2 block text-sm font-medium text-[var(--ink-950)]">
                    Interaction patterns
                  </label>
                  <textarea
                    id="interactionPatterns"
                    name="interactionPatterns"
                    rows={8}
                    defaultValue={joinLines(latestDoctrineVersion.content.interactionPatterns)}
                    className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--signal-blue)]"
                  />
                </div>
                <div>
                  <label htmlFor="groundingReferences" className="mb-2 block text-sm font-medium text-[var(--ink-950)]">
                    Grounding references
                  </label>
                  <textarea
                    id="groundingReferences"
                    name="groundingReferences"
                    rows={8}
                    defaultValue={joinLines(latestDoctrineVersion.content.groundingReferences)}
                    className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--signal-blue)]"
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <label htmlFor="criticalRules" className="mb-2 block text-sm font-medium text-[var(--ink-950)]">
                    Critical rules
                  </label>
                  <textarea
                    id="criticalRules"
                    name="criticalRules"
                    rows={8}
                    defaultValue={joinLines(latestDoctrineVersion.content.criticalRules)}
                    className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--signal-blue)]"
                  />
                </div>
                <div>
                  <label htmlFor="antiPatterns" className="mb-2 block text-sm font-medium text-[var(--ink-950)]">
                    Anti-patterns
                  </label>
                  <textarea
                    id="antiPatterns"
                    name="antiPatterns"
                    rows={8}
                    defaultValue={joinLines(latestDoctrineVersion.content.antiPatterns)}
                    className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--signal-blue)]"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-surface-rail rounded-full px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5"
                >
                  Save doctrine edits
                </button>
              </div>
            </form>
          </SectionCard>
        </>
      ) : (
        <SectionCard eyebrow="No doctrine yet" title="Generate the first draft">
          <p>
            No doctrine version has been generated yet.
          </p>
        </SectionCard>
      )}
    </div>
  );
}