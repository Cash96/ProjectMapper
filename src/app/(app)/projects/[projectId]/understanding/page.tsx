import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ResetIntelligenceButton } from "@/components/reset-intelligence-button";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
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
  const selectedRepository = selectedRepositoryState?.repository ?? null;
  const selectedSnapshot = selectedRepositoryState?.snapshot ?? null;
  const selectedHistory = selectedRepositoryState?.history ?? [];
  const selectedLatestRun = selectedRepositoryState?.latestRun ?? null;
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

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Understanding"
        title={selectedRepository ? `${selectedRepository.name} intelligence` : "Understanding"}
        description="Select one repository at a time, then inspect its study status, understanding, AI questions, guidance, and history in one focused view."
        actions={[
          { label: "Home", href: `/projects/${project.id}` },
          { label: "Features", href: `/projects/${project.id}/features` },
        ]}
      />

      {feedbackMessage ? (
        <div className={error ? "callout-danger" : "callout-info"}>{feedbackMessage}</div>
      ) : null}

      <SectionCard eyebrow="Repository focus" title="Choose a repository">
        <div className="grid gap-3 lg:grid-cols-2">
          {repositoryStates.map(({ repository, snapshot }) => {
            const selected = repository.id === selectedRepository?.id;

            return (
              <Link
                key={repository.id}
                href={`/projects/${project.id}/understanding?repositoryId=${repository.id}`}
                className={`rounded-[1.35rem] border p-4 transition ${
                  selected
                    ? "border-[rgba(50,95,155,0.28)] bg-[rgba(50,95,155,0.07)] shadow-[0_12px_28px_rgba(50,95,155,0.08)]"
                    : "border-[var(--line-soft)] bg-white/70 hover:border-[rgba(50,95,155,0.2)] hover:bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="section-label text-[var(--ink-500)]">{getRepositoryStudyOrdinal(repository)}</p>
                    <p className="mt-2 text-lg font-semibold tracking-tight text-[var(--ink-950)]">{repository.name}</p>
                  </div>
                  {selected ? <StatusBadge label="Selected" tone="info" /> : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{repository.notes}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge label={snapshot?.statusLabel ?? "Not studied"} tone={snapshot?.statusTone ?? "neutral"} />
                  <StatusBadge label={snapshot?.latestVersionLabel ? `Latest ${snapshot.latestVersionLabel}` : "No runs yet"} tone="info" />
                </div>
              </Link>
            );
          })}
        </div>
      </SectionCard>

      {selectedRepository && selectedSnapshot ? (
        <SectionCard eyebrow={getRepositoryStudyOrdinal(selectedRepository)} title={`${selectedRepository.name} understanding`}>
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p>{selectedRepository.notes}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge label={selectedSnapshot.statusLabel} tone={selectedSnapshot.statusTone} />
                <StatusBadge label={`Latest ${selectedSnapshot.latestVersionLabel}`} tone="info" />
                <StatusBadge label={selectedSnapshot.stale ? "Stale" : "Fresh"} tone={selectedSnapshot.stale ? "warning" : "success"} />
                <StatusBadge label={`Last study ${formatTimestamp(selectedSnapshot.lastStudiedAt)}`} tone="neutral" />
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap xl:justify-end">
              <form action={`/api/projects/${project.id}/repositories/${selectedRepository.id}/study`} method="post">
                <PendingSubmitButton
                  idleLabel={getRepositoryStudyLabel(selectedRepository)}
                  pendingLabel={`Studying ${getRepositoryStudyOrdinal(selectedRepository)}...`}
                  className="control-button-primary w-full sm:w-auto"
                />
              </form>
              {selectedLatestRun?.status === "Complete" ? (
                <form action={`/api/projects/${project.id}/repositories/${selectedRepository.id}/study`} method="post">
                  <input type="hidden" name="continueFromRunId" value={selectedLatestRun.id} />
                  <PendingSubmitButton
                    idleLabel="Continue Study"
                    pendingLabel="Continuing study..."
                    className="control-button-secondary w-full sm:w-auto"
                    disabled={selectedLatestRun.operatorGuidance.length === 0}
                  />
                </form>
              ) : null}
            </div>
          </div>

          <div className={`${statusCalloutTone} mt-5`}>{selectedSnapshot.statusDetail}</div>

          {selectedLatestRun?.understanding ? (
            <div className="mt-5 space-y-4">
              <div className="surface-item p-4 sm:p-5">
                <p className="font-medium text-[var(--ink-950)]">Summary</p>
                <p className="mt-3 text-sm leading-7 text-[var(--ink-700)]">{selectedLatestRun.understanding.summary}</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <StudyListCard title="Purpose" items={selectedLatestRun.understanding.purpose} />
                <StudyListCard title="Capabilities" items={selectedLatestRun.understanding.capabilities} />
                <StudyListCard title="Core workflows" items={selectedLatestRun.understanding.coreWorkflows} />
                <StudyListCard title="Important entities" items={selectedLatestRun.understanding.importantEntities} />
                <StudyListCard title="Architecture shape" items={selectedLatestRun.understanding.architectureShape} />
                <StudyListCard title="Migration risks" items={selectedLatestRun.understanding.migrationRisks} />
              </div>

              <div className="surface-item-compact p-4 text-sm leading-7 text-[var(--ink-700)]">
                  <p className="font-medium text-[var(--ink-950)]">Recent study history</p>
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
              </div>
            </div>
          ) : (
            <div className="mt-5 surface-item p-4 sm:p-5">
              <p className="font-medium text-[var(--ink-950)]">No usable understanding recorded yet</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">
                Study {getRepositoryStudyOrdinal(selectedRepository)} to generate grounded repository intelligence. Once the study completes, the understanding, questions, guidance, and history for this repo will appear here.
              </p>
            </div>
          )}
        </SectionCard>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard eyebrow="AI questions" title="Uncertainties and follow-up needs">
          <div className="space-y-4">
            {operatorQuestions.length > 0 ? (
              <div className="space-y-3">
                {operatorQuestions.map((question, index) => (
                  <article key={question.id} className="surface-item p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-[var(--ink-950)]">{question.question}</p>
                      <StatusBadge label={question.priority} tone={question.priority === "High" ? "warning" : "info"} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{question.rationale}</p>
                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor={`question-answer-${index}`}>
                        Your response
                      </label>
                      <input type="hidden" name={`questionText-${question.id}`} value={question.question} form="repo-guidance-form" />
                      <textarea
                        id={`question-answer-${index}`}
                        name={`questionAnswer-${question.id}`}
                        rows={3}
                        className="field-textarea"
                        placeholder="Answer this question if you have guidance for it."
                        form="repo-guidance-form"
                      />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="callout-info">No AI follow-up questions are currently recorded.</div>
            )}

            {selectedLatestRun ? (
              <div className="surface-item-compact p-4 sm:p-5">
                <p className="font-medium text-[var(--ink-950)]">Respond to this study</p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">
                  Add corrections, answer any of the questions above, or tell the next study pass what to focus on. Any question field with text will be included automatically when you save.
                </p>
                <form
                  id="repo-guidance-form"
                  action={`/api/projects/${project.id}/repositories/${selectedRepository?.id}/study/guidance`}
                  method="post"
                  className="mt-4 space-y-3"
                >
                  <input type="hidden" name="runId" value={selectedLatestRun.id} />
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor="general-guidance">
                      Additional guidance
                    </label>
                    <p className="mb-2 text-sm leading-6 text-[var(--ink-700)]">
                      Use this for broader correction, missing context, or anything that does not fit one question.
                    </p>
                  </div>
                  <textarea
                    id="general-guidance"
                    name="guidance"
                    rows={5}
                    className="field-textarea"
                    placeholder={`Add general operator correction for ${getRepositoryStudyOrdinal(selectedRepository!)} or leave this blank if you only want to answer specific questions.`}
                  />
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

        <SectionCard eyebrow="Operator guidance" title="Saved guidance">
          {guidanceEntries.length > 0 ? (
            <div className="space-y-3">
              {guidanceEntries.map((entry) => (
                <article key={entry.id} className="surface-item p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">
                    <span>{entry.author}</span>
                    <span>{formatTimestamp(entry.createdAt)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink-700)]">{entry.guidance}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="callout-info">No operator guidance has been saved yet.</div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard eyebrow="Derived summaries" title="Doctrine and analysis">
          <div className="space-y-4">
            <div className="surface-item p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium text-[var(--ink-950)]">Doctrine snapshot</p>
                <StatusBadge label={project.doctrine.approvalState} tone={project.doctrine.approvalState === "Approved" ? "success" : project.doctrine.approvalState === "Awaiting Approval" ? "warning" : "neutral"} />
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--ink-700)]">{project.doctrine.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge label={project.doctrine.version} tone="info" />
                <StatusBadge label={`Updated ${project.doctrine.lastUpdatedAt}`} tone="neutral" />
              </div>

              {!latestDoctrineVersion ? (
                <form action={`/api/projects/${project.id}/doctrine/generate`} method="post" className="mt-5 space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor="doctrine-feedback">
                      Doctrine generation guidance
                    </label>
                    <p className="mb-2 text-sm leading-6 text-[var(--ink-700)]">
                      Optional guidance for generating doctrine from the latest usable Repo 2 study.
                    </p>
                    <textarea
                      id="doctrine-feedback"
                      name="feedback"
                      rows={4}
                      className="field-textarea"
                      placeholder="Add doctrine-specific direction, product philosophy, or constraints before generating the draft."
                    />
                  </div>
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
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor="doctrine-summary">
                        Doctrine summary
                      </label>
                      <textarea
                        id="doctrine-summary"
                        name="summary"
                        rows={5}
                        defaultValue={latestDoctrineVersion.content.summary}
                        className="field-textarea"
                      />
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor="product-doctrine">
                          Product doctrine
                        </label>
                        <textarea id="product-doctrine" name="productDoctrine" rows={7} defaultValue={toTextareaValue(productDoctrine)} className="field-textarea" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor="interaction-model">
                          Interaction model
                        </label>
                        <textarea id="interaction-model" name="interactionModel" rows={7} defaultValue={toTextareaValue(interactionModel)} className="field-textarea" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor="migration-rules">
                          Migration rules
                        </label>
                        <textarea id="migration-rules" name="migrationRules" rows={7} defaultValue={toTextareaValue(migrationRules)} className="field-textarea" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor="feature-design-rules">
                          Feature design rules
                        </label>
                        <textarea id="feature-design-rules" name="featureDesignRules" rows={7} defaultValue={toTextareaValue(featureDesignRules)} className="field-textarea" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor="anti-patterns">
                          Anti-patterns
                        </label>
                        <textarea id="anti-patterns" name="antiPatterns" rows={6} defaultValue={toTextareaValue(antiPatterns)} className="field-textarea" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor="technical-constraints">
                          Technical constraints
                        </label>
                        <textarea id="technical-constraints" name="technicalConstraints" rows={6} defaultValue={toTextareaValue(technicalConstraints)} className="field-textarea" />
                      </div>
                      <div className="xl:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-[var(--ink-950)]" htmlFor="grounding-references">
                          Grounding references
                        </label>
                        <textarea id="grounding-references" name="groundingReferences" rows={6} defaultValue={toTextareaValue(groundingReferences)} className="field-textarea" />
                      </div>
                    </div>
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
                        <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="doctrine-revision-note">
                          Request revision
                        </label>
                        <textarea
                          id="doctrine-revision-note"
                          name="note"
                          rows={4}
                          className="field-textarea"
                          placeholder="Explain what should change before doctrine can be approved."
                        />
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

            <div className="surface-item p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium text-[var(--ink-950)]">Latest analysis snapshot</p>
                <StatusBadge label={latestAnalysisRun ? `v${latestAnalysisRun.version}` : "None"} tone="info" />
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--ink-700)]">
                {latestAnalysisRun
                  ? latestAnalysisRun.summary.join(" ")
                  : "No separate analysis runs are currently stored for this project."}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Safety" title="Reset intelligence">
          <p>
            Use a full reset when you need to wipe repo studies, discovered features, feature studies, mapping summaries, doctrine versions, reports, and AI outputs while preserving the project and repo connections.
          </p>
          <div className="mt-5">
            <ResetIntelligenceButton action={`/api/projects/${project.id}/intelligence/reset`} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}