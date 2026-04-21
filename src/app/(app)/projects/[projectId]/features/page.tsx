import Link from "next/link";

import { DeleteFeatureButton } from "@/components/delete-feature-button";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { getFeatureStatusTone } from "@/lib/feature-intelligence";
import { buildEditableProposalContent, getFeatureProposalReadiness } from "@/lib/feature-proposals";
import {
  getLatestFeatureMappingSummary,
  getLatestFeatureStudyRun,
  getRecentFeatureStudyRuns,
  listFeatureInventory,
  readFeatureInventoryRecord,
} from "@/lib/feature-store";
import { getProject } from "@/lib/project-helpers";
import { getLatestFeatureProposal } from "@/lib/proposal-store";

type FeaturesPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatSourceLabel(source: string) {
  return source === "AI Discovered" ? "AI discovered" : "Manual topic";
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

function roleLabel(role: "Source" | "Target") {
  return role === "Source" ? "Repo 1" : "Repo 2";
}

function isRepositoryRole(value: string | undefined): value is "Source" | "Target" {
  return value === "Source" || value === "Target";
}

function buildFeatureHref(projectId: string, featureId: string, repositoryRole: "Source" | "Target") {
  return `/projects/${projectId}/features?feature=${featureId}&repositoryRole=${repositoryRole}`;
}

function getProposalCheckAction(input: {
  checkLabel: string;
  projectId: string;
  featureId: string;
  repositoryRole: "Source" | "Target";
}) {
  if (input.checkLabel === "Current mapping") {
    return {
      label: "Go to mapping",
      href: `${buildFeatureHref(input.projectId, input.featureId, input.repositoryRole)}#feature-mapping`,
    };
  }

  if (input.checkLabel === "Approved doctrine") {
    return {
      label: "Open doctrine",
      href: `/projects/${input.projectId}/understanding`,
    };
  }

  return null;
}

function getProposalStatusTone(status: "Draft" | "Revision Requested" | "Approved") {
  if (status === "Approved") {
    return "success" as const;
  }

  if (status === "Revision Requested") {
    return "warning" as const;
  }

  return "info" as const;
}

function StudyListCard({ title, items = [] }: { title: string; items?: string[] }) {
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

function buildFeedbackMessage(input: {
  error?: string;
  created?: string;
  deleted?: string;
  deletedName?: string;
  guidance?: string;
  proposal?: string;
  proposalVersion?: string;
  study?: string;
  mapping?: string;
  role?: string;
  version?: string;
}) {
  if (input.error) {
    return input.error;
  }

  if (input.created === "manual") {
    return "Manual feature topic created.";
  }

  if (input.deleted === "true") {
    return input.deletedName ? `${input.deletedName} was deleted.` : "Feature topic deleted.";
  }

  if (input.guidance === "saved" && input.role && input.version) {
    return `${input.role === "Source" ? "Repo 1" : "Repo 2"} feature-study guidance saved on v${input.version}.`;
  }

  if (input.proposal === "generated" && input.proposalVersion) {
    return `Proposal v${input.proposalVersion} generated.`;
  }

  if (input.proposal === "saved" && input.proposalVersion) {
    return `Proposal v${input.proposalVersion} saved.`;
  }

  if (input.proposal === "revised" && input.proposalVersion) {
    return `Proposal v${input.proposalVersion} generated from revision request.`;
  }

  if (input.proposal === "approved" && input.proposalVersion) {
    return `Proposal v${input.proposalVersion} approved and ready for later execution.`;
  }

  if (input.study && input.role && input.version) {
    return `${input.role === "Source" ? "Repo 1" : "Repo 2"} feature study v${input.version} ${input.study.replace(/-/g, " ")}.`;
  }

  if (input.mapping === "refreshed") {
    return "Feature mapping summary refreshed.";
  }

  return undefined;
}

export default async function FeaturesPage({ params, searchParams }: FeaturesPageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await getProject(projectId);
  const features = await listFeatureInventory(projectId);
  const selectedFeatureId = getSearchValue(query.feature);
  const selectedFeature = selectedFeatureId ? await readFeatureInventoryRecord(projectId, selectedFeatureId) : null;
  const discoveryAction = getSearchValue(query.discovery);
  const count = getSearchValue(query.count);
  const error = getSearchValue(query.error);
  const feedbackMessage = buildFeedbackMessage({
    error,
    created: getSearchValue(query.created),
    deleted: getSearchValue(query.deleted),
    deletedName: getSearchValue(query.deletedName),
    guidance: getSearchValue(query.guidance),
    proposal: getSearchValue(query.proposal),
    proposalVersion: getSearchValue(query.proposalVersion),
    study: getSearchValue(query.study),
    mapping: getSearchValue(query.mapping),
    role: getSearchValue(query.role),
    version: getSearchValue(query.version),
  }) ?? (discoveryAction === "complete" ? `Feature inventory refreshed with ${count ?? features.length} discovered topics.` : undefined);
  const featureWorkspaceData = selectedFeature
    ? await Promise.all([
        getLatestFeatureStudyRun(projectId, selectedFeature.id, "Source"),
        getLatestFeatureStudyRun(projectId, selectedFeature.id, "Target"),
        getRecentFeatureStudyRuns(projectId, selectedFeature.id, "Source", 4),
        getRecentFeatureStudyRuns(projectId, selectedFeature.id, "Target", 4),
        getLatestFeatureMappingSummary(projectId, selectedFeature.id),
        getLatestFeatureProposal(projectId, selectedFeature.id),
        getFeatureProposalReadiness(projectId, selectedFeature.id),
      ])
    : null;
  const sourceRun = featureWorkspaceData?.[0] ?? null;
  const targetRun = featureWorkspaceData?.[1] ?? null;
  const sourceRecentRuns = featureWorkspaceData?.[2] ?? [];
  const targetRecentRuns = featureWorkspaceData?.[3] ?? [];
  const mapping = featureWorkspaceData?.[4] ?? null;
  const latestProposal = featureWorkspaceData?.[5] ?? null;
  const proposalReadiness = featureWorkspaceData?.[6] ?? null;
  const hasBothStudies = Boolean(sourceRun?.status === "Complete" && targetRun?.status === "Complete");
  const requestedRepositoryRole = getSearchValue(query.repositoryRole) ?? getSearchValue(query.role);
  const selectedRepositoryRole = isRepositoryRole(requestedRepositoryRole)
    ? requestedRepositoryRole
    : sourceRun?.status === "Complete"
      ? "Source"
      : "Target";
  const selectedStudy = selectedRepositoryRole === "Source"
    ? { role: "Source" as const, latestRun: sourceRun, recentRuns: sourceRecentRuns }
    : { role: "Target" as const, latestRun: targetRun, recentRuns: targetRecentRuns };
  const editableProposal = latestProposal ? buildEditableProposalContent(latestProposal.content) : null;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Features"
        title="Migration work surface"
        description="Discovered features, manual topics, focused Repo 1 and Repo 2 studies, and source-target mapping in one working surface."
        actions={[
          { label: "Home", href: `/projects/${project.id}` },
          { label: "Understanding", href: `/projects/${project.id}/understanding` },
        ]}
      />

      {feedbackMessage ? (
        <div className={error ? "callout-danger" : "callout-info"}>{feedbackMessage}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard eyebrow="Discovery" title="Refresh AI-discovered topics">
          <p>
            Use the latest completed Repo 1 study to extract migration-sized product features. This is the inventory layer that sits between repo understanding and future proposal generation.
          </p>
          <form action={`/api/projects/${project.id}/features/discover`} method="post" className="mt-5 flex justify-start">
            <button type="submit" className="control-button-primary w-full sm:w-auto">
              Refresh feature inventory from Repo 1 study
            </button>
          </form>
        </SectionCard>

        <SectionCard eyebrow="Manual topic" title="Add an operator-suggested feature">
          <form action={`/api/projects/${project.id}/features/create`} method="post" className="space-y-3">
            <input
              type="text"
              name="canonicalName"
              className="field-input"
              placeholder="Feature name, for example Standards alignment workflow"
            />
            <textarea
              name="summary"
              rows={4}
              className="field-textarea"
              placeholder="Why this topic matters and what part of the migration it represents."
            />
            <input
              type="text"
              name="tags"
              className="field-input"
              placeholder="Optional tags separated by commas"
            />
            <div className="flex justify-end">
              <button type="submit" className="control-button-secondary w-full sm:w-auto">
                Add manual topic
              </button>
            </div>
          </form>
        </SectionCard>
      </div>

      {selectedFeature ? (
        <>
          <SectionCard eyebrow="Selected feature" title={selectedFeature.canonicalName}>
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p>{selectedFeature.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge label={selectedFeature.status} tone={getFeatureStatusTone(selectedFeature.status)} />
                  <StatusBadge label={selectedFeature.priority} tone={selectedFeature.priority === "High" ? "warning" : selectedFeature.priority === "Medium" ? "info" : "neutral"} />
                  <StatusBadge label={`${selectedFeature.confidence} confidence`} tone={selectedFeature.confidence === "High" ? "success" : selectedFeature.confidence === "Medium" ? "info" : "warning"} />
                </div>
              </div>
              <div className="surface-item p-4 sm:p-5">
                <p className="section-label text-[var(--ink-500)]">Evidence and tags</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink-700)]">
                  {selectedFeature.sourceEvidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {selectedFeature.tags.length > 0 ? <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">{selectedFeature.tags.join(" • ")}</p> : null}
                <div className="mt-5">
                  <DeleteFeatureButton
                    action={`/api/projects/${project.id}/features/${selectedFeature.id}/delete`}
                    featureName={selectedFeature.canonicalName}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Feature study" title={`${roleLabel(selectedStudy.role)} workspace`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { role: "Source" as const, latestRun: sourceRun },
                { role: "Target" as const, latestRun: targetRun },
              ]).map(({ role, latestRun }) => {
                const selected = role === selectedStudy.role;

                return (
                  <Link
                    key={role}
                    href={buildFeatureHref(project.id, selectedFeature.id, role)}
                    className={`surface-item block p-4 transition ${
                      selected
                        ? "border-[rgba(50,95,155,0.28)] bg-[rgba(50,95,155,0.06)] shadow-[0_14px_34px_rgba(50,95,155,0.08)]"
                        : "hover:border-[rgba(50,95,155,0.18)] hover:bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-base font-semibold text-[var(--ink-950)]">{roleLabel(role)}</p>
                      {selected ? <StatusBadge label="Open below" tone="info" /> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusBadge label={latestRun?.status ?? "Not studied"} tone={latestRun?.status === "Complete" ? "success" : latestRun?.status === "Failed" ? "danger" : latestRun ? "info" : "neutral"} />
                      <StatusBadge label={latestRun ? `Latest v${latestRun.version}` : "No runs yet"} tone="info" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">
                      {role === "Source"
                        ? "Inspect how this feature actually behaves in Repo 1."
                        : "Inspect whether this feature exists in Repo 2 and where it would likely land if missing."}
                    </p>
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 space-y-4">
              <div className="surface-item p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <p>Study this feature in {roleLabel(selectedStudy.role)} to capture real behavior, relevant paths, and migration implications.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <StatusBadge label={selectedStudy.latestRun?.status ?? "Not studied"} tone={selectedStudy.latestRun?.status === "Complete" ? "success" : selectedStudy.latestRun?.status === "Failed" ? "danger" : selectedStudy.latestRun ? "info" : "neutral"} />
                      <StatusBadge label={selectedStudy.latestRun ? `Latest v${selectedStudy.latestRun.version}` : "No runs yet"} tone="info" />
                    </div>
                  </div>
                </div>
                <form action={`/api/projects/${project.id}/features/${selectedFeature.id}/study`} method="post" className="mt-5 space-y-3">
                  <input type="hidden" name="repositoryRole" value={selectedStudy.role} />
                  <textarea
                    name="guidance"
                    rows={4}
                    className="field-textarea"
                    placeholder={selectedStudy.role === "Source"
                      ? "Optional Repo 1 guidance. Use this to narrow the study to a workflow, subsystem, or implementation assumption."
                      : "Optional Repo 2 guidance. Example: This feature does not exist in Repo 2 today. Focus on analogous areas or where it would most likely live."}
                  />
                  <p className="text-xs leading-6 text-[var(--ink-500)]">
                    Guidance is optional. Use it to say the feature is missing in this repo, point to likely analogs, or constrain the next pass.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button type="submit" className="control-button-primary w-full sm:w-auto">Study {roleLabel(selectedStudy.role)}</button>
                    {selectedStudy.latestRun?.status === "Complete" ? (
                      <button type="submit" name="continueFromRunId" value={selectedStudy.latestRun.id} className="control-button-secondary w-full sm:w-auto">Continue study</button>
                    ) : null}
                  </div>
                </form>
              </div>

              {selectedStudy.latestRun?.understanding ? (
                <>
                  <div className="surface-item p-4 sm:p-5">
                    <p className="font-medium text-[var(--ink-950)]">Summary</p>
                    <p className="mt-3 text-sm leading-7 text-[var(--ink-700)]">{selectedStudy.latestRun.understanding.summary}</p>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <StudyListCard title="Feature definition" items={selectedStudy.latestRun.understanding.featureDefinition} />
                    <StudyListCard title="User value" items={selectedStudy.latestRun.understanding.userValue} />
                    <StudyListCard title="Workflows" items={selectedStudy.latestRun.understanding.workflows} />
                    <StudyListCard title="Workflow narrative" items={selectedStudy.latestRun.understanding.workflowNarrative} />
                    <StudyListCard title="Existing behavior" items={selectedStudy.latestRun.understanding.existingBehavior} />
                    <StudyListCard title="Relevant paths" items={selectedStudy.latestRun.understanding.relevantPaths} />
                    <StudyListCard title="Core touchpoints" items={selectedStudy.latestRun.understanding.coreTouchpoints} />
                    <StudyListCard title="Important data" items={selectedStudy.latestRun.understanding.importantData} />
                    <StudyListCard title="AI involvement" items={selectedStudy.latestRun.understanding.aiInvolvement} />
                    <StudyListCard title="Dependencies" items={selectedStudy.latestRun.understanding.dependencies} />
                    <StudyListCard title="Distinctive behaviors" items={selectedStudy.latestRun.understanding.distinctiveBehaviors} />
                    <StudyListCard title="Architecture notes" items={selectedStudy.latestRun.understanding.architectureNotes} />
                    <StudyListCard title="Migration interpretation" items={selectedStudy.latestRun.understanding.migrationInterpretation} />
                    <StudyListCard title="Rebuild implications" items={selectedStudy.latestRun.understanding.rebuildImplications} />
                    <StudyListCard title="Confidence assessment" items={selectedStudy.latestRun.understanding.confidenceAssessment} />
                    <StudyListCard title="Confidence notes" items={selectedStudy.latestRun.understanding.confidenceNotes} />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-3">
                    <StudyListCard title="Strategic importance" items={selectedStudy.latestRun.strategicImportance} />
                    <StudyListCard title="High confidence areas" items={selectedStudy.latestRun.highConfidenceAreas} />
                    <StudyListCard title="Weak confidence areas" items={selectedStudy.latestRun.weakConfidenceAreas} />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                    <form action={`/api/projects/${project.id}/features/${selectedFeature.id}/study/guidance`} method="post" className="space-y-3">
                      <input type="hidden" name="runId" value={selectedStudy.latestRun.id} />
                      <input type="hidden" name="repositoryRole" value={selectedStudy.role} />
                      <textarea name="guidance" rows={5} className="field-textarea" placeholder={`Add ${roleLabel(selectedStudy.role)} guidance for the next pass.`} />
                      <div className="flex justify-end">
                        <button type="submit" className="control-button-primary w-full sm:w-auto">Save guidance</button>
                      </div>
                    </form>
                    <div className="surface-item-compact p-4 text-sm leading-7 text-[var(--ink-700)]">
                      <p className="font-medium text-[var(--ink-950)]">Recent runs</p>
                      <div className="mt-3 space-y-3">
                        {selectedStudy.recentRuns.length > 0 ? selectedStudy.recentRuns.map((run) => (
                          <article key={run.id} className="surface-item p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="font-medium text-[var(--ink-950)]">v{run.version}</p>
                              <StatusBadge label={run.status} tone={run.status === "Complete" ? "success" : run.status === "Failed" ? "danger" : "info"} />
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{formatTimestamp(run.completedAt ?? run.startedAt ?? run.createdAt)}</p>
                          </article>
                        )) : <p>No prior runs yet.</p>}
                      </div>
                    </div>
                  </div>
                </>
              ) : selectedStudy.latestRun?.understandingError ? <div className="callout-danger">{selectedStudy.latestRun.understandingError}</div> : <div className="callout-info">No study output recorded yet.</div>}
            </div>
          </SectionCard>

          <div id="feature-mapping">
          <SectionCard eyebrow="Mapping" title="Source-target comparison">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <p>Use this mapping to understand what already exists in Repo 2, what only partially exists, and what remains missing for this feature.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge label={mapping ? mapping.status : "Not mapped"} tone={mapping ? "success" : "neutral"} />
                  <StatusBadge label={hasBothStudies ? "Both studies complete" : "Both studies required"} tone={hasBothStudies ? "success" : "warning"} />
                </div>
              </div>
              <form action={`/api/projects/${project.id}/features/${selectedFeature.id}/mapping`} method="post">
                <button type="submit" className="control-button-secondary w-full sm:w-auto" disabled={!hasBothStudies}>Refresh mapping</button>
              </form>
            </div>

            {mapping ? (
              <div className="mt-4 space-y-4">
                <div className="surface-item p-4 sm:p-5">
                  <p className="font-medium text-[var(--ink-950)]">Summary</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink-700)]">{mapping.summary}</p>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <StudyListCard title="Source behavior" items={mapping.sourceBehavior} />
                  <StudyListCard title="Already in Repo 2" items={mapping.existingInTarget} />
                  <StudyListCard title="Partially in Repo 2" items={mapping.partialInTarget} />
                  <StudyListCard title="Missing in Repo 2" items={mapping.missingInTarget} />
                  <StudyListCard title="Governing patterns" items={mapping.governingPatterns} />
                  <StudyListCard title="Recommended next steps" items={mapping.recommendedNextSteps} />
                </div>
              </div>
            ) : (
              <div className="callout-info mt-4">Complete Repo 1 and Repo 2 feature studies, then refresh mapping.</div>
            )}
          </SectionCard>
          </div>

          <SectionCard eyebrow="Proposal" title="Implementation proposal">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <p>Use grounded feature intelligence, mapping, and approved doctrine to define what should be built in Repo 2 before any execution starts.</p>
                {latestProposal ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge label={latestProposal.status} tone={getProposalStatusTone(latestProposal.status)} />
                    <StatusBadge label={`Proposal v${latestProposal.version}`} tone="info" />
                    <StatusBadge label={`Doctrine ${proposalReadiness?.doctrineVersion ? `v${proposalReadiness.doctrineVersion.version}` : "missing"}`} tone={proposalReadiness?.doctrineVersion ? "info" : "warning"} />
                    <StatusBadge label={latestProposal.approvedAt ? `Approved ${formatTimestamp(latestProposal.approvedAt)}` : `Updated ${formatTimestamp(latestProposal.updatedAt)}`} tone="neutral" />
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge label={proposalReadiness?.ready ? "Ready to generate" : "Blocked"} tone={proposalReadiness?.ready ? "success" : "warning"} />
                    <StatusBadge label={proposalReadiness?.doctrineVersion ? `Doctrine v${proposalReadiness.doctrineVersion.version}` : "Doctrine missing"} tone={proposalReadiness?.doctrineVersion ? "info" : "warning"} />
                  </div>
                )}
              </div>
              <form action={`/api/projects/${project.id}/features/${selectedFeature.id}/proposal/generate`} method="post">
                <button type="submit" className="control-button-primary w-full sm:w-auto" disabled={!proposalReadiness?.ready}>
                  {latestProposal ? "Regenerate proposal" : "Generate proposal"}
                </button>
              </form>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {proposalReadiness?.checks.map((check) => {
                const action = !check.satisfied && selectedFeature
                  ? getProposalCheckAction({
                      checkLabel: check.label,
                      projectId: project.id,
                      featureId: selectedFeature.id,
                      repositoryRole: selectedStudy.role,
                    })
                  : null;

                return (
                <div key={check.label} className="surface-item-compact p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-[var(--ink-950)]">{check.label}</p>
                    <StatusBadge label={check.satisfied ? "Ready" : "Blocked"} tone={check.satisfied ? "success" : "warning"} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{check.detail}</p>
                  {action ? (
                    <div className="mt-4">
                      <Link href={action.href} className="control-button-secondary inline-flex">
                        {action.label}
                      </Link>
                    </div>
                  ) : null}
                </div>
              );})}
            </div>

            {latestProposal ? (
              <div className="mt-4 space-y-4">
                <form action={`/api/projects/${project.id}/features/${selectedFeature.id}/proposal/update`} method="post" className="space-y-4">
                  <input type="hidden" name="proposalId" value={latestProposal.id} />
                  <details className="surface-item p-4 sm:p-5" open>
                    <summary className="cursor-pointer list-none font-medium text-[var(--ink-950)]">AI proposal output</summary>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">AI-generated proposal sections, design options, strategic questions, and revision delta.</p>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="proposalSummary">Proposal summary</label>
                        <textarea id="proposalSummary" name="proposalSummary" rows={5} defaultValue={editableProposal?.proposalSummary} className="field-textarea mt-3" />
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="sourceBehaviorSummary">Source behavior</label>
                          <textarea id="sourceBehaviorSummary" name="sourceBehaviorSummary" rows={8} defaultValue={editableProposal?.sourceBehaviorSummary} className="field-textarea mt-3" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="targetContextSummary">Target context</label>
                          <textarea id="targetContextSummary" name="targetContextSummary" rows={8} defaultValue={editableProposal?.targetContextSummary} className="field-textarea mt-3" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="gapAssessment">Gap assessment</label>
                          <textarea id="gapAssessment" name="gapAssessment" rows={8} defaultValue={editableProposal?.gapAssessment} className="field-textarea mt-3" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="governingV2Patterns">Governing V2 patterns</label>
                          <textarea id="governingV2Patterns" name="governingV2Patterns" rows={8} defaultValue={editableProposal?.governingV2Patterns} className="field-textarea mt-3" />
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-[var(--ink-950)]">Design direction options</p>
                        <div className="mt-3 grid gap-4 xl:grid-cols-3">
                          {editableProposal?.designDirectionOptions.map((option) => (
                            <div key={`${option.title}-${option.posture}`} className="surface-item-compact p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium text-[var(--ink-950)]">{option.title}</p>
                                <StatusBadge label={option.posture} tone={option.posture === "Recommended / V2-native" ? "success" : option.posture === "More Ambitious" ? "warning" : "info"} />
                              </div>
                              <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{option.description}</p>
                              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-500)]">Pros</p>
                              <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--ink-700)]">{option.pros.map((item) => <li key={item}>{item}</li>)}</ul>
                              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-500)]">Cons</p>
                              <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--ink-700)]">{option.cons.map((item) => <li key={item}>{item}</li>)}</ul>
                              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-500)]">Doctrine alignment</p>
                              <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--ink-700)]">{option.doctrineAlignment.map((item) => <li key={item}>{item}</li>)}</ul>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="recommendedBuildShape">Recommended build shape</label>
                          <textarea id="recommendedBuildShape" name="recommendedBuildShape" rows={8} defaultValue={editableProposal?.recommendedBuildShape} className="field-textarea mt-3" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="operatorDesignQuestions">Operator design questions</label>
                          <textarea id="operatorDesignQuestions" name="operatorDesignQuestions" rows={8} defaultValue={editableProposal?.operatorDesignQuestions} className="field-textarea mt-3" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="explicitNonGoals">Explicit non-goals</label>
                          <textarea id="explicitNonGoals" name="explicitNonGoals" rows={8} defaultValue={editableProposal?.explicitNonGoals} className="field-textarea mt-3" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="risksAndUnknowns">Risks and unknowns</label>
                          <textarea id="risksAndUnknowns" name="risksAndUnknowns" rows={8} defaultValue={editableProposal?.risksAndUnknowns} className="field-textarea mt-3" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="questionsForOperator">Additional follow-up questions</label>
                          <textarea id="questionsForOperator" name="questionsForOperator" rows={8} defaultValue={editableProposal?.questionsForOperator} className="field-textarea mt-3" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="suggestedImplementationScope">Suggested implementation scope</label>
                          <textarea id="suggestedImplementationScope" name="suggestedImplementationScope" rows={8} defaultValue={editableProposal?.suggestedImplementationScope} className="field-textarea mt-3" />
                        </div>
                      </div>

                      <div className="surface-item-compact p-4">
                        <p className="font-medium text-[var(--ink-950)]">Revision delta</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink-700)]">
                          {latestProposal.content.revisionDelta.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                    </div>
                  </details>

                  <details className="surface-item p-4 sm:p-5" open>
                    <summary className="cursor-pointer list-none font-medium text-[var(--ink-950)]">Operator input workspace</summary>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">Use this space to shape product direction before requesting the next proposal revision.</p>
                    <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="operatorNotes">Operator notes</label>
                          <p className="mt-1 text-sm leading-6 text-[var(--ink-700)]">Freeform thinking space for rough ideas, strategy notes, gut reactions, and incomplete thoughts.</p>
                          <textarea id="operatorNotes" name="operatorNotes" rows={6} defaultValue={latestProposal.operatorNotes} className="field-textarea mt-3" placeholder="Capture rough thinking, ideas, reactions, and strategy notes here." />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="productDirectionDecisions">Product direction decisions</label>
                          <p className="mt-1 text-sm leading-6 text-[var(--ink-700)]">Short intentional answers that define how this feature should feel and behave.</p>
                          <textarea id="productDirectionDecisions" name="productDirectionDecisions" rows={6} defaultValue={latestProposal.productDirectionDecisions} className="field-textarea mt-3" placeholder="Example: This should feel like guided discovery, not search." />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="constraintsNonNegotiables">Constraints / non-negotiables</label>
                          <p className="mt-1 text-sm leading-6 text-[var(--ink-700)]">Explicit guardrails the next revision must obey.</p>
                          <textarea id="constraintsNonNegotiables" name="constraintsNonNegotiables" rows={6} defaultValue={latestProposal.constraintsNonNegotiables} className="field-textarea mt-3" placeholder="Example: Must integrate with the artifact system and cannot introduce new standalone pages." />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="operatorResponses">Responses to AI questions</label>
                          <textarea id="operatorResponses" name="operatorResponses" rows={6} defaultValue={latestProposal.operatorResponses} className="field-textarea mt-3" placeholder="Answer the proposal design questions or follow-up questions here." />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="operatorComments">Proposal commentary</label>
                          <textarea id="operatorComments" name="operatorComments" rows={6} defaultValue={latestProposal.operatorComments} className="field-textarea mt-3" placeholder="Use this for direct commentary on the current proposal draft." />
                        </div>
                        <div className="flex justify-end">
                          <button type="submit" className="control-button-secondary w-full sm:w-auto">Save co-design notes</button>
                        </div>
                      </div>
                    </div>
                  </details>

                  <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="surface-item-compact p-4 text-sm leading-7 text-[var(--ink-700)]">
                      <p className="font-medium text-[var(--ink-950)]">Proposal history</p>
                      <div className="mt-3 space-y-3">
                        {latestProposal.revisionHistory.length > 0 ? latestProposal.revisionHistory.slice().reverse().map((entry) => (
                          <article key={`${entry.version}-${entry.createdAt}-${entry.action}`} className="surface-item p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="font-medium text-[var(--ink-950)]">v{entry.version} {entry.action.toLowerCase()}</p>
                              <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">{entry.actor}</p>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{formatTimestamp(entry.createdAt)}</p>
                            {entry.note ? <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{entry.note}</p> : null}
                          </article>
                        )) : <p>No proposal history recorded yet.</p>}
                      </div>
                    </div>
                    <div className="surface-item-compact p-4 text-sm leading-7 text-[var(--ink-700)]">
                      <p className="font-medium text-[var(--ink-950)]">How revision works now</p>
                      <ul className="mt-3 space-y-2">
                        <li>AI proposal sections remain editable and reviewable.</li>
                        <li>Operator notes, product decisions, constraints, and responses become structured inputs to the next revision.</li>
                        <li>Revised proposals are expected to explain what changed and why in the revision delta.</li>
                      </ul>
                    </div>
                  </div>
                </form>

                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <form action={`/api/projects/${project.id}/features/${selectedFeature.id}/proposal/revise`} method="post" className="surface-item p-4 sm:p-5 space-y-3">
                    <label className="block text-sm font-medium text-[var(--ink-950)]" htmlFor="revisionNote">Request revision</label>
                    <textarea id="revisionNote" name="revisionNote" rows={5} className="field-textarea" placeholder="Explain what should change in the next proposal draft. The generator will use the saved proposal review notes and responses too." />
                    <div className="flex justify-end">
                      <button type="submit" className="control-button-primary w-full sm:w-auto">Request revision</button>
                    </div>
                  </form>

                  <form action={`/api/projects/${project.id}/features/${selectedFeature.id}/proposal/approve`} method="post" className="surface-item p-4 sm:p-5 space-y-3">
                    <input type="hidden" name="proposalId" value={latestProposal.id} />
                    <p className="font-medium text-[var(--ink-950)]">Approve proposal</p>
                    <p className="text-sm leading-6 text-[var(--ink-700)]">Approving this marks the proposal as the accepted implementation direction for later execution. It does not start coding.</p>
                    <div className="flex justify-end">
                      <button type="submit" className="control-button-secondary w-full sm:w-auto" disabled={latestProposal.status === "Approved"}>Approve proposal</button>
                    </div>
                  </form>
                </div>
              </div>
            ) : proposalReadiness?.ready ? (
              <div className="callout-info mt-4">Proposal generation is ready. Generate the first draft to establish the approval boundary for this feature.</div>
            ) : (
              <div className="callout-info mt-4">Proposal generation is blocked until the studies, mapping, and approved doctrine are all in place.</div>
            )}
          </SectionCard>
        </>
      ) : null}

      <SectionCard eyebrow="Inventory" title={`${features.length} tracked feature topic${features.length === 1 ? "" : "s"}`}>
        {features.length > 0 ? (
          <div className="space-y-3">
            {features.map((feature) => {
              const selected = feature.id === selectedFeature?.id;

              return (
                <Link
                  key={feature.id}
                  href={`/projects/${project.id}/features?feature=${feature.id}`}
                  className={`surface-item block p-4 sm:p-5 transition ${
                    selected
                      ? "border-[rgba(50,95,155,0.28)] bg-[rgba(50,95,155,0.06)] shadow-[0_14px_34px_rgba(50,95,155,0.08)]"
                      : "hover:border-[rgba(50,95,155,0.18)] hover:bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-[var(--ink-950)]">{feature.canonicalName}</p>
                        {selected ? <StatusBadge label="Open below" tone="info" /> : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{feature.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge label={feature.status} tone={getFeatureStatusTone(feature.status)} />
                      <StatusBadge label={feature.priority} tone={feature.priority === "High" ? "warning" : feature.priority === "Medium" ? "info" : "neutral"} />
                      <StatusBadge label={`${feature.confidence} confidence`} tone={feature.confidence === "High" ? "success" : feature.confidence === "Medium" ? "info" : "warning"} />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge label={formatSourceLabel(feature.discoverySource)} tone="neutral" />
                    {feature.latestSourceStudyRunId ? <StatusBadge label="Repo 1 studied" tone="success" /> : <StatusBadge label="Repo 1 not studied" tone="warning" />}
                    {feature.latestTargetStudyRunId ? <StatusBadge label="Repo 2 studied" tone="success" /> : <StatusBadge label="Repo 2 not studied" tone="warning" />}
                    {feature.latestMappingSummaryId ? <StatusBadge label="Mapping ready" tone="success" /> : <StatusBadge label="Mapping pending" tone="neutral" />}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    {feature.tags.length > 0 ? (
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">{feature.tags.join(" • ")}</p>
                    ) : <span />}
                    <span className="text-sm font-medium text-[var(--signal-blue)]">Open study workspace</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="callout-info">
            No feature topics have been recorded yet. Run Repo 1 study first, then refresh discovery, or add a manual topic to start focused study.
          </div>
        )}
      </SectionCard>
    </div>
  );
}