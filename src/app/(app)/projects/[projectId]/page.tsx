import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { ResetIntelligenceButton } from "@/components/reset-intelligence-button";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { listFeatureInventory, listFeatureMappingSummaries } from "@/lib/feature-store";
import { getProject } from "@/lib/project-helpers";
import { getRepositoryStudyOrdinal, getRepositoryStudySnapshot } from "@/lib/repo-study";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ProjectDetailPage({ params, searchParams }: ProjectPageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await getProject(projectId);
  const [studySnapshots, features, mappings] = await Promise.all([
    Promise.all(project.repositories.map((repository) => getRepositoryStudySnapshot(projectId, repository))),
    listFeatureInventory(projectId),
    listFeatureMappingSummaries(projectId),
  ]);
  const studiedFeatures = features.filter((feature) => feature.latestSourceStudyRunId || feature.latestTargetStudyRunId).length;
  const error = getSearchValue(query.error);
  const reset = getSearchValue(query.reset);
  const feedbackMessage = error
    ? error
    : reset === "complete"
      ? "Project intelligence reset complete. You are back at a clean starting state."
      : undefined;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Home"
        title={project.name}
        description="System state, next actions, and reset control from a single entry point."
        status={project.status}
        actions={[
          { label: "Understanding", href: `/projects/${project.id}/understanding` },
          { label: "Features", href: `/projects/${project.id}/features` },
        ]}
      />

      {feedbackMessage ? (
        <div className={error ? "callout-danger" : "callout-info"}>{feedbackMessage}</div>
      ) : null}

      <SectionCard eyebrow="System state" title="At a glance">
        <p>{project.mission}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="surface-item p-4">
            <p className="section-label text-[var(--ink-500)]">Features discovered</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-950)]">{features.length}</p>
          </div>
          <div className="surface-item p-4">
            <p className="section-label text-[var(--ink-500)]">Features studied</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-950)]">{studiedFeatures}</p>
          </div>
          <div className="surface-item p-4">
            <p className="section-label text-[var(--ink-500)]">Mappings available</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-950)]">{mappings.length}</p>
          </div>
          <div className="surface-item p-4">
            <p className="section-label text-[var(--ink-500)]">Operator</p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-[var(--ink-950)]">{project.operator}</p>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard eyebrow="Repositories" title="Study status">
          <div className="space-y-4">
            {project.repositories.map((repository, index) => {
              const snapshot = studySnapshots[index];

              return (
                <article key={repository.id} className="surface-item p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="section-label text-[var(--ink-500)]">{getRepositoryStudyOrdinal(repository)}</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--ink-950)]">{repository.name}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{repository.notes}</p>
                    </div>
                    <StatusBadge label={snapshot.statusLabel} tone={snapshot.statusTone} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge label={snapshot.latestVersionLabel === "None" ? "No study yet" : `Latest ${snapshot.latestVersionLabel}`} tone="info" />
                    <StatusBadge label={snapshot.stale ? "Stale" : "Fresh"} tone={snapshot.stale ? "warning" : "success"} />
                    <StatusBadge label={`Last study ${formatTimestamp(snapshot.lastStudiedAt)}`} tone="neutral" />
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <form action={`/api/projects/${project.id}/repositories/${repository.id}/study`} method="post">
                      <button type="submit" className="control-button-primary w-full sm:w-auto">
                        {repository.role === "Source" ? "Run Repo 1 Study" : "Run Repo 2 Study"}
                      </button>
                    </form>
                    <Link href={`/projects/${project.id}/understanding`} className="control-button-secondary">
                      View understanding
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Actions" title="Next steps">
          <div className="space-y-4">
            <div className="surface-item p-4 sm:p-5">
              <p className="font-medium text-[var(--ink-950)]">Move to understanding</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">Read the combined Repo 1 and Repo 2 intelligence, AI questions, and guidance history.</p>
              <Link href={`/projects/${project.id}/understanding`} className="control-button-secondary mt-4 inline-flex">Open Understanding</Link>
            </div>

            <div className="surface-item p-4 sm:p-5">
              <p className="font-medium text-[var(--ink-950)]">Start feature work</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">Discover topics from Repo 1 or continue focused feature studies and mappings.</p>
              <Link href={`/projects/${project.id}/features`} className="control-button-secondary mt-4 inline-flex">Open Features</Link>
            </div>

            <div className="surface-item p-4 sm:p-5">
              <p className="font-medium text-[var(--ink-950)]">Reset intelligence</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">Wipe all studies, features, mappings, doctrine versions, reports, and AI outputs while preserving this project and its repo connections.</p>
              <div className="mt-4">
                <ResetIntelligenceButton action={`/api/projects/${project.id}/intelligence/reset`} />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard eyebrow="Doctrine" title="Current grounding state">
        <p>{project.doctrine.summary}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <StatusBadge label={project.doctrine.approvalState} tone={project.doctrine.approvalState === "Approved" ? "success" : project.doctrine.approvalState === "Awaiting Approval" ? "warning" : "neutral"} />
          <StatusBadge label={project.doctrine.version} tone="info" />
          <StatusBadge label={`Updated ${project.doctrine.lastUpdatedAt}`} tone="neutral" />
        </div>
      </SectionCard>
    </div>
  );
}