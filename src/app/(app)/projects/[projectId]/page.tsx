import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { ResetIntelligenceButton } from "@/components/reset-intelligence-button";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { NextActionCard, StepRail } from "@/components/workflow-primitives";
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

function getNextAction(input: {
  projectId: string;
  repoStates: Array<{ name: string; studied: boolean }>;
  featureCount: number;
  studiedFeatureCount: number;
  mappingCount: number;
  doctrineState: string;
}) {
  const unstagedRepos = input.repoStates.filter((state) => !state.studied);

  if (unstagedRepos.length > 0) {
    return {
      eyebrow: "Immediate next move",
      title: "Complete repository understanding",
      description: `Run and review ${unstagedRepos.map((state) => state.name).join(" and ")} so the migration has grounded source and target context before feature decisions start.`,
      action: { label: "Open Understanding", href: `/projects/${input.projectId}/understanding` },
      badges: [
        { label: `${unstagedRepos.length} repo${unstagedRepos.length === 1 ? "" : "s"} pending`, tone: "warning" as const },
      ],
    };
  }

  if (input.featureCount === 0) {
    return {
      eyebrow: "Immediate next move",
      title: "Create the migration inventory",
      description: "Refresh feature discovery from Repo 1 or add a manual topic so migration work can move from repo understanding into feature-sized units.",
      action: { label: "Open Features", href: `/projects/${input.projectId}/features` },
      badges: [{ label: "Inventory empty", tone: "warning" as const }],
    };
  }

  if (input.studiedFeatureCount < input.featureCount) {
    return {
      eyebrow: "Immediate next move",
      title: "Finish studying priority features",
      description: "The inventory exists, but not every migration unit has enough Repo 1 and Repo 2 context to compare and propose implementation direction.",
      action: { label: "Continue Feature Work", href: `/projects/${input.projectId}/features` },
      badges: [{ label: `${input.studiedFeatureCount}/${input.featureCount} studied`, tone: "info" as const }],
    };
  }

  if (input.mappingCount < input.featureCount) {
    return {
      eyebrow: "Immediate next move",
      title: "Turn studies into mappings",
      description: "Refresh source-target mappings so the system can distinguish what already exists, what is partial, and what still needs to be designed in Repo 2.",
      action: { label: "Open Feature Mappings", href: `/projects/${input.projectId}/features` },
      badges: [{ label: `${input.mappingCount}/${input.featureCount} mapped`, tone: "info" as const }],
    };
  }

  if (input.doctrineState !== "Approved") {
    return {
      eyebrow: "Immediate next move",
      title: "Approve the governing doctrine",
      description: "Before proposals become stable build boundaries, the project still needs approved Repo 2 doctrine to define architectural and product rules.",
      action: { label: "Open Doctrine", href: `/projects/${input.projectId}/understanding` },
      badges: [{ label: input.doctrineState, tone: "warning" as const }],
    };
  }

  return {
    eyebrow: "Immediate next move",
    title: "Generate or review implementation proposals",
    description: "Core migration context is in place. The highest-value action now is refining feature proposals and, once approved, moving them into controlled execution.",
    action: { label: "Open Features", href: `/projects/${input.projectId}/features` },
    badges: [{ label: "Ready for proposals", tone: "success" as const }],
  };
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
  const repoStates = project.repositories.map((repository, index) => ({
    repository,
    snapshot: studySnapshots[index],
    studied: Boolean(studySnapshots[index]?.lastStudiedAt),
  }));
  const nextAction = getNextAction({
    projectId,
    repoStates: repoStates.map((entry) => ({ name: entry.repository.role === "Source" ? "Repo 1" : "Repo 2", studied: entry.studied })),
    featureCount: features.length,
    studiedFeatureCount: studiedFeatures,
    mappingCount: mappings.length,
    doctrineState: project.doctrine.approvalState,
  });
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
        description="Next step first."
        status={project.status}
        actions={[
          { label: "System Knowledge", href: `/projects/${project.id}/understanding` },
          { label: "Features", href: `/projects/${project.id}/features` },
        ]}
      />

      {feedbackMessage ? (
        <div className={error ? "callout-danger" : "callout-info"}>{feedbackMessage}</div>
      ) : null}

      <NextActionCard
        eyebrow="Next Step"
        title={nextAction.title}
        description={nextAction.badges[0]?.label ?? nextAction.description}
        action={nextAction.action}
        badges={nextAction.badges}
      />

      <SectionCard eyebrow="Progress" title="Current stage">
          <StepRail
            steps={[
              {
                number: 1,
                title: "Repo knowledge",
                description: repoStates.every((entry) => entry.studied) ? "Done" : "In progress",
                state: repoStates.every((entry) => entry.studied) ? "complete" : "current",
              },
              {
                number: 2,
                title: "Features",
                description: `${features.length} found`,
                state: features.length > 0 ? "complete" : repoStates.every((entry) => entry.studied) ? "current" : "upcoming",
              },
              {
                number: 3,
                title: "Compare + rules",
                description: `${mappings.length} ready`,
                state: mappings.length > 0 && project.doctrine.approvalState === "Approved"
                  ? "complete"
                  : features.length > 0
                    ? "current"
                    : "upcoming",
              },
              {
                number: 4,
                title: "Proposal",
                description: project.doctrine.approvalState === "Approved" ? "Ready" : "Waiting on rules",
                state: mappings.length > 0 && project.doctrine.approvalState === "Approved" ? "current" : "upcoming",
              },
            ]}
          />
      </SectionCard>

      <SectionCard eyebrow="Repos" title="Status">
          <div className="space-y-4">
            {repoStates.map(({ repository, snapshot }) => {

              return (
                <article key={repository.id} className="selection-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-[var(--ink-950)]">{getRepositoryStudyOrdinal(repository)}</p>
                    </div>
                    <StatusBadge label={snapshot.statusLabel} tone={snapshot.statusTone} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge label={snapshot.latestVersionLabel === "None" ? "Not started" : snapshot.latestVersionLabel} tone="info" />
                    <StatusBadge label={snapshot.stale ? "Stale" : "Fresh"} tone={snapshot.stale ? "warning" : "success"} />
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <form action={`/api/projects/${project.id}/repositories/${repository.id}/study`} method="post">
                      <button type="submit" className="control-button-primary w-full sm:w-auto">
                        {repository.role === "Source" ? "Run Repo 1 Study" : "Run Repo 2 Study"}
                      </button>
                    </form>
                    <Link href={`/projects/${project.id}/understanding`} className="control-button-secondary">
                      Open System Knowledge
                    </Link>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">View details</summary>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{repository.notes}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">Last study {formatTimestamp(snapshot.lastStudiedAt)}</p>
                  </details>
                </article>
              );
            })}
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">Optional actions</summary>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/projects/${project.id}/understanding`} className="control-button-secondary inline-flex">
                Open Rules
              </Link>
              <ResetIntelligenceButton action={`/api/projects/${project.id}/intelligence/reset`} />
            </div>
          </details>
      </SectionCard>
    </div>
  );
}