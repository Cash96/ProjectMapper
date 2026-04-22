import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteFeatureButton } from "@/components/delete-feature-button";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { FieldShell, NextActionCard, StepRail } from "@/components/workflow-primitives";
import { getLatestExecutionRun } from "@/lib/execution-store";
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

type FeatureDetailPageProps = {
  params: Promise<{ projectId: string; featureId: string }>;
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

function roleLabel(role: "Source" | "Target") {
  return role === "Source" ? "Repo 1" : "Repo 2";
}

function isRepositoryRole(value: string | undefined): value is "Source" | "Target" {
  return value === "Source" || value === "Target";
}

function buildFeatureHref(
  projectId: string,
  featureId: string,
  options?: { repositoryRole?: "Source" | "Target"; step?: number },
) {
  const searchParams = new URLSearchParams();

  if (options?.repositoryRole) {
    searchParams.set("repositoryRole", options.repositoryRole);
  }

  if (options?.step) {
    searchParams.set("step", String(options.step));
  }

  const query = searchParams.toString();
  return `/projects/${projectId}/features/${featureId}${query ? `?${query}` : ""}`;
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
      href: buildFeatureHref(input.projectId, input.featureId, { repositoryRole: input.repositoryRole, step: 3 }),
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

function getExecutionStatusTone(status: "NotStarted" | "Running" | "Blocked" | "AwaitingReview" | "Completed" | "Aborted") {
  if (status === "Completed") {
    return "success" as const;
  }

  if (status === "Blocked") {
    return "warning" as const;
  }

  if (status === "Aborted") {
    return "danger" as const;
  }

  if (status === "AwaitingReview") {
    return "info" as const;
  }

  if (status === "Running") {
    return "info" as const;
  }

  return "neutral" as const;
}

function formatExecutionAgentRole(role: "ProposalCompliance" | "Coder" | "DesignPhilosophy" | "UiUx" | "QaRisk") {
  if (role === "ProposalCompliance") {
    return "Proposal compliance";
  }

  if (role === "DesignPhilosophy") {
    return "Design philosophy";
  }

  if (role === "UiUx") {
    return "UI/UX";
  }

  if (role === "QaRisk") {
    return "QA / risk";
  }

  return "Coder";
}

function getExecutionAgentReviewTone(status: "Pending" | "Approved" | "NeedsOperatorInput") {
  if (status === "Approved") {
    return "success" as const;
  }

  if (status === "NeedsOperatorInput") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function getInvestigationStatusTone(status: "NotStarted" | "InProgress" | "Completed") {
  if (status === "Completed") {
    return "success" as const;
  }

  if (status === "InProgress") {
    return "info" as const;
  }

  return "neutral" as const;
}

function getDecisionConfidenceTone(confidence: "Low" | "Medium" | "High" | undefined) {
  if (confidence === "High") {
    return "success" as const;
  }

  if (confidence === "Medium") {
    return "info" as const;
  }

  if (confidence === "Low") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function formatDecisionCategory(category: "ImplementationDetail" | "LowRiskAssumption" | "ProductDecision" | "AccessIssue" | "HighImpactAmbiguity" | undefined) {
  if (category === "ImplementationDetail") {
    return "Implementation detail";
  }

  if (category === "LowRiskAssumption") {
    return "Low-risk assumption";
  }

  if (category === "ProductDecision") {
    return "Product decision";
  }

  if (category === "AccessIssue") {
    return "Access issue";
  }

  if (category === "HighImpactAmbiguity") {
    return "High-impact ambiguity";
  }

  return "Unclassified";
}

function isExecutionWorkspaceActive(status: "NotStarted" | "Running" | "Blocked" | "AwaitingReview" | "Completed" | "Aborted" | undefined) {
  return Boolean(status && status !== "Completed" && status !== "Aborted" && status !== "NotStarted");
}

function uniqueQuestionItems(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim();

    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function buildOperatorResponseFieldName(question: string, index: number) {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `operatorResponse__${index}__${slug || "question"}`;
}

function parseStoredOperatorResponses(value: string) {
  const responseMap = new Map<string, string>();
  const matches = [...value.matchAll(/Q:\s*([\s\S]+?)\s+A:\s*([\s\S]+?)(?=\s+Q:\s*|$)/g)];

  for (const match of matches) {
    const question = match[1]?.trim();
    const answer = match[2]?.trim();

    if (!question || !answer) {
      continue;
    }

    responseMap.set(question, answer);
  }

  const unmatchedText = matches.length > 0
    ? value.replace(/Q:\s*[\s\S]+?\s+A:\s*[\s\S]+?(?=\s+Q:\s*|$)/g, "").trim()
    : value.trim();

  return {
    responseMap,
    unmatchedText,
  };
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
  deleted?: string;
  deletedName?: string;
  execution?: string;
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

  if (input.execution === "started") {
    return "Execution started.";
  }

  if (input.execution === "blocked") {
    return "Execution paused for operator input.";
  }

  if (input.execution === "continued") {
    return "Execution continued.";
  }

  if (input.execution === "awaiting-review") {
    return "Execution finished and is awaiting review.";
  }

  if (input.execution === "aborted") {
    return "Execution was aborted.";
  }

  if (input.execution === "approved") {
    return "Execution approved.";
  }

  if (input.execution === "rejected") {
    return "Execution rejected.";
  }

  if (input.study && input.role && input.version) {
    return `${input.role === "Source" ? "Repo 1" : "Repo 2"} feature study v${input.version} ${input.study.replace(/-/g, " ")}.`;
  }

  if (input.mapping === "refreshed") {
    return "Feature mapping summary refreshed.";
  }

  return undefined;
}

export default async function FeatureDetailPage({ params, searchParams }: FeatureDetailPageProps) {
  const { projectId, featureId } = await params;
  const query = await searchParams;
  const project = await getProject(projectId);
  const [feature, sourceRun, targetRun, sourceRecentRuns, targetRecentRuns, mapping, latestProposal, proposalReadiness, latestExecutionRun, features] = await Promise.all([
    readFeatureInventoryRecord(projectId, featureId),
    getLatestFeatureStudyRun(projectId, featureId, "Source"),
    getLatestFeatureStudyRun(projectId, featureId, "Target"),
    getRecentFeatureStudyRuns(projectId, featureId, "Source", 4),
    getRecentFeatureStudyRuns(projectId, featureId, "Target", 4),
    getLatestFeatureMappingSummary(projectId, featureId),
    getLatestFeatureProposal(projectId, featureId),
    getFeatureProposalReadiness(projectId, featureId),
    getLatestExecutionRun(projectId, featureId),
    listFeatureInventory(projectId),
  ]);

  if (!feature) {
    notFound();
  }

  const feedbackMessage = buildFeedbackMessage({
    error: getSearchValue(query.error),
    deleted: getSearchValue(query.deleted),
    deletedName: getSearchValue(query.deletedName),
    execution: getSearchValue(query.execution),
    guidance: getSearchValue(query.guidance),
    proposal: getSearchValue(query.proposal),
    proposalVersion: getSearchValue(query.proposalVersion),
    study: getSearchValue(query.study),
    mapping: getSearchValue(query.mapping),
    role: getSearchValue(query.role),
    version: getSearchValue(query.version),
  });
  const sourceStudyComplete = sourceRun?.status === "Complete";
  const targetStudyComplete = targetRun?.status === "Complete";
  const hasBothStudies = Boolean(sourceStudyComplete && targetStudyComplete);
  const requestedRepositoryRole = getSearchValue(query.repositoryRole) ?? getSearchValue(query.role);
  const requestedStep = Number.parseInt(getSearchValue(query.step) ?? "", 10);
  const currentStep = !sourceStudyComplete ? 1 : !targetStudyComplete ? 2 : !mapping ? 3 : !latestProposal ? 4 : 5;
  const defaultStep = requestedRepositoryRole === "Source" ? 1 : requestedRepositoryRole === "Target" ? 2 : currentStep;
  const activeStep = [1, 2, 3, 4, 5].includes(requestedStep) ? requestedStep : defaultStep;
  const selectedRepositoryRole = activeStep === 2
    ? "Target"
    : activeStep === 1
      ? "Source"
      : isRepositoryRole(requestedRepositoryRole)
        ? requestedRepositoryRole
        : !sourceStudyComplete
          ? "Source"
          : !targetStudyComplete
            ? "Target"
            : "Source";
  const selectedStudy = selectedRepositoryRole === "Source"
    ? { role: "Source" as const, latestRun: sourceRun, recentRuns: sourceRecentRuns }
    : { role: "Target" as const, latestRun: targetRun, recentRuns: targetRecentRuns };
  const editableProposal = latestProposal ? buildEditableProposalContent(latestProposal.content) : null;
  const reviewQuestions = latestProposal
    ? uniqueQuestionItems([
        ...latestProposal.content.operatorDesignQuestions,
        ...latestProposal.content.questionsForOperator,
      ])
    : [];
  const parsedOperatorResponses = latestProposal
    ? parseStoredOperatorResponses(latestProposal.operatorResponses)
    : { responseMap: new Map<string, string>(), unmatchedText: "" };
  const answeredReviewQuestionCount = reviewQuestions.filter((question) => {
    const answer = parsedOperatorResponses.responseMap.get(question);
    return Boolean(answer && answer.trim().length > 0);
  }).length;
  const openExecutionMessages = latestExecutionRun?.agentMessages.filter((message) => message.status === "Open") ?? [];
  const executionDecisionMessages = latestExecutionRun?.agentMessages.filter((message) => message.kind === "Question") ?? [];
  const proposalApproved = latestProposal?.status === "Approved";
  const executionWorkspaceActive = isExecutionWorkspaceActive(latestExecutionRun?.status);
  const executionNeedsOperatorInput = latestExecutionRun?.status === "Blocked" && openExecutionMessages.length > 0;
  const showProposalReviewWorkspace = Boolean(latestProposal && latestProposal.status !== "Approved");
  const showApprovedExecutionSummary = Boolean(proposalApproved);
  const executionQuestionsTitle = latestExecutionRun?.status === "Aborted"
    ? "Unresolved operator decisions from last run"
    : "Decisions requiring operator input";
  const executionQuestionsBadgeLabel = latestExecutionRun?.status === "Aborted"
    ? `${openExecutionMessages.length} unresolved`
    : `${openExecutionMessages.length} open`;
  const executionQuestionsIntro = latestExecutionRun?.status === "Aborted"
    ? "The last run ended before these operator decisions were captured. Resolve them now so the next attempt starts with the investigation context already in place."
    : "These are the only decisions the agent could not safely close through investigation. Once answered, execution resumes from the current branch and plan.";
  const hasExecutionControls = Boolean(
    latestExecutionRun && latestExecutionRun.status !== "Aborted" && latestExecutionRun.status !== "Completed",
  );
  const canStartExecution = latestProposal?.status === "Approved"
    && (!latestExecutionRun || ["Completed", "Aborted"].includes(latestExecutionRun.status));
  const featureNextAction = !sourceStudyComplete
    ? {
        eyebrow: "Immediate next move",
        title: "Run Repo 1 feature study",
        description: "Start with the source implementation so the migration unit has real behavioral grounding before target analysis begins.",
        action: { label: "Study Repo 1", href: buildFeatureHref(project.id, feature.id, { repositoryRole: "Source", step: 1 }) },
        badges: [{ label: "Step 1", tone: "info" as const }],
      }
    : !targetStudyComplete
      ? {
          eyebrow: "Immediate next move",
          title: "Run Repo 2 feature study",
          description: "Use the source understanding to inspect whether the target already has an analog, partial implementation, or gap.",
          action: { label: "Study Repo 2", href: buildFeatureHref(project.id, feature.id, { repositoryRole: "Target", step: 2 }) },
          badges: [{ label: "Step 2", tone: "info" as const }],
        }
      : !mapping
        ? {
            eyebrow: "Immediate next move",
            title: "Refresh the mapping",
            description: "Now that both studies exist, compare them to establish what is missing, partial, or already present in Repo 2.",
            action: { label: "Open mapping", href: buildFeatureHref(project.id, feature.id, { step: 3 }) },
            badges: [{ label: "Step 3", tone: "info" as const }],
          }
        : !latestProposal
          ? {
              eyebrow: "Immediate next move",
              title: "Generate the proposal boundary",
              description: "Use study output, mapping, and doctrine to define the implementation direction before any execution starts.",
              action: { label: "Open proposal", href: buildFeatureHref(project.id, feature.id, { step: 4 }) },
              badges: [{ label: "Step 4", tone: "info" as const }],
            }
          : latestProposal.status !== "Approved"
            ? {
                eyebrow: "Immediate next move",
                title: "Refine and approve the proposal",
                description: "Use review notes and co-design inputs to tighten the proposal until it becomes the approved execution boundary.",
                action: { label: "Open review", href: buildFeatureHref(project.id, feature.id, { step: 5 }) },
                badges: [{ label: latestProposal.status, tone: getProposalStatusTone(latestProposal.status) }],
              }
            : canStartExecution
              ? {
                  eyebrow: "Immediate next move",
                  title: "Start controlled execution",
                  description: "The proposal is approved. The feature is ready to move into branch-based, proposal-bound execution.",
                  action: { label: "Open execution", href: buildFeatureHref(project.id, feature.id, { step: 5 }) },
                  badges: [{ label: "Ready", tone: "success" as const }],
                }
              : {
                  eyebrow: "Execution state",
                  title: "Review the active build run",
                  description: "Execution is already in progress or awaiting review. Use the execution workspace to inspect logs, questions, and review output.",
                  action: { label: "Open execution", href: buildFeatureHref(project.id, feature.id, { step: 5 }) },
                  badges: latestExecutionRun ? [{ label: latestExecutionRun.status, tone: getExecutionStatusTone(latestExecutionRun.status) }] : [],
                };
  const workflowSteps: Parameters<typeof StepRail>[0]["steps"] = [
    {
      number: 1,
      title: "Repo 1 study",
      description: "Capture source behavior, workflows, and implementation touchpoints.",
      state: sourceStudyComplete ? "complete" : activeStep === 1 ? "current" : "upcoming",
      badges: [{ label: sourceRun?.status ?? "Not studied", tone: sourceStudyComplete ? "success" : sourceRun ? "info" : "neutral" }],
    },
    {
      number: 2,
      title: "Repo 2 study",
      description: "Inspect target reality and likely landing zones for the migration.",
      state: targetStudyComplete ? "complete" : activeStep === 2 ? "current" : "upcoming",
      badges: [{ label: targetRun?.status ?? "Not studied", tone: targetStudyComplete ? "success" : targetRun ? "info" : "neutral" }],
    },
    {
      number: 3,
      title: "Mapping",
      description: "Compare both studies to define what exists, what is partial, and what is missing.",
      state: mapping ? "complete" : activeStep === 3 ? "current" : "upcoming",
      badges: [{ label: mapping ? mapping.status : "Not mapped", tone: mapping ? "success" : "neutral" }],
    },
    {
      number: 4,
      title: "Proposal",
      description: "Generate the approved implementation direction for the feature.",
      state: latestProposal ? (activeStep === 4 ? "current" : "complete") : activeStep === 4 ? "current" : "upcoming",
      badges: latestProposal ? [{ label: latestProposal.status, tone: getProposalStatusTone(latestProposal.status) }] : undefined,
    },
    {
      number: 5,
      title: "Review / execution",
      description: "Shape the proposal, approve it, then control execution and review.",
      state: activeStep === 5 ? "current" : latestProposal ? "upcoming" : "upcoming",
      badges: latestProposal ? [{ label: latestProposal.status === "Approved" ? "Execution ready" : "Reviewing", tone: latestProposal.status === "Approved" ? "success" : "warning" }] : undefined,
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Feature workspace"
        title={feature.canonicalName}
        description={feature.summary}
        actions={[
          { label: "All features", href: `/projects/${project.id}/features` },
          { label: "Home", href: `/projects/${project.id}` },
        ]}
      />

      {feedbackMessage ? <div className={getSearchValue(query.error) ? "callout-danger" : "callout-info"}>{feedbackMessage}</div> : null}

      <div className="grid gap-4 2xl:grid-cols-[0.96fr_1.04fr]">
        <SectionCard eyebrow="Feature" title={feature.canonicalName}>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p>{feature.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge label={feature.status} tone={getFeatureStatusTone(feature.status)} />
                <StatusBadge label={feature.priority} tone={feature.priority === "High" ? "warning" : feature.priority === "Medium" ? "info" : "neutral"} />
                <StatusBadge label={`${feature.confidence} confidence`} tone={feature.confidence === "High" ? "success" : feature.confidence === "Medium" ? "info" : "warning"} />
                <StatusBadge label={`${features.length} tracked features`} tone="neutral" />
              </div>
            </div>
            <div className="surface-item p-4 sm:p-5">
              <p className="section-label text-[var(--ink-500)]">Evidence and tags</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink-700)]">
                {feature.sourceEvidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {feature.tags.length > 0 ? <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">{feature.tags.join(" • ")}</p> : null}
              <div className="mt-5">
                <DeleteFeatureButton action={`/api/projects/${project.id}/features/${feature.id}/delete`} featureName={feature.canonicalName} />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Workflow" title="Feature progression">
          <StepRail steps={workflowSteps} />
        </SectionCard>
      </div>

      <NextActionCard
        eyebrow={featureNextAction.eyebrow}
        title={featureNextAction.title}
        description={featureNextAction.description}
        action={"action" in featureNextAction ? featureNextAction.action : undefined}
        badges={featureNextAction.badges}
      />

      <SectionCard eyebrow="Focus" title="Active work area">
        <div className="flex flex-wrap gap-2">
          {workflowSteps.map((step) => (
            <Link
              key={step.number}
              href={buildFeatureHref(project.id, feature.id, {
                step: step.number,
                repositoryRole: step.number === 1 ? "Source" : step.number === 2 ? "Target" : undefined,
              })}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${activeStep === step.number
                ? "border-[rgba(50,95,155,0.28)] bg-[rgba(50,95,155,0.08)] text-[var(--ink-950)]"
                : "border-[rgba(15,23,42,0.12)] bg-white text-[var(--ink-700)] hover:border-[rgba(50,95,155,0.18)] hover:text-[var(--ink-950)]"}`}
            >
              Step {step.number}: {step.title}
            </Link>
          ))}
        </div>
      </SectionCard>

      {activeStep === 1 || activeStep === 2 ? (
        <SectionCard eyebrow={`Step ${activeStep}`} title={`${roleLabel(selectedStudy.role)} study workspace`}>
          <div className="space-y-4">
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
              <form action={`/api/projects/${project.id}/features/${feature.id}/study`} method="post" className="mt-5 space-y-3">
                <input type="hidden" name="repositoryRole" value={selectedStudy.role} />
                <FieldShell label={`Guidance for ${roleLabel(selectedStudy.role)}`} hint="Optional. Use this to say the feature is missing in this repo, point to likely analogs, or constrain the next pass.">
                  <textarea
                    name="guidance"
                    rows={4}
                    className="field-textarea"
                    placeholder={selectedStudy.role === "Source"
                      ? "Optional Repo 1 guidance. Use this to narrow the study to a workflow, subsystem, or implementation assumption."
                      : "Optional Repo 2 guidance. Example: This feature does not exist in Repo 2 today. Focus on analogous areas or where it would most likely live."}
                  />
                </FieldShell>
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
                </div>
                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <form action={`/api/projects/${project.id}/features/${feature.id}/study/guidance`} method="post" className="space-y-3">
                    <input type="hidden" name="runId" value={selectedStudy.latestRun.id} />
                    <input type="hidden" name="repositoryRole" value={selectedStudy.role} />
                    <FieldShell label="Saved guidance" hint="Use this to steer the next pass once you have read the current study output.">
                      <textarea name="guidance" rows={5} className="field-textarea" placeholder={`Add ${roleLabel(selectedStudy.role)} guidance for the next pass.`} />
                    </FieldShell>
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
      ) : null}

      {activeStep === 3 ? (
        <SectionCard eyebrow="Step 3" title="Source-target comparison">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p>Use this mapping to understand what already exists in Repo 2, what only partially exists, and what remains missing for this feature.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge label={mapping ? mapping.status : "Not mapped"} tone={mapping ? "success" : "neutral"} />
                <StatusBadge label={hasBothStudies ? "Both studies complete" : "Both studies required"} tone={hasBothStudies ? "success" : "warning"} />
              </div>
            </div>
            <form action={`/api/projects/${project.id}/features/${feature.id}/mapping`} method="post">
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
      ) : null}

      {activeStep === 4 ? (
        <SectionCard eyebrow="Step 4" title="Implementation proposal">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p>Use grounded feature intelligence, mapping, and approved doctrine to define what should be built in Repo 2 before any execution starts.</p>
              {latestProposal ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge label={latestProposal.status} tone={getProposalStatusTone(latestProposal.status)} />
                  <StatusBadge label={`Proposal v${latestProposal.version}`} tone="info" />
                  <StatusBadge label={`Doctrine ${proposalReadiness?.doctrineVersion ? `v${proposalReadiness.doctrineVersion.version}` : "missing"}`} tone={proposalReadiness?.doctrineVersion ? "info" : "warning"} />
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge label={proposalReadiness?.ready ? "Ready to generate" : "Blocked"} tone={proposalReadiness?.ready ? "success" : "warning"} />
                  <StatusBadge label={proposalReadiness?.doctrineVersion ? `Doctrine v${proposalReadiness.doctrineVersion.version}` : "Doctrine missing"} tone={proposalReadiness?.doctrineVersion ? "info" : "warning"} />
                </div>
              )}
            </div>
            <form action={`/api/projects/${project.id}/features/${feature.id}/proposal/generate`} method="post">
              <button type="submit" className="control-button-primary w-full sm:w-auto" disabled={!proposalReadiness?.ready}>
                {latestProposal ? "Regenerate proposal" : "Generate proposal"}
              </button>
            </form>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {proposalReadiness?.checks.map((check) => {
              const action = !check.satisfied
                ? getProposalCheckAction({
                    checkLabel: check.label,
                    projectId: project.id,
                    featureId: feature.id,
                    repositoryRole: selectedRepositoryRole,
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
              );
            })}
          </div>

          {latestProposal ? (
            <div className="mt-4 space-y-4">
              <form action={`/api/projects/${project.id}/features/${feature.id}/proposal/update`} method="post" className="space-y-4">
                <input type="hidden" name="proposalId" value={latestProposal.id} />
                <details className="surface-item p-4 sm:p-5" open>
                  <summary className="cursor-pointer list-none font-medium text-[var(--ink-950)]">Current proposal sections</summary>
                  <div className="mt-4 space-y-4">
                    <FieldShell label="Proposal summary" htmlFor="proposalSummary">
                      <textarea id="proposalSummary" name="proposalSummary" rows={5} defaultValue={editableProposal?.proposalSummary} className="field-textarea" />
                    </FieldShell>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <FieldShell label="Source behavior" htmlFor="sourceBehaviorSummary">
                        <textarea id="sourceBehaviorSummary" name="sourceBehaviorSummary" rows={8} defaultValue={editableProposal?.sourceBehaviorSummary} className="field-textarea" />
                      </FieldShell>
                      <FieldShell label="Target context" htmlFor="targetContextSummary">
                        <textarea id="targetContextSummary" name="targetContextSummary" rows={8} defaultValue={editableProposal?.targetContextSummary} className="field-textarea" />
                      </FieldShell>
                      <FieldShell label="Gap assessment" htmlFor="gapAssessment">
                        <textarea id="gapAssessment" name="gapAssessment" rows={8} defaultValue={editableProposal?.gapAssessment} className="field-textarea" />
                      </FieldShell>
                      <FieldShell label="Governing V2 patterns" htmlFor="governingV2Patterns">
                        <textarea id="governingV2Patterns" name="governingV2Patterns" rows={8} defaultValue={editableProposal?.governingV2Patterns} className="field-textarea" />
                      </FieldShell>
                    </div>
                    <div className="flex justify-end">
                      <button type="submit" className="control-button-secondary w-full sm:w-auto">Save proposal edits</button>
                    </div>
                  </div>
                </details>
              </form>

              <form action={`/api/projects/${project.id}/features/${feature.id}/proposal/revise`} method="post" className="surface-item p-4 sm:p-5 space-y-4">
                <FieldShell
                  label="Refine in plain English"
                  htmlFor="proposalRefinementNote"
                  hint="Describe the changes you want in normal language, then reprocess the proposal with those instructions."
                >
                  <textarea
                    id="proposalRefinementNote"
                    name="revisionNote"
                    rows={6}
                    className="field-textarea"
                    placeholder="Example: tighten the scope to the teacher workflow, remove exploratory options, and make the proposal prefer the existing V2 standards patterns."
                  />
                </FieldShell>
                <div className="flex justify-end">
                  <button type="submit" className="control-button-primary w-full sm:w-auto">Reprocess proposal</button>
                </div>
              </form>
            </div>
          ) : proposalReadiness?.ready ? <div className="callout-info mt-4">Proposal generation is ready. Generate the first draft to establish the approval boundary for this feature.</div> : <div className="callout-info mt-4">Proposal generation is blocked until the studies, mapping, and approved doctrine are all in place.</div>}
        </SectionCard>
      ) : null}

      {activeStep === 5 ? (
        <div className="space-y-4">
          {showProposalReviewWorkspace ? (
            <>
              <form action={`/api/projects/${project.id}/features/${feature.id}/proposal/update`} method="post" className="space-y-4">
                <input type="hidden" name="proposalId" value={latestProposal.id} />
                <SectionCard eyebrow="Step 5" title="Review notes and co-design">
                  <div className="space-y-4">
                    <div className="surface-item-compact p-4 text-sm leading-7 text-[var(--ink-700)]">
                      <p className="font-medium text-[var(--ink-950)]">Answer the questions that matter for the next draft</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">
                        This page should settle the open product questions that materially change the proposal. Answer only the items you want the next revision to obey, then request a revision.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <StatusBadge label={`${answeredReviewQuestionCount} answered`} tone={answeredReviewQuestionCount > 0 ? "success" : "neutral"} />
                        <StatusBadge label={`${Math.max(reviewQuestions.length - answeredReviewQuestionCount, 0)} pending`} tone={reviewQuestions.length - answeredReviewQuestionCount > 0 ? "warning" : "neutral"} />
                      </div>
                    </div>

                    {reviewQuestions.length > 0 ? (
                      <div className="space-y-4">
                        {reviewQuestions.map((question, index) => {
                          const fieldName = buildOperatorResponseFieldName(question, index);
                          const fieldId = `operatorResponse-${index}`;

                          return (
                            <article key={fieldName} className="surface-item p-4 sm:p-5 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm font-medium text-[var(--ink-950)]">Question {index + 1}</p>
                                <StatusBadge
                                  label={parsedOperatorResponses.responseMap.get(question)?.trim() ? "Answered" : "Pending"}
                                  tone={parsedOperatorResponses.responseMap.get(question)?.trim() ? "success" : "warning"}
                                />
                              </div>
                              <p className="text-sm leading-6 text-[var(--ink-700)]">{question}</p>
                              <input type="hidden" name={`${fieldName}__question`} value={question} />
                              <textarea
                                id={fieldId}
                                name={fieldName}
                                rows={4}
                                defaultValue={parsedOperatorResponses.responseMap.get(question) ?? ""}
                                className="field-textarea"
                                placeholder="Write your answer in plain English. Leave this blank if you are not answering it yet."
                              />
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="callout-info">No explicit AI questions are recorded in this draft yet.</div>
                    )}

                    <details className="surface-item p-4 sm:p-5">
                      <summary className="cursor-pointer list-none font-medium text-[var(--ink-950)]">Additional guidance for the next revision</summary>
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <FieldShell label="Product direction decisions" htmlFor="productDirectionDecisions" hint="Use this for firm decisions the next revision should obey.">
                          <textarea id="productDirectionDecisions" name="productDirectionDecisions" rows={5} defaultValue={latestProposal.productDirectionDecisions} className="field-textarea" placeholder="Example: first release should optimize for curriculum partners reviewing standards alignment, and the UX should feel guided rather than exploratory." />
                        </FieldShell>
                        <FieldShell label="Constraints / non-negotiables" htmlFor="constraintsNonNegotiables" hint="State hard boundaries, dependencies, or implementation limits.">
                          <textarea id="constraintsNonNegotiables" name="constraintsNonNegotiables" rows={5} defaultValue={latestProposal.constraintsNonNegotiables} className="field-textarea" placeholder="Example: must stay inside the existing feature workspace, must use current standards data structures, and cannot add a separate full-screen workflow." />
                        </FieldShell>
                        <FieldShell label="Proposal commentary" htmlFor="operatorComments" hint="Call out what is wrong, vague, missing, or strong in the current draft.">
                          <textarea id="operatorComments" name="operatorComments" rows={5} defaultValue={latestProposal.operatorComments} className="field-textarea" placeholder="Example: the draft keeps this V2-native, but it still under-specifies the standards-partner review flow." />
                        </FieldShell>
                        <FieldShell label="Operator notes" htmlFor="operatorNotes" hint="Optional rough notes that do not fit the structured fields above.">
                          <textarea id="operatorNotes" name="operatorNotes" rows={5} defaultValue={latestProposal.operatorNotes} className="field-textarea" placeholder="Capture any extra observations or concerns here." />
                        </FieldShell>
                        {parsedOperatorResponses.unmatchedText ? (
                          <div className="xl:col-span-2">
                            <FieldShell label="Additional saved response context" htmlFor="operatorResponsesGeneral" hint="Older saved response text that was not stored question-by-question.">
                              <textarea
                                id="operatorResponsesGeneral"
                                name="operatorResponsesGeneral"
                                rows={5}
                                defaultValue={parsedOperatorResponses.unmatchedText}
                                className="field-textarea"
                                placeholder="Any extra response context that does not fit one specific question."
                              />
                            </FieldShell>
                          </div>
                        ) : null}
                      </div>
                    </details>

                    <div className="flex justify-end">
                      <button type="submit" className="control-button-secondary w-full sm:w-auto">Save co-design notes</button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
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
                      <p className="font-medium text-[var(--ink-950)]">Current review goal</p>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">
                        Settle the questions that materially change the proposal, save those answers, then use Request revision to regenerate the draft with your decisions applied.
                      </p>
                      <ul className="mt-3 space-y-2">
                        <li>Answer only the questions you want to lock down now.</li>
                        <li>Use the optional guidance area only when the questions are not enough.</li>
                        <li>Request revision after saving so the next draft uses these answers.</li>
                      </ul>
                    </div>
                  </div>
                </SectionCard>
              </form>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <form action={`/api/projects/${project.id}/features/${feature.id}/proposal/revise`} method="post" className="surface-item p-4 sm:p-5 space-y-3">
                  <FieldShell label="Request revision" htmlFor="revisionNote" hint="Explain what should change in the next proposal draft. Saved review notes and responses will also be used.">
                    <textarea id="revisionNote" name="revisionNote" rows={5} className="field-textarea" />
                  </FieldShell>
                  <div className="flex justify-end">
                    <button type="submit" className="control-button-primary w-full sm:w-auto">Request revision</button>
                  </div>
                </form>

                <form action={`/api/projects/${project.id}/features/${feature.id}/proposal/approve`} method="post" className="surface-item p-4 sm:p-5 space-y-3">
                  <input type="hidden" name="proposalId" value={latestProposal.id} />
                  <p className="font-medium text-[var(--ink-950)]">Approve proposal</p>
                  <p className="text-sm leading-6 text-[var(--ink-700)]">Approving this marks the proposal as the accepted implementation direction for later execution. It does not start coding.</p>
                  <div className="flex justify-end">
                    <button type="submit" className="control-button-secondary w-full sm:w-auto" disabled={latestProposal.status === "Approved"}>Approve proposal</button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <SectionCard eyebrow="Step 5" title="Review notes and co-design">
              <div className="callout-info">Generate a proposal first so review notes and execution can be controlled against an explicit boundary.</div>
            </SectionCard>
          )}

          {showApprovedExecutionSummary ? (
            <SectionCard
              eyebrow="Step 5"
              title={latestExecutionRun?.status === "Aborted" ? "Execution restart" : latestExecutionRun ? "Execution workspace" : "Execution prep"}
            >
              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
                <div className="surface-item p-4 sm:p-5">
                  <p className="font-medium text-[var(--ink-950)]">Approved direction</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">
                    {editableProposal?.proposalSummary ?? "This feature has an approved proposal boundary and is ready for execution control."}
                  </p>
                </div>

                <div className="surface-item p-4 sm:p-5">
                  <p className="font-medium text-[var(--ink-950)]">Current state</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge label={latestExecutionRun?.status ?? "NotStarted"} tone={latestExecutionRun ? getExecutionStatusTone(latestExecutionRun.status) : "neutral"} />
                    <StatusBadge label={latestExecutionRun ? latestExecutionRun.operatorReviewStatus : "Pending"} tone={latestExecutionRun?.operatorReviewStatus === "Approved" ? "success" : latestExecutionRun?.operatorReviewStatus === "Rejected" ? "danger" : "info"} />
                    <StatusBadge label={`Investigation ${latestExecutionRun?.investigationStatus ?? "NotStarted"}`} tone={latestExecutionRun ? getInvestigationStatusTone(latestExecutionRun.investigationStatus) : "neutral"} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">
                    Branch: {latestExecutionRun?.branchName ?? `feature/${feature.slug}-v${latestProposal.version}`}
                  </p>
                </div>

                <div className="surface-item p-4 sm:p-5">
                  <p className="font-medium text-[var(--ink-950)]">What this page is for</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">
                    {canStartExecution
                      ? "Start a fresh execution run from the approved proposal."
                      : executionNeedsOperatorInput
                        ? "Review the investigated decision packets below and answer only the operator decisions that remain open."
                        : latestExecutionRun?.status === "AwaitingReview"
                          ? "Review the execution output and decide whether to approve it."
                          : latestExecutionRun?.status === "Aborted"
                            ? "Review the last run, resolve anything still unanswered, then restart when ready."
                            : "Use this workspace to inspect progress, investigation evidence, and review output."}
                  </p>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {latestProposal?.status === "Approved" && executionWorkspaceActive ? (
            <SectionCard eyebrow="Step 5" title="Operator handoff">
              <div className="space-y-4">
                <div className="surface-item-compact p-4 text-sm leading-7 text-[var(--ink-700)]">
                  <p className="font-medium text-[var(--ink-950)]">Execution has moved past proposal review</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">
                    The proposal is already approved. This page is now for unblocking the active build run, not for revising the draft again.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge label={latestExecutionRun?.status ?? "NotStarted"} tone={latestExecutionRun ? getExecutionStatusTone(latestExecutionRun.status) : "neutral"} />
                    <StatusBadge label={`${openExecutionMessages.length} operator decision${openExecutionMessages.length === 1 ? "" : "s"}`} tone={openExecutionMessages.length > 0 ? "warning" : "neutral"} />
                    <StatusBadge label={`Investigation ${latestExecutionRun?.investigationStatus ?? "NotStarted"}`} tone={latestExecutionRun ? getInvestigationStatusTone(latestExecutionRun.investigationStatus) : "neutral"} />
                    <StatusBadge label={`Branch ${latestExecutionRun?.branchName ?? `feature/${feature.slug}-v${latestProposal.version}`}`} tone="info" />
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="surface-item p-4 sm:p-5">
                    <p className="font-medium text-[var(--ink-950)]">What to do now</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink-700)]">
                      <li>Answer only the operator decisions that remain open below.</li>
                      <li>Use the investigation notes to confirm or override the recommended default.</li>
                      <li>Submit once, then let the build continue from the current branch and plan.</li>
                    </ul>
                  </div>

                  <div className="surface-item p-4 sm:p-5">
                    <p className="font-medium text-[var(--ink-950)]">Why execution paused</p>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">
                      The agent investigated the missing context first and only escalated the decisions that still affect product direction, access, or high-impact implementation risk.
                    </p>
                    {executionNeedsOperatorInput ? (
                      <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">
                        This run is specifically blocked on {openExecutionMessages.length} operator decision{openExecutionMessages.length === 1 ? "" : "s"}.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {latestProposal?.status === "Approved" ? (
            <SectionCard eyebrow="Execution" title="Controlled build run">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-3xl">
                  <p>Execution follows the approved proposal only. It should implement in small, traceable batches, pause when unclear, and stop at human review.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge label={latestExecutionRun?.status ?? "NotStarted"} tone={latestExecutionRun ? getExecutionStatusTone(latestExecutionRun.status) : "neutral"} />
                    <StatusBadge label={latestExecutionRun ? latestExecutionRun.operatorReviewStatus : "Pending"} tone={latestExecutionRun?.operatorReviewStatus === "Approved" ? "success" : latestExecutionRun?.operatorReviewStatus === "Rejected" ? "danger" : "info"} />
                    <StatusBadge label={`Branch ${latestExecutionRun?.branchName ?? `feature/${feature.slug}-v${latestProposal.version}`}`} tone="info" />
                  </div>
                </div>

                {canStartExecution ? (
                  <form action={`/api/projects/${project.id}/features/${feature.id}/execution/start`} method="post">
                    <input type="hidden" name="proposalId" value={latestProposal.id} />
                    <button type="submit" className="control-button-primary w-full sm:w-auto">Start execution</button>
                  </form>
                ) : null}
              </div>

              {latestExecutionRun ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="surface-item p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-medium text-[var(--ink-950)]">Progress log</p>
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">Chronological</p>
                      </div>
                      <div className="mt-4 space-y-3">
                        {latestExecutionRun.progressLog.length > 0 ? latestExecutionRun.progressLog.map((entry) => (
                          <article key={`${entry.step}-${entry.createdAt}`} className="surface-item p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="font-medium text-[var(--ink-950)]">Step {entry.step}: {entry.intent}</p>
                              <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">{formatTimestamp(entry.createdAt)}</p>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{entry.summary}</p>
                          </article>
                        )) : <p className="text-sm leading-6 text-[var(--ink-700)]">No execution progress has been recorded yet.</p>}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="surface-item p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-medium text-[var(--ink-950)]">Investigation activity</p>
                          <StatusBadge label={latestExecutionRun.investigationStatus} tone={getInvestigationStatusTone(latestExecutionRun.investigationStatus)} />
                        </div>
                        {latestExecutionRun.investigationActions.length > 0 ? (
                          <div className="mt-4 space-y-3">
                            {latestExecutionRun.investigationActions.map((action) => (
                              <article key={action.id} className="surface-item-compact p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="font-medium text-[var(--ink-950)]">{action.title}</p>
                                  <StatusBadge label={action.status} tone={action.status === "Completed" ? "success" : action.status === "Blocked" ? "warning" : "neutral"} />
                                </div>
                                <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{action.detail}</p>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">No investigation actions have been recorded yet.</p>
                        )}
                      </div>

                      <div className="surface-item p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-medium text-[var(--ink-950)]">{executionQuestionsTitle}</p>
                          <StatusBadge label={executionQuestionsBadgeLabel} tone={openExecutionMessages.length > 0 ? "warning" : "neutral"} />
                        </div>
                        {openExecutionMessages.length > 0 ? (
                          <form action={`/api/projects/${project.id}/features/${feature.id}/execution/respond`} method="post" className="mt-4 space-y-4">
                            <input type="hidden" name="executionRunId" value={latestExecutionRun.id} />
                            <p className="text-sm leading-6 text-[var(--ink-700)]">
                              {executionQuestionsIntro}
                            </p>
                            {openExecutionMessages.map((message, index) => (
                              <article key={message.id} className="surface-item-compact p-4 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-sm font-medium text-[var(--ink-950)]">Decision {index + 1}</p>
                                  <div className="flex flex-wrap gap-2">
                                    <StatusBadge label={formatExecutionAgentRole(message.agentRole)} tone="info" />
                                    <StatusBadge label={formatDecisionCategory(message.category)} tone={message.category === "ProductDecision" || message.category === "HighImpactAmbiguity" ? "warning" : message.category === "AccessIssue" ? "danger" : "info"} />
                                    <StatusBadge label={`${message.confidence ?? "Unknown"} confidence`} tone={getDecisionConfidenceTone(message.confidence)} />
                                  </div>
                                </div>
                                <p className="text-sm leading-6 text-[var(--ink-700)]">{message.message}</p>
                                {message.investigationSummary && message.investigationSummary.length > 0 ? <StudyListCard title="What I investigated" items={message.investigationSummary} /> : null}
                                {message.findings && message.findings.length > 0 ? <StudyListCard title="What I found" items={message.findings} /> : null}
                                {message.options && message.options.length > 0 ? <StudyListCard title="Options" items={message.options} /> : null}
                                {message.recommendedDefault ? (
                                  <div className="surface-item p-4">
                                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">Recommended default</p>
                                    <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{message.recommendedDefault}</p>
                                  </div>
                                ) : null}
                                {message.decisionRequired ? (
                                  <div className="surface-item p-4">
                                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">Decision required</p>
                                    <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{message.decisionRequired}</p>
                                  </div>
                                ) : null}
                                <textarea
                                  name={`response-${message.id}`}
                                  rows={4}
                                  className="field-textarea"
                                  placeholder="Confirm the recommended default or override it with the decision execution should follow."
                                />
                              </article>
                            ))}
                            <div className="flex justify-end">
                              <button type="submit" className="control-button-primary w-full sm:w-auto">Save answers and continue</button>
                            </div>
                          </form>
                        ) : executionDecisionMessages.length > 0 ? (
                          <div className="mt-4 space-y-3">
                            {executionDecisionMessages.map((message) => (
                              <article key={message.id} className="surface-item-compact p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <StatusBadge label={message.status} tone={message.status === "Answered" ? "success" : "warning"} />
                                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">{formatTimestamp(message.createdAt)}</p>
                                </div>
                                <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">{formatExecutionAgentRole(message.agentRole)}</p>
                                <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{message.message}</p>
                                {message.investigationSummary && message.investigationSummary.length > 0 ? <StudyListCard title="What I investigated" items={message.investigationSummary} /> : null}
                                {message.findings && message.findings.length > 0 ? <StudyListCard title="What I found" items={message.findings} /> : null}
                                {message.options && message.options.length > 0 ? <StudyListCard title="Options" items={message.options} /> : null}
                                {message.recommendedDefault ? <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]"><strong>Recommended default:</strong> {message.recommendedDefault}</p> : null}
                                {message.decisionRequired ? <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]"><strong>Decision required:</strong> {message.decisionRequired}</p> : null}
                                {message.response ? <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]"><strong>Answer:</strong> {message.response}</p> : null}
                              </article>
                            ))}
                          </div>
                        ) : <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">No operator decisions are currently blocking execution.</p>}
                      </div>

                      {hasExecutionControls ? (
                        <div className="surface-item p-4 sm:p-5">
                          <p className="font-medium text-[var(--ink-950)]">Controls</p>
                          <div className="mt-4 flex flex-col gap-2">
                            <form action={`/api/projects/${project.id}/features/${feature.id}/execution/abort`} method="post">
                              <input type="hidden" name="executionRunId" value={latestExecutionRun.id} />
                              <button type="submit" className="control-button-secondary w-full">Abort execution</button>
                            </form>

                            {latestExecutionRun.status === "AwaitingReview" ? (
                              <>
                                <form action={`/api/projects/${project.id}/features/${feature.id}/execution/review`} method="post">
                                  <input type="hidden" name="executionRunId" value={latestExecutionRun.id} />
                                  <input type="hidden" name="decision" value="Approved" />
                                  <button type="submit" className="control-button-primary w-full">Approve execution</button>
                                </form>
                                <form action={`/api/projects/${project.id}/features/${feature.id}/execution/review`} method="post">
                                  <input type="hidden" name="executionRunId" value={latestExecutionRun.id} />
                                  <input type="hidden" name="decision" value="Rejected" />
                                  <button type="submit" className="control-button-secondary w-full">Reject execution</button>
                                </form>
                              </>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="surface-item p-4 sm:p-5">
                      <p className="font-medium text-[var(--ink-950)]">Changed files</p>
                      {latestExecutionRun.changedFilesSummary.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {latestExecutionRun.changedFilesSummary.map((entry, index) => (
                            <article key={`${entry.path}-${index}`} className="surface-item-compact p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="font-medium text-[var(--ink-950)]">{entry.path}</p>
                                <StatusBadge label={entry.changeType} tone={entry.changeType === "delete" ? "warning" : entry.changeType === "create" ? "success" : "info"} />
                              </div>
                              <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{entry.summary}</p>
                            </article>
                          ))}
                        </div>
                      ) : <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">No file changes have been recorded yet.</p>}
                    </div>

                    <div className="surface-item p-4 sm:p-5">
                      <p className="font-medium text-[var(--ink-950)]">Commits</p>
                      {latestExecutionRun.commitsSummary.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {latestExecutionRun.commitsSummary.map((commit) => (
                            <article key={`${commit.sha}-${commit.createdAt}`} className="surface-item-compact p-4">
                              <p className="font-medium text-[var(--ink-950)]">{commit.message}</p>
                              <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{commit.sha}</p>
                              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">{formatTimestamp(commit.createdAt)}</p>
                            </article>
                          ))}
                        </div>
                      ) : <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">No commits have been recorded yet.</p>}
                    </div>
                  </div>

                  <div className="surface-item p-4 sm:p-5">
                    <p className="font-medium text-[var(--ink-950)]">Agent reviews</p>
                    {latestExecutionRun.agentReviews.length > 0 ? (
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        {latestExecutionRun.agentReviews.map((review) => (
                          <article key={review.agentRole} className="surface-item-compact p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="font-medium text-[var(--ink-950)]">{formatExecutionAgentRole(review.agentRole)}</p>
                              <StatusBadge label={review.status} tone={getExecutionAgentReviewTone(review.status)} />
                            </div>
                            <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">{review.summary}</p>
                            {review.findings.length > 0 ? <StudyListCard title="Findings" items={review.findings} /> : null}
                            {review.risks.length > 0 ? <StudyListCard title="Risks" items={review.risks} /> : null}
                          </article>
                        ))}
                      </div>
                    ) : <p className="mt-3 text-sm leading-6 text-[var(--ink-700)]">No agent reviews have been recorded yet.</p>}
                  </div>
                </div>
              ) : <div className="callout-info mt-4">This approved proposal is ready to enter controlled execution.</div>}
            </SectionCard>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}