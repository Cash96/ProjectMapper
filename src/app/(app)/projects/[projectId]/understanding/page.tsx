import { PageHeader } from "@/components/page-header";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ResetIntelligenceButton } from "@/components/reset-intelligence-button";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { FieldShell, NextActionCard, SegmentedLinkTabs, StepRail } from "@/components/workflow-primitives";
import { getLatestAnalysisRun } from "@/lib/analysis-store";
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
  const activeRepositoryState = activeView === "repo-2"
    ? repositoryStates.find((entry) => entry.repository.role === "Target") ?? selectedRepositoryState
    : activeView === "repo-1"
      ? repositoryStates.find((entry) => entry.repository.role === "Source") ?? selectedRepositoryState
      : selectedRepositoryState;
  const selectedRepository = activeRepositoryState?.repository ?? null;
  const selectedSnapshot = activeRepositoryState?.snapshot ?? null;
  const selectedHistory = activeRepositoryState?.history ?? [];
  const selectedLatestRun = activeRepositoryState?.latestRun ?? null;
  const doctrineApproval = project.approvals.find((entry) => entry.target.entity === "doctrine") ?? null;
  const feedbackMessage = error
    ? error
    : getSearchValue(query.reset) === "complete"
      ? "Project intelligence reset complete. The system is back to a fresh-start state."
      : getSearchValue(query.study) && getSearchValue(query.version)
        ? `${selectedRepository ? `${getRepositoryStudyOrdinal(selectedRepository)} ` : "Repo "}study v${getSearchValue(query.version)} ${String(getSearchValue(query.study)).replace(/-/g, " ")}.`
        : getSearchValue(query.guidance) === "saved" && getSearchValue(query.version)
          ? `${selectedRepository ? `${getRepositoryStudyOrdinal(selectedRepository)} ` : "Repo "}guidance saved on study v${getSearchValue(query.version)}.`
          : getSearchValue(query.doctrine) === "generated" && getSearchValue(query.version)
            ? `Doctrine v${getSearchValue(query.version)} generated.`
            : getSearchValue(query.doctrine) === "saved" && getSearchValue(query.version)
              ? `Doctrine v${getSearchValue(query.version)} saved and returned to review.`
              : getSearchValue(query.updated) === doctrineApproval?.id && getSearchValue(query.status) === "approved"
                ? "Doctrine approved. Proposal generation can now use it as grounded doctrine."
                : getSearchValue(query.updated) === doctrineApproval?.id && getSearchValue(query.status) === "revision-requested"
                  ? "Doctrine revision requested. Update the doctrine and resubmit it for approval."
            : undefined;
  const operatorQuestions = selectedLatestRun
    ? (selectedLatestRun.operatorQuestions ?? []).map((question, index) => ({
        ...question,
        id: `${selectedLatestRun.id}-${question.id || `question-${index + 1}`}`,
      }))
    : [];
  const guidanceEntries = selectedLatestRun
    ? [...(selectedLatestRun.operatorGuidance ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    : [];
  const statusCalloutTone = selectedSnapshot?.statusTone === "danger"
    ? "callout-danger"
    : selectedSnapshot?.statusTone === "warning"
      ? "callout-warning"
      : "callout-info";
  const topTabs = [
    sourceRepository
      ? {
          label: "Repo 1",
          href: `/projects/${project.id}/understanding?view=repo-1&repositoryId=${sourceRepository.id}`,
          active: activeView === "repo-1",
          badge: sourceSnapshot?.latestVersionLabel ?? "new",
        }
      : null,
    targetRepository
      ? {
          label: "Repo 2",
          href: `/projects/${project.id}/understanding?view=repo-2&repositoryId=${targetRepository.id}`,
          active: activeView === "repo-2",
          badge: targetSnapshot?.latestVersionLabel ?? "new",
        }
      : null,
    {
      label: "AI Questions",
      href: `/projects/${project.id}/understanding?view=questions${selectedRepository ? `&repositoryId=${selectedRepository.id}` : ""}`,
      active: activeView === "questions",
      badge: String(operatorQuestions.length),
    },
    {
      label: "Doctrine",
      href: `/projects/${project.id}/understanding?view=doctrine${selectedRepository ? `&repositoryId=${selectedRepository.id}` : ""}`,
      active: activeView === "doctrine",
      badge: project.doctrine.approvalState === "Approved" ? "ready" : "review",
    },
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const repoReadinessSteps = [
    {
      number: 1,
      title: "Repo 1 study",
      description: "Capture what exists today in the source product and how it behaves.",
      state: sourceSnapshot?.latestVersionLabel && sourceSnapshot.latestVersionLabel !== "None" ? "complete" : "current",
      badges: sourceSnapshot ? [{ label: sourceSnapshot.statusLabel, tone: sourceSnapshot.statusTone }] : undefined,
    },
    {
      number: 2,
      title: "Repo 2 study",
      description: "Ground migration decisions in current target architecture and constraints.",
      state: targetSnapshot?.latestVersionLabel && targetSnapshot.latestVersionLabel !== "None"
        ? "complete"
        : sourceSnapshot?.latestVersionLabel && sourceSnapshot.latestVersionLabel !== "None"
          ? "current"
          : "upcoming",
      badges: targetSnapshot ? [{ label: targetSnapshot.statusLabel, tone: targetSnapshot.statusTone }] : undefined,
    },
    {
      number: 3,
      title: "Questions and corrections",
      description: "Close the gaps the AI cannot infer by itself.",
      state: operatorQuestions.length === 0 && guidanceEntries.length > 0 ? "complete" : "upcoming",
    },
    {
      number: 4,
      title: "Doctrine",
      description: "Convert Repo 2 understanding into reusable product and architecture rules.",
      state: project.doctrine.approvalState === "Approved" ? "complete" : activeView === "doctrine" ? "current" : "upcoming",
      badges: [{ label: project.doctrine.approvalState, tone: project.doctrine.approvalState === "Approved" ? "success" : "warning" }],
    },
  ] as const;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="System Knowledge"
        title={activeView === "doctrine" ? "Rules" : activeView === "questions" ? "Questions" : selectedRepository ? getRepositoryStudyOrdinal(selectedRepository) : "System Knowledge"}
        description="One workspace at a time."
        actions={[
          { label: "Home", href: `/projects/${project.id}` },
          { label: "Features", href: `/projects/${project.id}/features` },
        ]}
      />

      {feedbackMessage ? (
        <div className={error ? "callout-danger" : "callout-info"}>{feedbackMessage}</div>
      ) : null}

      <SectionCard eyebrow="Workspace" title="Choose a step">
        <div className="workflow-shell">
          <SegmentedLinkTabs items={topTabs} />
          <NextActionCard
            eyebrow="Next Step"
            title={activeView === "doctrine" ? "Review rules" : activeView === "questions" ? "Answer questions" : `Study ${selectedRepository ? getRepositoryStudyOrdinal(selectedRepository) : "repo"}`}
            description={selectedSnapshot?.statusLabel ?? project.doctrine.approvalState}
            badges={selectedSnapshot ? [{ label: selectedSnapshot.latestVersionLabel === "None" ? "Not started" : selectedSnapshot.latestVersionLabel, tone: selectedSnapshot.statusTone }] : [{ label: project.doctrine.approvalState, tone: project.doctrine.approvalState === "Approved" ? "success" : "warning" }]}
          />
          <StepRail steps={repoReadinessSteps as unknown as Parameters<typeof StepRail>[0]["steps"]} />
        </div>
      </SectionCard>

      {(activeView === "repo-1" || activeView === "repo-2") && selectedRepository && selectedSnapshot ? (
        <SectionCard eyebrow={getRepositoryStudyOrdinal(selectedRepository)} title="Current step">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={selectedSnapshot.statusLabel} tone={selectedSnapshot.statusTone} />
              <StatusBadge label={selectedSnapshot.latestVersionLabel === "None" ? "Not started" : selectedSnapshot.latestVersionLabel} tone="info" />
              <StatusBadge label={selectedSnapshot.stale ? "Stale" : "Fresh"} tone={selectedSnapshot.stale ? "warning" : "success"} />
            </div>
            <div className="flex flex-col gap-2">
              <form action={`/api/projects/${project.id}/repositories/${selectedRepository.id}/study`} method="post">
                <PendingSubmitButton
                  idleLabel={getRepositoryStudyLabel(selectedRepository)}
                  pendingLabel={`Studying ${getRepositoryStudyOrdinal(selectedRepository)}...`}
                  className="control-button-primary w-full"
                />
              </form>
              {selectedLatestRun?.status === "Complete" ? (
                <form action={`/api/projects/${project.id}/repositories/${selectedRepository.id}/study`} method="post">
                  <input type="hidden" name="continueFromRunId" value={selectedLatestRun.id} />
                  <PendingSubmitButton
                    idleLabel="Continue Study"
                    pendingLabel="Continuing study..."
                    className="control-button-secondary w-full"
                    disabled={selectedLatestRun.operatorGuidance.length === 0}
                  />
                </form>
              ) : null}
            </div>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">View details</summary>
            <div className={`${statusCalloutTone} mt-4`}>{selectedSnapshot.statusDetail}</div>
            <p className="mt-4 text-sm leading-6 text-[var(--ink-700)]">{selectedRepository.notes}</p>
          </details>

          {selectedLatestRun?.understanding ? (
            <div className="mt-4 space-y-4">
              <div className="surface-item p-4">
                <p className="text-sm leading-6 text-[var(--ink-700)]">{selectedLatestRun.understanding.summary}</p>
              </div>

              <details className="surface-item p-4">
                <summary className="cursor-pointer font-medium text-[var(--ink-950)]">View details</summary>
                <div className="mt-4 space-y-4">
                  <StudyListCard title="Purpose" items={selectedLatestRun.understanding.purpose} />
                  <StudyListCard title="Capabilities" items={selectedLatestRun.understanding.capabilities} />
                  <StudyListCard title="Workflows" items={selectedLatestRun.understanding.coreWorkflows} />
                  <StudyListCard title="Entities" items={selectedLatestRun.understanding.importantEntities} />
                  <StudyListCard title="Architecture" items={selectedLatestRun.understanding.architectureShape} />
                  <StudyListCard title="Risks" items={selectedLatestRun.understanding.migrationRisks} />
                </div>
              </details>

              <details className="surface-item-compact p-4 text-sm leading-7 text-[var(--ink-700)]">
                  <summary className="cursor-pointer font-medium text-[var(--ink-950)]">Recent runs</summary>
                  <div className="mt-3 space-y-3">
                    {selectedHistory.length > 0 ? selectedHistory.map((run) => (
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

      {activeView === "questions" ? (
      <div className="space-y-4">
        <SectionCard eyebrow="AI questions" title="Uncertainties and follow-up needs">
          <div className="space-y-4">
            {repositoryStates.length > 1 ? (
              <SegmentedLinkTabs
                items={repositoryStates.map(({ repository }) => ({
                  label: getRepositoryStudyOrdinal(repository),
                  href: `/projects/${project.id}/understanding?view=questions&repositoryId=${repository.id}`,
                  active: repository.id === selectedRepository?.id,
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

            {selectedLatestRun ? (
              <div className="surface-item-compact p-4 sm:p-5">
                <p className="font-medium text-[var(--ink-950)]">Save guidance</p>
                <form
                  id="repo-guidance-form"
                  action={`/api/projects/${project.id}/repositories/${selectedRepository?.id}/study/guidance`}
                  method="post"
                  className="mt-4 space-y-3"
                >
                  <input type="hidden" name="runId" value={selectedLatestRun.id} />
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
                    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
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