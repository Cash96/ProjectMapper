import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { ResetIntelligenceButton } from "@/components/reset-intelligence-button";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { StepRail, StickyNextActionBar, WorkflowHero } from "@/components/workflow-primitives";
import { buildCanonicalWorkflowSteps, countCompletedWorkflowSteps, getCanonicalWorkflowHref, getCanonicalWorkflowStep, type CanonicalWorkflowStepNumber } from "@/lib/canonical-workflow";
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
  activeStep: CanonicalWorkflowStepNumber;
  repoStates: Array<{ name: string; studied: boolean }>;
  featureCount: number;
  mappingCount: number;
  doctrineState: string;
}) {
  if (input.activeStep === 1) {
    const unstagedRepos = input.repoStates.filter((state) => !state.studied);

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

  if (input.activeStep === 2) {
    return {
      eyebrow: "Immediate next move",
      title: input.doctrineState === "Approved" ? "Resolve the remaining repo questions" : "Approve the repository rules",
      description: input.doctrineState === "Approved"
        ? "Use the understanding workspace to answer open clarification questions so feature work starts from grounded repo knowledge."
        : "Before the workflow can generate stable feature proposals, the repo-understanding phase still needs its doctrine and answers locked down.",
      action: { label: "Open Understanding", href: `/projects/${input.projectId}/understanding` },
      badges: [{ label: input.doctrineState, tone: input.doctrineState === "Approved" ? "success" as const : "warning" as const }],
    };
  }

  if (input.activeStep === 3) {
    return {
      eyebrow: "Immediate next move",
      title: "Create the migration inventory",
      description: "Refresh feature discovery from Repo 1 or add a manual topic so migration work can move from repo understanding into feature-sized units.",
      action: { label: "Open Features", href: `/projects/${input.projectId}/features` },
      badges: [{ label: "Inventory empty", tone: "warning" as const }],
    };
  }

  if (input.activeStep === 4) {
    return {
      eyebrow: "Immediate next move",
      title: "Choose the next feature flow",
      description: "The inventory exists. Select the single feature that should move into proposal work next and keep the rest collapsed behind it.",
      action: { label: "Open Features", href: `/projects/${input.projectId}/features` },
      badges: [{ label: `${input.featureCount} tracked`, tone: "info" as const }],
    };
  }

  if (input.mappingCount === 0) {
    return {
      eyebrow: "Immediate next move",
      title: "Open the active feature",
      description: "A feature has been selected, but the proposal boundary has not been established yet. Move the selected feature into proposal work.",
      action: { label: "Open Features", href: `/projects/${input.projectId}/features` },
      badges: [{ label: "Proposal not started", tone: "warning" as const }],
    };
  }

  return {
    eyebrow: "Immediate next move",
    title: "Continue the active feature workflow",
    description: "The project is past inventory setup. The only thing that should move now is the currently active feature through proposal, execution, and review.",
    action: { label: "Open Features", href: `/projects/${input.projectId}/features` },
    badges: [{ label: `${input.mappingCount} mapping${input.mappingCount === 1 ? "" : "s"}`, tone: "info" as const }],
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
    studied: Boolean(studySnapshots[index]?.usable),
  }));
  const repoStudyComplete = repoStates.every((entry) => entry.studied);
  const understandingComplete = repoStudyComplete
    && repoStates.every((entry) => {
      const latestRun = entry.snapshot?.latestRun;
      const openQuestions = latestRun?.operatorQuestions.length ?? 0;
      const guidanceEntries = latestRun?.operatorGuidance.length ?? 0;

      return openQuestions === 0 || guidanceEntries > 0;
    })
    && project.doctrine.approvalState === "Approved";
  const featureGenerationComplete = features.length > 0;
  const featureSelectionComplete = studiedFeatures > 0 || mappings.length > 0;
  const activeStep: CanonicalWorkflowStepNumber = !repoStudyComplete
    ? 1
    : !understandingComplete
      ? 2
      : !featureGenerationComplete
        ? 3
        : !featureSelectionComplete
          ? 4
          : 5;
  const workflowSteps = buildCanonicalWorkflowSteps({
    activeStep,
    stateByStep: {
      1: repoStudyComplete ? "complete" : "in-progress",
      2: understandingComplete ? "complete" : repoStudyComplete ? "in-progress" : "not-started",
      3: featureGenerationComplete ? "complete" : understandingComplete ? "in-progress" : "not-started",
      4: featureSelectionComplete ? "complete" : featureGenerationComplete ? "ready" : "not-started",
      5: activeStep === 5 ? "in-progress" : featureSelectionComplete ? "ready" : "not-started",
      6: "not-started",
      7: "not-started",
      8: "not-started",
      9: "not-started",
      10: "not-started",
    },
    descriptionByStep: {
      1: repoStudyComplete ? "Both repos have a usable current study snapshot." : "Study Repo 1 and Repo 2 before moving downstream.",
      2: understandingComplete
        ? "Repository questions are resolved and the rules are approved."
        : project.doctrine.approvalState === "Approved"
          ? "Answer the remaining repo understanding questions."
          : "Use the understanding workspace to resolve questions and approve the governing rules.",
      3: featureGenerationComplete ? `${features.length} topic${features.length === 1 ? "" : "s"} are in the queue.` : "Generate the migration inventory once repo understanding is settled.",
      4: featureSelectionComplete ? "A feature flow has already been opened and moved forward." : "Select the single feature that should move next.",
      5: featureSelectionComplete ? "Move the selected feature into proposal work." : "Proposal work stays blocked until a feature is selected.",
    },
    badgesByStep: {
      1: repoStates.map((entry) => ({ label: getRepositoryStudyOrdinal(entry.repository), tone: entry.studied ? "success" as const : "warning" as const })),
      2: [{ label: project.doctrine.approvalState, tone: project.doctrine.approvalState === "Approved" ? "success" as const : "warning" as const }],
      3: [{ label: `${features.length} tracked`, tone: features.length > 0 ? "info" as const : "warning" as const }],
      4: featureGenerationComplete ? [{ label: `${studiedFeatures} in motion`, tone: studiedFeatures > 0 ? "info" as const : "neutral" as const }] : undefined,
    },
    hrefByStep: {
      1: getCanonicalWorkflowHref(projectId, 1),
      2: getCanonicalWorkflowHref(projectId, 2),
      3: getCanonicalWorkflowHref(projectId, 3),
      4: getCanonicalWorkflowHref(projectId, 4),
      5: getCanonicalWorkflowHref(projectId, 5),
      6: getCanonicalWorkflowHref(projectId, 6),
      7: getCanonicalWorkflowHref(projectId, 7),
      8: getCanonicalWorkflowHref(projectId, 8),
      9: getCanonicalWorkflowHref(projectId, 9),
      10: getCanonicalWorkflowHref(projectId, 10),
    },
  });
  const activeWorkflowStep = getCanonicalWorkflowStep(activeStep);
  const completedWorkflowSteps = countCompletedWorkflowSteps(workflowSteps);
  const nextAction = getNextAction({
    projectId,
    activeStep,
    repoStates: repoStates.map((entry) => ({ name: entry.repository.role === "Source" ? "Repo 1" : "Repo 2", studied: entry.studied })),
    featureCount: features.length,
    mappingCount: mappings.length,
    doctrineState: project.doctrine.approvalState,
  });
  const activeFeature = features.find((feature) => Boolean(feature.latestSourceStudyRunId || feature.latestTargetStudyRunId)) ?? features[0] ?? null;
  const currentBlocker = activeStep <= 2
    ? nextAction.title
    : activeStep === 3
      ? "Feature inventory has not been generated yet."
      : activeStep === 4
        ? "No single feature has been moved into proposal work yet."
        : "No blocking issue is preventing the active feature from moving forward.";
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
        title="Migration command"
        description="Where the migration stands, what is active now, and what should happen next."
        status={project.status}
        actions={[
          { label: "System Knowledge", href: `/projects/${project.id}/understanding` },
          { label: "Features", href: `/projects/${project.id}/features` },
        ]}
      />

      {feedbackMessage ? (
        <div className={error ? "callout-danger" : "callout-info"}>{feedbackMessage}</div>
      ) : null}

      <WorkflowHero
        stepLabel={`Step ${activeWorkflowStep.number}: ${activeWorkflowStep.title}`}
        progressLabel={`${completedWorkflowSteps} of 10 complete`}
        title={nextAction.title}
        description={nextAction.description}
        state={workflowSteps.find((step) => step.number === activeWorkflowStep.number)?.state ?? "not-started"}
        badges={nextAction.badges}
      />

      <StickyNextActionBar
        stepLabel={`Step ${activeWorkflowStep.number}: ${activeWorkflowStep.title}`}
        description={nextAction.title}
        action={nextAction.action}
      />

      <SectionCard eyebrow="Current stage" title={activeWorkflowStep.title}>
        <div className="focus-panel">
          <p className="focus-panel-title">Step {activeWorkflowStep.number} is the current stage.</p>
          <p className="focus-panel-summary">{workflowSteps.find((step) => step.number === activeWorkflowStep.number)?.description}</p>
          <div className="workflow-stage-meta">
            <StatusBadge label={`${completedWorkflowSteps} complete`} tone="info" />
            {nextAction.badges?.map((badge) => (
              <StatusBadge key={badge.label} label={badge.label} tone={badge.tone} />
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Current work" title="What is active now">
        <div className="compact-stack">
          <div className="compact-row">
            <div className="compact-row-main">
              <p className="compact-row-title">Active feature</p>
              <p className="compact-row-summary">
                {activeFeature
                  ? `${activeFeature.canonicalName}. ${activeFeature.summary}`
                  : "No feature is active yet. The workflow is still building toward the first feature selection."}
              </p>
            </div>
            <div className="compact-row-meta">
              {activeFeature ? (
                <>
                  <StatusBadge label={activeFeature.status} tone="info" />
                  <Link href={`/projects/${project.id}/features/${activeFeature.id}`} className="control-button-secondary">
                    Open active feature
                  </Link>
                </>
              ) : (
                <StatusBadge label="No active feature" tone="warning" />
              )}
            </div>
          </div>
          <div className="compact-row">
            <div className="compact-row-main">
              <p className="compact-row-title">Current blocker</p>
              <p className="compact-row-summary">{currentBlocker}</p>
            </div>
            <div className="compact-row-meta">
              <StatusBadge label={activeStep <= 4 ? "Blocking progress" : "No blocker"} tone={activeStep <= 4 ? "warning" : "success"} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Repo readiness" title="Foundation status">
        <div className="compact-stack">
          {repoStates.map(({ repository, snapshot }) => (
            <article key={repository.id} className="compact-row">
              <div className="compact-row-main">
                <p className="compact-row-title">{getRepositoryStudyOrdinal(repository)}</p>
                <p className="compact-row-summary">{repository.notes}</p>
                <details className="detail-shell">
                  <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">View details</summary>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{snapshot.statusDetail}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">Last study {formatTimestamp(snapshot.lastStudiedAt)}</p>
                </details>
              </div>
              <div className="compact-row-meta">
                <StatusBadge label={snapshot.statusLabel} tone={snapshot.statusTone} />
                <StatusBadge label={snapshot.latestVersionLabel === "None" ? "Not started" : snapshot.latestVersionLabel} tone="info" />
                <form action={`/api/projects/${project.id}/repositories/${repository.id}/study`} method="post">
                  <button type="submit" className="control-button-primary">
                    {repository.role === "Source" ? "Study Repo 1" : "Study Repo 2"}
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <details>
        <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">View full workflow</summary>
        <div className="mt-4">
          <SectionCard eyebrow="Workflow" title="Completed and remaining">
            <StepRail steps={workflowSteps} />
          </SectionCard>
        </div>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">Optional reset</summary>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/projects/${project.id}/understanding`} className="control-button-secondary inline-flex">
            Open System Knowledge
          </Link>
          <ResetIntelligenceButton action={`/api/projects/${project.id}/intelligence/reset`} />
        </div>
      </details>
    </div>
  );
}