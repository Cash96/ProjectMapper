import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { getLatestAnalysisRun, getRecentAnalysisRuns } from "@/lib/analysis-store";
import { getProject } from "@/lib/project-helpers";

type AnalysisPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function AnalysisArtifactCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4">
      <p className="font-medium text-[var(--ink-950)]">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm">No matches were found in the latest run.</p>
      )}
    </div>
  );
}

export default async function AnalysisPage({ params, searchParams }: AnalysisPageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await getProject(projectId);
  const latestRun = await getLatestAnalysisRun(projectId);
  const recentRuns = await getRecentAnalysisRuns(projectId, 5);
  const analysisStatus = getSearchValue(query.analysis);
  const version = getSearchValue(query.version);
  const error = getSearchValue(query.error);
  const feedbackMessage = error
    ? error
    : analysisStatus && version
      ? `Analysis run v${version} finished with status ${analysisStatus}.`
      : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Analysis"
        title="Analysis"
        description="Stored repo snapshots and artifacts."
        actions={[{ label: "Open doctrine", href: `/projects/${project.id}/doctrine` }]}
      />

      {feedbackMessage ? (
        <div className="rounded-3xl border border-[rgba(50,95,155,0.18)] bg-[rgba(50,95,155,0.08)] px-5 py-4 text-sm text-[var(--signal-blue)]">
          {feedbackMessage}
        </div>
      ) : null}

      <SectionCard eyebrow="Controls" title="Run or refresh analysis">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p>Run analysis and store a versioned repo snapshot.</p>
            {latestRun ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">
                Latest run: v{latestRun.version} by {latestRun.triggeredBy}
              </p>
            ) : null}
          </div>
          <form action={`/api/projects/${project.id}/analysis/run`} method="post">
            <button
              type="submit"
              className="bg-surface-rail rounded-full px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5"
            >
              {latestRun ? "Re-run analysis" : "Run analysis"}
            </button>
          </form>
        </div>
      </SectionCard>

      {latestRun ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <SectionCard eyebrow="Latest run" title={`Analysis run v${latestRun.version}`}>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={latestRun.status} tone={latestRun.status === "Complete" ? "success" : "danger"} />
                <StatusBadge label={`Triggered by ${latestRun.triggeredBy}`} tone="info" />
                <StatusBadge label={new Date(latestRun.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} tone="neutral" />
              </div>
              <ul className="mt-4 space-y-3">
                {latestRun.summary.map((line) => (
                  <li key={line} className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4">
                    {line}
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard eyebrow="Run history" title="Recent versions">
              <div className="space-y-3">
                {recentRuns.map((run) => (
                  <article key={run.id} className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-[var(--ink-950)]">v{run.version}</p>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge label={run.status} tone={run.status === "Complete" ? "success" : "danger"} />
                        <StatusBadge label={new Date(run.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} tone="neutral" />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </SectionCard>
          </div>

          {[latestRun.repoA, latestRun.repoB].map((artifact) => (
            <SectionCard
              key={artifact.repositoryId}
              eyebrow={artifact.role}
              title={`${artifact.repositoryName} analysis`}
            >
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={artifact.fullName} tone="info" />
                <StatusBadge label={`Branch ${artifact.defaultBranch}`} tone="neutral" />
                <StatusBadge label={artifact.visibility} tone="neutral" />
              </div>

              {artifact.error ? (
                <p className="mt-4 text-sm leading-6 text-[var(--signal-red)]">{artifact.error}</p>
              ) : (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <AnalysisArtifactCard title="Top-level entries" items={artifact.topLevelEntries} />
                  <AnalysisArtifactCard title="Config files" items={artifact.configFiles} />
                  <AnalysisArtifactCard title="Routes" items={artifact.routeFiles} />
                  <AnalysisArtifactCard title="Components" items={artifact.componentFiles} />
                  <AnalysisArtifactCard title="Models" items={artifact.modelFiles} />
                  <AnalysisArtifactCard title="AI files" items={artifact.aiFiles} />
                  <AnalysisArtifactCard title="Workflows" items={artifact.workflowFiles} />
                  <div className="surface-item p-4">
                    <p className="font-medium text-[var(--ink-950)]">Important directories</p>
                    <div className="mt-3 space-y-3">
                      {artifact.importantDirectories.map((directory) => (
                        <article key={directory.path}>
                          <p className="font-medium text-[var(--ink-950)]">{directory.path}</p>
                          <p className="text-sm">{directory.note}</p>
                          <ul className="mt-2 space-y-1 text-sm">
                            {directory.samplePaths.map((samplePath) => (
                              <li key={samplePath}>{samplePath}</li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {artifact.keyFileExcerpts.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {artifact.keyFileExcerpts.map((excerpt) => (
                    <article key={excerpt.path} className="surface-item p-4">
                      <p className="font-medium text-[var(--ink-950)]">{excerpt.path}</p>
                      <p className="mt-1 text-sm text-[var(--ink-500)]">{excerpt.reason}</p>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-[var(--ink-700)]">{excerpt.excerpt}</pre>
                    </article>
                  ))}
                </div>
              ) : null}
            </SectionCard>
          ))}
        </>
      ) : (
        <SectionCard eyebrow="No analysis yet" title="Run the first snapshot">
          <p>
            No persisted analysis run exists yet.
          </p>
        </SectionCard>
      )}
    </div>
  );
}