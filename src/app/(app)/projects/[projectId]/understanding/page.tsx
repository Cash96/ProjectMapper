import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ResetIntelligenceButton } from "@/components/reset-intelligence-button";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { FieldShell, NextActionCard, SegmentedLinkTabs, StepRail, StickyNextActionBar, WorkflowHero } from "@/components/workflow-primitives";
import { getLatestAnalysisRun } from "@/lib/analysis-store";
import { buildCanonicalWorkflowSteps, countCompletedWorkflowSteps, getCanonicalWorkflowHref, getCanonicalWorkflowStep, type CanonicalWorkflowStepNumber } from "@/lib/canonical-workflow";
import { getLatestDoctrineVersion } from "@/lib/doctrine-store";
import { getProject } from "@/lib/project-helpers";
import { getRepositoryStudyLabel, getRepositoryStudyOrdinal, getRepositoryStudySnapshot } from "@/lib/repo-study";
import { getRecentRepoStudyRuns } from "@/lib/repo-study-store";

type UnderstandingPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function toTextareaValue(items: string[]) {
  return items.join("\n");
}

function getDoctrineSection(
  content: Record<string, unknown>,
  key: string,
  fallbackKeys: string[] = [],
) {
  const direct = content[key];

  if (Array.isArray(direct)) {
    return direct.filter((entry): entry is string => typeof entry === "string");
  }

  for (const fallbackKey of fallbackKeys) {
    const fallback = content[fallbackKey];

    if (Array.isArray(fallback)) {
      return fallback.filter((entry): entry is string => typeof entry === "string");
    }
  }

  return [];
}

function StudyListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="surface-item-compact p-4">
      <p className="font-medium text-[var(--ink-950)]">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm">No captured items yet.</p>
      )}
    </div>
  );
}

type UnderstandingView = "repo-1" | "repo-2" | "questions" | "doctrine";

function isUnderstandingView(value: string | undefined): value is UnderstandingView {
  return value === "repo-1" || value === "repo-2" || value === "questions" || value === "doctrine";
}

export default async function UnderstandingPage({ params, searchParams }: UnderstandingPageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await getProject(projectId);
  const [sourceRepository, targetRepository] = [
    project.repositories.find((repository) => repository.role === "Source") ?? null,
    project.repositories.find((repository) => repository.role === "Target") ?? null,
  ];
  const [sourceSnapshot, targetSnapshot, latestAnalysisRun, latestDoctrineVersion, sourceHistory, targetHistory] = await Promise.all([
    sourceRepository ? getRepositoryStudySnapshot(projectId, sourceRepository) : null,
    targetRepository ? getRepositoryStudySnapshot(projectId, targetRepository) : null,
    getLatestAnalysisRun(projectId),
    getLatestDoctrineVersion(projectId),
    sourceRepository ? getRecentRepoStudyRuns(projectId, sourceRepository.id, 3) : Promise.resolve([]),
    targetRepository ? getRecentRepoStudyRuns(projectId, targetRepository.id, 3) : Promise.resolve([]),
  ]);

  const error = getSearchValue(query.error);
  const requestedRepositoryId = getSearchValue(query.repositoryId);
  const requestedView = getSearchValue(query.view);
  const repositoryStates = [sourceRepository, targetRepository]
    .filter((repository): repository is NonNullable<typeof repository> => Boolean(repository))
    .map((repository) => {
      const snapshot = repository.role === "Source" ? sourceSnapshot : targetSnapshot;
      const history = repository.role === "Source" ? sourceHistory : targetHistory;

      return {
        repository,
        snapshot,
        history,
        latestRun: snapshot?.latestRun ?? null,
      };
    });
  const selectedRepositoryState = repositoryStates.find((entry) => entry.repository.id === requestedRepositoryId)
    ?? repositoryStates[0]
    ?? null;
  const defaultView: UnderstandingView = requestedRepositoryId === targetRepository?.id ? "repo-2" : "repo-1";
  const activeView = isUnderstandingView(requestedView) ? requestedView : defaultView;
  const repoStudyComplete = repositoryStates.every((entry) => Boolean(entry.snapshot?.usable));
  const repoQuestionsResolved = repoStudyComplete && repositoryStates.every((entry) => {
    const openQuestions = entry.latestRun?.operatorQuestions.length ?? 0;
    const guidanceEntries = entry.latestRun?.operatorGuidance.length ?? 0;

    return openQuestions === 0 || guidanceEntries > 0;
  });
  const understandingComplete = repoQuestionsResolved && project.doctrine.approvalState === "Approved";
  const stepOneRepositoryState = repositoryStates.find((entry) => !entry.snapshot?.usable)
    ?? repositoryStates.find((entry) => entry.repository.id === requestedRepositoryId)
    ?? repositoryStates[0]
    ?? null;
  const stepTwoRepositoryState = repositoryStates.find((entry) => (entry.latestRun?.operatorQuestions.length ?? 0) > 0)
    ?? repositoryStates.find((entry) => entry.repository.id === requestedRepositoryId)
    ?? repositoryStates[0]
    ?? null;
  const activeStepNumber: CanonicalWorkflowStepNumber = !repoStudyComplete ? 1 : !understandingComplete ? 2 : 3;
  const activeRepositoryState = activeStepNumber === 1 ? stepOneRepositoryState : stepTwoRepositoryState;
  const focusedRepositoryState = selectedRepositoryState ?? activeRepositoryState;
  const focusedRepository = focusedRepositoryState?.repository ?? null;
  const focusedSnapshot = focusedRepositoryState?.snapshot ?? null;
  const focusedHistory = focusedRepositoryState?.history ?? [];
  const focusedLatestRun = focusedRepositoryState?.latestRun ?? null;
  const workflowRepository = activeRepositoryState?.repository ?? null;
  const doctrineApproval = project.approvals.find((entry) => entry.target.entity === "doctrine") ?? null;
  const feedbackMessage = error
    ? error
    : getSearchValue(query.reset) === "complete"
      ? "Project intelligence reset complete. The system is back to a fresh-start state."
      : getSearchValue(query.study) && getSearchValue(query.version)
        ? `${focusedRepository ? `${getRepositoryStudyOrdinal(focusedRepository)} ` : "Repo "}study v${getSearchValue(query.version)} ${String(getSearchValue(query.study)).replace(/-/g, " ")}.`
        : getSearchValue(query.guidance) === "saved" && getSearchValue(query.version)
          ? `${focusedRepository ? `${getRepositoryStudyOrdinal(focusedRepository)} ` : "Repo "}guidance saved on study v${getSearchValue(query.version)}.`
          : getSearchValue(query.doctrine) === "generated" && getSearchValue(query.version)
            ? `Doctrine v${getSearchValue(query.version)} generated.`
            : getSearchValue(query.doctrine) === "saved" && getSearchValue(query.version)
              ? `Doctrine v${getSearchValue(query.version)} saved and returned to review.`
              : getSearchValue(query.updated) === doctrineApproval?.id && getSearchValue(query.status) === "approved"
                ? "Doctrine approved. Proposal generation can now use it as grounded doctrine."
                : getSearchValue(query.updated) === doctrineApproval?.id && getSearchValue(query.status) === "revision-requested"
                  ? "Doctrine revision requested. Update the doctrine and resubmit it for approval."
            : undefined;
  const operatorQuestions = focusedLatestRun
    ? (focusedLatestRun.operatorQuestions ?? []).map((question, index) => ({
        ...question,
        id: `${focusedLatestRun.id}-${question.id || `question-${index + 1}`}`,
      }))
    : [];
  const guidanceEntries = focusedLatestRun
    ? [...(focusedLatestRun.operatorGuidance ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    : [];
  const statusCalloutTone = focusedSnapshot?.statusTone === "danger"
    ? "callout-danger"
    : focusedSnapshot?.statusTone === "warning"
      ? "callout-warning"
      : "callout-info";
  const workflowSteps = buildCanonicalWorkflowSteps({
    activeStep: activeStepNumber,
    stateByStep: {
      1: repoStudyComplete ? "complete" : "in-progress",
      2: understandingComplete ? "complete" : repoStudyComplete ? "in-progress" : "not-started",
      3: understandingComplete ? "ready" : "not-started",
      4: "not-started",
      5: "not-started",
      6: "not-started",
      7: "not-started",
      8: "not-started",
      9: "not-started",
      10: "not-started",
    },
    descriptionByStep: {
      1: repoStudyComplete ? "Repo 1 and Repo 2 both have usable study output." : "Finish the repo study passes before opening downstream work.",
      2: understandingComplete
        ? "Open repo questions are resolved and the governing rules are approved."
        : project.doctrine.approvalState === "Approved"
          ? "Resolve the remaining repo-specific questions and corrections."
          : "Answer open questions, save operator guidance, and approve the governing rules.",
      3: understandingComplete ? "The feature inventory can now be generated from grounded repo understanding." : "Feature generation stays blocked until understanding and rules are settled.",
    },
    badgesByStep: {
      1: repositoryStates.map((entry) => ({
        label: getRepositoryStudyOrdinal(entry.repository),
        tone: entry.snapshot?.usable ? "success" as const : "warning" as const,
      })),
      2: [{
        label: project.doctrine.approvalState,
        tone: project.doctrine.approvalState === "Approved" ? "success" as const : "warning" as const,
      }],
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
  const activeStep = getCanonicalWorkflowStep(activeStepNumber);
  const completedWorkflowSteps = countCompletedWorkflowSteps(workflowSteps);
  const nextAction = activeStepNumber === 1
    ? {
        title: workflowRepository ? `Study ${getRepositoryStudyOrdinal(workflowRepository)}` : "Study the next repository",
        description: workflowRepository
          ? `Stay inside ${getRepositoryStudyOrdinal(workflowRepository)} until its understanding is grounded and usable.`
          : "Complete repository study before switching contexts.",
        action: workflowRepository
          ? { label: getRepositoryStudyLabel(workflowRepository), href: `/projects/${project.id}/understanding?repositoryId=${workflowRepository.id}` }
          : undefined,
      }
    : !understandingComplete
      ? {
          title: operatorQuestions.length > 0 ? "Answer the open repo questions" : "Review and approve the governing rules",
          description: operatorQuestions.length > 0
            ? "Capture the missing operator answers that materially change repo understanding."
            : "Once the rules match the repo reality, approve them so feature generation can begin.",
          action: workflowRepository
            ? {
                label: operatorQuestions.length > 0 ? `Open ${getRepositoryStudyOrdinal(workflowRepository)} questions` : "Review doctrine",
                href: operatorQuestions.length > 0
                  ? `/projects/${project.id}/understanding?view=questions&repositoryId=${workflowRepository.id}`
                  : `/projects/${project.id}/understanding?view=doctrine${workflowRepository ? `&repositoryId=${workflowRepository.id}` : ""}`,
              }
            : undefined,
        }
      : {
          title: "Move into feature generation",
          description: "The repo-understanding phase is complete. Generate or review the feature inventory next.",
          action: { label: "Open Features", href: `/projects/${project.id}/features` },
        };
  const understandingViews = [
    ...repositoryStates.map(({ repository }) => ({
      label: getRepositoryStudyOrdinal(repository),
      href: `/projects/${project.id}/understanding?repositoryId=${repository.id}`,
      active: repository.id === focusedRepository?.id && (activeView === "repo-1" || activeView === "repo-2"),
    })),
    {
      label: "Questions",
      href: `/projects/${project.id}/understanding?view=questions${focusedRepository ? `&repositoryId=${focusedRepository.id}` : ""}`,
      active: activeView === "questions",
    },
    {
      label: "Rules",
      href: `/projects/${project.id}/understanding?view=doctrine${focusedRepository ? `&repositoryId=${focusedRepository.id}` : ""}`,
      active: activeView === "doctrine",
    },
  ];
  const repoOneState = repositoryStates.find((entry) => entry.repository.role === "Source") ?? null;
  const repoTwoState = repositoryStates.find((entry) => entry.repository.role === "Target") ?? null;
  const totalOpenQuestions = repositoryStates.reduce((total, entry) => total + (entry.latestRun?.operatorQuestions.length ?? 0), 0);
  const knowledgeLane: Array<{
    label: string;
    title: string;
    summary: string;
    href: string;
    actionLabel: string;
    badges: Array<{ label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }>;
    primary: boolean;
  }> = [
    repoOneState ? {
      label: "Repo 1 study",
      title: "Ground Repo 1",
      summary: repoOneState.snapshot?.usable
        ? repoOneState.latestRun?.understanding?.summary ?? "Repo 1 understanding is usable."
        : "Study the source system until its workflows, entities, and risks are grounded.",
      href: `/projects/${project.id}/understanding?repositoryId=${repoOneState.repository.id}`,
      actionLabel: repoOneState.snapshot?.usable ? "Review Repo 1" : "Study Repo 1",
      badges: [
        { label: repoOneState.snapshot?.statusLabel ?? "Not started", tone: repoOneState.snapshot?.statusTone ?? "warning" as const },
        { label: repoOneState.snapshot?.latestVersionLabel === "None" ? "No runs" : repoOneState.snapshot?.latestVersionLabel ?? "No runs", tone: "info" as const },
      ],
      primary: workflowRepository?.id === repoOneState.repository.id && activeStepNumber === 1,
    } : null,
    repoTwoState ? {
      label: "Repo 2 study",
      title: "Ground Repo 2",
      summary: repoTwoState.snapshot?.usable
        ? repoTwoState.latestRun?.understanding?.summary ?? "Repo 2 understanding is usable."
        : "Study the target system until its architecture and design rules are clear.",
      href: `/projects/${project.id}/understanding?repositoryId=${repoTwoState.repository.id}`,
      actionLabel: repoTwoState.snapshot?.usable ? "Review Repo 2" : "Study Repo 2",
      badges: [
        { label: repoTwoState.snapshot?.statusLabel ?? "Not started", tone: repoTwoState.snapshot?.statusTone ?? "warning" as const },
        { label: repoTwoState.snapshot?.latestVersionLabel === "None" ? "No runs" : repoTwoState.snapshot?.latestVersionLabel ?? "No runs", tone: "info" as const },
      ],
      primary: workflowRepository?.id === repoTwoState.repository.id && activeStepNumber === 1,
    } : null,
    {
      label: "Questions",
      title: "Resolve repo questions",
      summary: totalOpenQuestions > 0
        ? `${totalOpenQuestions} repo question${totalOpenQuestions === 1 ? "" : "s"} still need operator answers or guidance.`
        : "No open repo questions are currently blocking the workflow.",
      href: `/projects/${project.id}/understanding?view=questions${focusedRepository ? `&repositoryId=${focusedRepository.id}` : ""}`,
      actionLabel: totalOpenQuestions > 0 ? "Answer questions" : "Review guidance",
      badges: [
        { label: `${totalOpenQuestions} open`, tone: totalOpenQuestions > 0 ? "warning" as const : "success" as const },
      ],
      primary: activeStepNumber === 2 && totalOpenQuestions > 0,
    },
    {
      label: "Rules",
      title: "Approve doctrine",
      summary: project.doctrine.summary,
      href: `/projects/${project.id}/understanding?view=doctrine${focusedRepository ? `&repositoryId=${focusedRepository.id}` : ""}`,
      actionLabel: project.doctrine.approvalState === "Approved" ? "Review rules" : "Open doctrine",
      badges: [
        { label: project.doctrine.approvalState, tone: project.doctrine.approvalState === "Approved" ? "success" as const : "warning" as const },
      ],
      primary: activeStepNumber === 2 && project.doctrine.approvalState !== "Approved",
    },
  ].filter((item): item is {
    label: string;
    title: string;
    summary: string;
    href: string;
    actionLabel: string;
    badges: Array<{ label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }>;
    primary: boolean;
  } => Boolean(item));

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="System Knowledge"
        title={activeView === "doctrine" ? "Rules" : activeView === "questions" ? "Questions" : focusedRepository ? getRepositoryStudyOrdinal(focusedRepository) : "System Knowledge"}
        description="Build grounded repo understanding, answer the gaps, and lock the rules before feature work begins."
        actions={[
          { label: "Home", href: `/projects/${project.id}` },
          { label: "Features", href: `/projects/${project.id}/features` },
          { label: "Rules", href: `/projects/${project.id}/doctrine` },
        ]}
      />

      {feedbackMessage ? (
        <div className={error ? "callout-danger" : "callout-info"}>{feedbackMessage}</div>
      ) : null}

      <WorkflowHero
        stepLabel={`Step ${activeStep.number}: ${activeStep.title}`}
        progressLabel={`${completedWorkflowSteps} of 10 complete`}
        title={nextAction.title}
        description={nextAction.description}
        state={workflowSteps.find((step) => step.number === activeStep.number)?.state ?? "not-started"}
        badges={workflowSteps.find((step) => step.number === activeStep.number)?.badges}
      />

      <StickyNextActionBar
        stepLabel={`Step ${activeStep.number}: ${activeStep.title}`}
        description={nextAction.title}
        action={nextAction.action}
      />

      <SectionCard eyebrow="Knowledge lane" title="Build the foundation in order">
        <div className="workflow-stage-list">
          {knowledgeLane.map((item) => (
            <article key={item.href} className={`workflow-stage ${item.primary ? "workflow-stage-primary" : ""}`.trim()}>
              <div className="workflow-stage-header">
                <div className="min-w-0">
                  <p className="section-label">{item.label}</p>
                  <h3 className="mt-1 text-base font-semibold text-[var(--ink-950)]">{item.title}</h3>
                  <p className="workflow-stage-summary">{item.summary}</p>
                  <div className="workflow-stage-meta">
                    {item.badges.map((badge) => (
                      <StatusBadge key={`${item.href}-${badge.label}`} label={badge.label} tone={badge.tone} />
                    ))}
                  </div>
                </div>
                <div className="workflow-stage-actions">
                  <Link href={item.href} className="control-button-primary">{item.actionLabel}</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <details>
        <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">Switch focused view</summary>
        <div className="mt-4">
          <SegmentedLinkTabs items={understandingViews} />
        </div>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">View full workflow</summary>
        <div className="mt-4">
          <SectionCard eyebrow="Workflow" title="Full migration path">
            <div className="workflow-shell">
              <NextActionCard
                eyebrow="Primary action"
                title={nextAction.title}
                description={nextAction.description}
                action={nextAction.action}
                badges={focusedSnapshot
                  ? [{ label: focusedSnapshot.latestVersionLabel === "None" ? "Not started" : focusedSnapshot.latestVersionLabel, tone: focusedSnapshot.statusTone }]
                  : [{ label: project.doctrine.approvalState, tone: project.doctrine.approvalState === "Approved" ? "success" : "warning" }]}
              />
              <StepRail steps={workflowSteps} />
            </div>
          </SectionCard>
        </div>
      </details>

      {(activeView === "repo-1" || activeView === "repo-2") && focusedRepository && focusedSnapshot ? (
        <SectionCard eyebrow={`Step 1`} title={getRepositoryStudyOrdinal(focusedRepository)}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={focusedSnapshot.statusLabel} tone={focusedSnapshot.statusTone} />
              <StatusBadge label={focusedSnapshot.latestVersionLabel === "None" ? "Not started" : focusedSnapshot.latestVersionLabel} tone="info" />
              <StatusBadge label={focusedSnapshot.stale ? "Stale" : "Fresh"} tone={focusedSnapshot.stale ? "warning" : "success"} />
            </div>
            <div className="flex flex-col gap-2">
              <form action={`/api/projects/${project.id}/repositories/${focusedRepository.id}/study`} method="post">
                <PendingSubmitButton
                  idleLabel={getRepositoryStudyLabel(focusedRepository)}
                  pendingLabel={`Studying ${getRepositoryStudyOrdinal(focusedRepository)}...`}
                  className="control-button-primary w-full"
                />
              </form>
              {focusedLatestRun?.status === "Complete" ? (
                <form action={`/api/projects/${project.id}/repositories/${focusedRepository.id}/study`} method="post">
                  <input type="hidden" name="continueFromRunId" value={focusedLatestRun.id} />
                  <PendingSubmitButton
                    idleLabel="Continue Study"
                    pendingLabel="Continuing study..."
                    className="control-button-secondary w-full"
                    disabled={focusedLatestRun.operatorGuidance.length === 0}
                  />
                </form>
              ) : null}
            </div>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">View details</summary>
            <div className={`${statusCalloutTone} mt-4`}>{focusedSnapshot.statusDetail}</div>
            <p className="mt-4 text-sm leading-6 text-[var(--ink-700)]">{focusedRepository.notes}</p>
          </details>

          {focusedLatestRun?.understanding ? (
            <div className="mt-4 space-y-4">
              <div className="surface-item p-4">
                <p className="text-sm leading-6 text-[var(--ink-700)]">{focusedLatestRun.understanding.summary}</p>
              </div>

              <details className="surface-item p-4">
                <summary className="cursor-pointer font-medium text-[var(--ink-950)]">View details</summary>
                <div className="mt-4 space-y-4">
                  <StudyListCard title="Purpose" items={focusedLatestRun.understanding.purpose} />
                  <StudyListCard title="Capabilities" items={focusedLatestRun.understanding.capabilities} />
                  <StudyListCard title="Workflows" items={focusedLatestRun.understanding.coreWorkflows} />
                  <StudyListCard title="Entities" items={focusedLatestRun.understanding.importantEntities} />
                  <StudyListCard title="Architecture" items={focusedLatestRun.understanding.architectureShape} />
                  <StudyListCard title="Risks" items={focusedLatestRun.understanding.migrationRisks} />
                </div>
              </details>

              <details className="surface-item-compact p-4 text-sm leading-7 text-[var(--ink-700)]">
                  <summary className="cursor-pointer font-medium text-[var(--ink-950)]">Recent runs</summary>
                  <div className="mt-3 space-y-3">
                    {focusedHistory.length > 0 ? focusedHistory.map((run) => (
                      <article key={run.id} className="surface-item p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-medium text-[var(--ink-950)]">v{run.version}</p>
                          <StatusBadge label={run.status} tone={run.status === "Complete" ? "success" : run.status === "Failed" ? "danger" : "info"} />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{formatTimestamp(run.completedAt ?? run.startedAt ?? run.createdAt)}</p>
                      </article>
                    )) : <p>No study history yet.</p>}
                  </div>
              </details>
            </div>
          ) : (
            <div className="mt-5 surface-item p-4 sm:p-5">
              <p className="font-medium text-[var(--ink-950)]">No study yet</p>
            </div>
          )}
        </SectionCard>
      ) : null}

      {activeStepNumber === 2 ? (
      <div className="space-y-4">
        <SectionCard eyebrow="Step 2" title="Questions + answers">
          <div className="space-y-4">
            {repositoryStates.length > 1 ? (
              <SegmentedLinkTabs
                items={repositoryStates.map(({ repository }) => ({
                  label: getRepositoryStudyOrdinal(repository),
                  href: `/projects/${project.id}/understanding?view=questions&repositoryId=${repository.id}`,
                  active: repository.id === focusedRepository?.id,
                }))}
              />
            ) : null}

            {operatorQuestions.length > 0 ? (
              <div className="space-y-3">
                {operatorQuestions.map((question, index) => (
                  <article key={question.id} className="surface-item p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-[var(--ink-950)]">{question.question}</p>
                      <StatusBadge label={question.priority} tone={question.priority === "High" ? "warning" : "info"} />
                    </div>
                    <div className="mt-4">
                      <FieldShell label="Your response" htmlFor={`question-answer-${index}`}>
                      <input type="hidden" name={`questionText-${question.id}`} value={question.question} form="repo-guidance-form" />
                      <textarea
                        id={`question-answer-${index}`}
                        name={`questionAnswer-${question.id}`}
                        rows={3}
                        className="field-textarea"
                        placeholder="Answer this question if you have guidance for it."
                        form="repo-guidance-form"
                      />
                      </FieldShell>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="callout-info">No AI follow-up questions are currently recorded.</div>
            )}

            {focusedLatestRun ? (
              <div className="surface-item-compact p-4 sm:p-5">
                <p className="font-medium text-[var(--ink-950)]">Save guidance</p>
                <form
                  id="repo-guidance-form"
                  action={`/api/projects/${project.id}/repositories/${focusedRepository?.id}/study/guidance`}
                  method="post"
                  className="mt-4 space-y-3"
                >
                  <input type="hidden" name="runId" value={focusedLatestRun.id} />
                  <FieldShell
                    label="Additional guidance"
                    htmlFor="general-guidance"
                    hint="Example: The feature is missing in Repo 2."
                  >
                    <textarea
                      id="general-guidance"
                      name="guidance"
                      rows={3}
                      className="field-textarea"
                      placeholder="Add a short correction or next-pass instruction."
                    />
                  </FieldShell>
                  <div className="flex justify-end">
                    <PendingSubmitButton
                      idleLabel="Save guidance responses"
                      pendingLabel="Saving guidance..."
                      className="control-button-primary w-full sm:w-auto"
                    />
                  </div>
                </form>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Saved" title="Guidance history">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">View guidance</summary>
            <div className="mt-4 space-y-3">
              {guidanceEntries.length > 0 ? guidanceEntries.map((entry) => (
                <article key={entry.id} className="surface-item p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">
                    <span>{entry.author}</span>
                    <span>{formatTimestamp(entry.createdAt)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{entry.guidance}</p>
                </article>
              )) : <div className="callout-info">No saved guidance.</div>}
            </div>
          </details>
        </SectionCard>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">Review governing rules</summary>
          <div className="mt-4">
            <SectionCard eyebrow="Rules" title="Doctrine">
              <div className="space-y-4">
                <div className="surface-item p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-[var(--ink-950)]">Rules</p>
                    <StatusBadge label={project.doctrine.approvalState} tone={project.doctrine.approvalState === "Approved" ? "success" : project.doctrine.approvalState === "Awaiting Approval" ? "warning" : "neutral"} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{project.doctrine.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge label={project.doctrine.version} tone="info" />
                    <StatusBadge label={project.doctrine.lastUpdatedAt} tone="neutral" />
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        </details>
      </div>
      ) : null}

      {activeView === "doctrine" ? (
      <div className="space-y-4">
        <SectionCard eyebrow="Rules" title="Current step">
          <div className="space-y-4">
            <div className="surface-item p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium text-[var(--ink-950)]">Rules</p>
                <StatusBadge label={project.doctrine.approvalState} tone={project.doctrine.approvalState === "Approved" ? "success" : project.doctrine.approvalState === "Awaiting Approval" ? "warning" : "neutral"} />
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{project.doctrine.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge label={project.doctrine.version} tone="info" />
                <StatusBadge label={project.doctrine.lastUpdatedAt} tone="neutral" />
              </div>

              {!latestDoctrineVersion ? (
                <form action={`/api/projects/${project.id}/doctrine/generate`} method="post" className="mt-5 space-y-3">
                  <FieldShell
                    label="Doctrine generation guidance"
                    htmlFor="doctrine-feedback"
                    hint="Example: Prefer guided workflow over dashboards."
                  >
                    <textarea
                      id="doctrine-feedback"
                      name="feedback"
                      rows={3}
                      className="field-textarea"
                      placeholder="Add a short rule or design direction."
                    />
                  </FieldShell>
                  <div className="flex justify-end">
                    <PendingSubmitButton
                      idleLabel="Generate doctrine draft"
                      pendingLabel="Generating doctrine..."
                      className="control-button-primary w-full sm:w-auto"
                      disabled={!targetSnapshot?.usable}
                    />
                  </div>
                  {!targetSnapshot?.usable ? (
                    <p className="text-sm leading-6 text-[var(--ink-700)]">
                      Complete a usable Repo 2 study before generating doctrine.
                    </p>
                  ) : null}
                </form>
              ) : (
                <div className="mt-5 space-y-4">
                  {(() => {
                    const doctrineContent = latestDoctrineVersion.content as unknown as Record<string, unknown>;
                    const productDoctrine = getDoctrineSection(doctrineContent, "productDoctrine", ["architecturePatterns", "uxPatterns"]);
                    const interactionModel = getDoctrineSection(doctrineContent, "interactionModel", ["interactionPatterns", "uxPatterns"]);
                    const migrationRules = getDoctrineSection(doctrineContent, "migrationRules", ["criticalRules", "interactionPatterns"]);
                    const featureDesignRules = getDoctrineSection(doctrineContent, "featureDesignRules", ["criticalRules"]);
                    const antiPatterns = getDoctrineSection(doctrineContent, "antiPatterns");
                    const technicalConstraints = getDoctrineSection(doctrineContent, "technicalConstraints", ["criticalRules", "architecturePatterns"]);
                    const groundingReferences = getDoctrineSection(doctrineContent, "groundingReferences");

                    return (
                  <form action={`/api/projects/${project.id}/doctrine/save`} method="post" className="space-y-4">
                    <input type="hidden" name="doctrineId" value={latestDoctrineVersion.id} />
                    <FieldShell label="Doctrine summary" htmlFor="doctrine-summary">
                      <textarea
                        id="doctrine-summary"
                        name="summary"
                        rows={5}
                        defaultValue={latestDoctrineVersion.content.summary}
                        className="field-textarea"
                      />
                    </FieldShell>
                    <details className="surface-item p-4">
                      <summary className="cursor-pointer font-medium text-[var(--ink-950)]">Edit rules</summary>
                    <div className="mt-4 space-y-4">
                      <FieldShell label="Product doctrine" htmlFor="product-doctrine">
                        <textarea id="product-doctrine" name="productDoctrine" rows={7} defaultValue={toTextareaValue(productDoctrine)} className="field-textarea" />
                      </FieldShell>
                      <FieldShell label="Interaction model" htmlFor="interaction-model">
                        <textarea id="interaction-model" name="interactionModel" rows={7} defaultValue={toTextareaValue(interactionModel)} className="field-textarea" />
                      </FieldShell>
                      <FieldShell label="Migration rules" htmlFor="migration-rules">
                        <textarea id="migration-rules" name="migrationRules" rows={7} defaultValue={toTextareaValue(migrationRules)} className="field-textarea" />
                      </FieldShell>
                      <FieldShell label="Feature design rules" htmlFor="feature-design-rules">
                        <textarea id="feature-design-rules" name="featureDesignRules" rows={7} defaultValue={toTextareaValue(featureDesignRules)} className="field-textarea" />
                      </FieldShell>
                      <FieldShell label="Anti-patterns" htmlFor="anti-patterns">
                        <textarea id="anti-patterns" name="antiPatterns" rows={6} defaultValue={toTextareaValue(antiPatterns)} className="field-textarea" />
                      </FieldShell>
                      <FieldShell label="Technical constraints" htmlFor="technical-constraints">
                        <textarea id="technical-constraints" name="technicalConstraints" rows={6} defaultValue={toTextareaValue(technicalConstraints)} className="field-textarea" />
                      </FieldShell>
                      <div className="xl:col-span-2">
                        <FieldShell label="Grounding references" htmlFor="grounding-references">
                        <textarea id="grounding-references" name="groundingReferences" rows={6} defaultValue={toTextareaValue(groundingReferences)} className="field-textarea" />
                        </FieldShell>
                      </div>
                    </div>
                    </details>
                    <div className="flex justify-end">
                      <PendingSubmitButton
                        idleLabel="Save doctrine draft"
                        pendingLabel="Saving doctrine..."
                        className="control-button-secondary w-full sm:w-auto"
                      />
                    </div>
                  </form>
                    );
                  })()}

                  {doctrineApproval ? (
                    <div className="space-y-4">
                      <form action={`/api/approvals/${doctrineApproval.id}/decide`} method="post" className="surface-item-compact p-4 space-y-3">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="decision" value="revision-requested" />
                        <FieldShell label="Request revision" htmlFor="doctrine-revision-note">
                          <textarea
                            id="doctrine-revision-note"
                            name="note"
                            rows={4}
                            className="field-textarea"
                            placeholder="Explain what should change before doctrine can be approved."
                          />
                        </FieldShell>
                        <div className="flex justify-end">
                          <PendingSubmitButton
                            idleLabel="Request doctrine revision"
                            pendingLabel="Requesting revision..."
                            className="control-button-secondary w-full sm:w-auto"
                            disabled={latestDoctrineVersion.status === "Approved"}
                          />
                        </div>
                      </form>

                      <form action={`/api/approvals/${doctrineApproval.id}/decide`} method="post" className="surface-item-compact p-4 space-y-3">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="decision" value="approved" />
                        <p className="font-medium text-[var(--ink-950)]">Confirm doctrine</p>
                        <p className="text-sm leading-6 text-[var(--ink-700)]">
                          Approve this doctrine when it correctly captures the Repo 2 architectural, UX, and interaction rules that should govern future proposals.
                        </p>
                        <div className="flex justify-end">
                          <PendingSubmitButton
                            idleLabel={latestDoctrineVersion.status === "Approved" ? "Doctrine approved" : "Approve doctrine"}
                            pendingLabel="Approving doctrine..."
                            className="control-button-primary w-full sm:w-auto"
                            disabled={latestDoctrineVersion.status === "Approved"}
                          />
                        </div>
                      </form>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <details className="surface-item p-4 sm:p-5">
              <summary className="cursor-pointer font-medium text-[var(--ink-950)]">View analysis</summary>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <StatusBadge label={latestAnalysisRun ? `v${latestAnalysisRun.version}` : "None"} tone="info" />
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">
                {latestAnalysisRun
                  ? latestAnalysisRun.summary.join(" ")
                  : "No analysis stored."}
              </p>
            </details>
          </div>
        </SectionCard>

        <details>
          <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">Optional actions</summary>
          <div className="mt-4">
            <ResetIntelligenceButton action={`/api/projects/${project.id}/intelligence/reset`} />
          </div>
        </details>
      </div>
      ) : null}
    </div>
  );
}