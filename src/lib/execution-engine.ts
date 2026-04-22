import { z } from "zod";

import type {
  ExecutionAgentReview,
  ExecutionAgentMessage,
  ExecutionAgentRole,
  ExecutionFileChangeSummary,
  ExecutionFinalReport,
  ExecutionProgressLogEntry,
  ExecutionRun,
  FeatureMappingSummaryRecord,
  FeatureProposalRecord,
  FeatureStudyRunRecord,
} from "@/domain/intelligence";
import type { ProjectRecord, RepositoryRecord } from "@/domain/project-mapper";
import { createGitHubBranch, deleteGitHubFile, commitGitHubFileChange, getGitHubRepositoryFileSnapshot } from "@/lib/github";
import { generateGeminiJson } from "@/lib/gemini";
import { getLatestExecutionRun, readExecutionRun, upsertExecutionRun, updateExecutionRun } from "@/lib/execution-store";
import { getLatestFeatureMappingSummary, readFeatureInventoryRecord, readFeatureStudyRun } from "@/lib/feature-store";
import { readProjectRecord } from "@/lib/project-store";
import { readFeatureProposal } from "@/lib/proposal-store";

const executionPlanningSchema = z.object({
  planSummary: z.string().min(1),
  filesToModify: z.array(z.string().min(1)).max(8),
  filesToCreate: z.array(z.string().min(1)).max(6),
  dependencies: z.array(z.string().min(1)).max(8),
  risks: z.array(z.string().min(1)).max(8),
  missingInfo: z.array(z.string().min(1)).max(8),
  operatorQuestions: z.array(z.string().min(1)).max(6),
  executionSteps: z.array(z.object({
    intent: z.string().min(1),
    filesTouched: z.array(z.string().min(1)).max(6),
    summary: z.string().min(1),
    risks: z.array(z.string().min(1)).max(6),
  })).min(1).max(4),
});

const executionImplementationSchema = z.object({
  additionalQuestions: z.array(z.string().min(1)).max(4).default([]),
  batches: z.array(z.object({
    intent: z.string().min(1),
    summary: z.string().min(1),
    risks: z.array(z.string().min(1)).max(6),
    commitMessage: z.string().min(1),
    operations: z.array(z.object({
      path: z.string().min(1),
      changeType: z.enum(["create", "update", "delete"]),
      summary: z.string().min(1),
      content: z.string().optional(),
    })).min(1).max(6),
  })).min(1).max(4),
});

const executionFinalReportSchema = z.object({
  summary: z.string().min(1),
  proposalAlignment: z.array(z.string().min(1)).min(1).max(8),
  assumptionsMade: z.array(z.string().min(1)).max(8),
  risks: z.array(z.string().min(1)).max(8),
  manualTestRecommendations: z.array(z.string().min(1)).min(1).max(8),
});

const executionReviewerSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(z.string().min(1)).max(8),
  risks: z.array(z.string().min(1)).max(8),
  blockingQuestions: z.array(z.string().min(1)).max(6),
  approved: z.boolean(),
});

const REVIEWER_ROLES: readonly Exclude<ExecutionAgentRole, "Coder" | "ProposalCompliance">[] = [
  "DesignPhilosophy",
  "UiUx",
  "QaRisk",
];

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueItems(items: string[], limit: number) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const normalized = normalizeText(item);

    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function slugify(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function formatPromptData(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getTargetRepository(project: ProjectRecord) {
  const repository = project.repositories.find((entry) => entry.role === "Target");

  if (!repository) {
    throw new Error("Repo 2 must be configured before execution can begin.");
  }

  return repository;
}

function buildBranchName(featureSlug: string, proposalVersion: number) {
  return `feature/${slugify(featureSlug)}-v${proposalVersion}`;
}

function getAnsweredOperatorContext(run: ExecutionRun) {
  return run.agentMessages
    .filter((message) => message.status === "Answered" && message.response)
    .map((message) => `${message.message}\nAnswer: ${message.response}`);
}

function formatAgentRole(role: ExecutionAgentRole) {
  switch (role) {
    case "ProposalCompliance":
      return "Proposal compliance";
    case "Coder":
      return "Coder";
    case "DesignPhilosophy":
      return "Design philosophy";
    case "UiUx":
      return "UI/UX";
    case "QaRisk":
      return "QA / risk";
  }
}

function buildAgentMessages(agentRole: ExecutionAgentRole, questions: string[], existing: ExecutionAgentMessage[]) {
  const nextMessages = [...existing];

  for (const question of uniqueItems(questions, 6)) {
    const alreadyPresent = nextMessages.some((message) => message.agentRole === agentRole && normalizeText(message.message).toLowerCase() === normalizeText(question).toLowerCase());

    if (alreadyPresent) {
      continue;
    }

    nextMessages.push({
      id: `execution-message-${Date.now()}-${nextMessages.length + 1}`,
      createdAt: new Date().toISOString(),
      agentRole,
      kind: "Question",
      status: "Open",
      message: question,
    });
  }

  return nextMessages;
}

function nextProgressEntry(run: ExecutionRun, input: Omit<ExecutionProgressLogEntry, "step" | "createdAt">): ExecutionProgressLogEntry {
  return {
    step: run.progressLog.length + 1,
    createdAt: new Date().toISOString(),
    ...input,
  };
}

function upsertAgentReview(reviews: ExecutionAgentReview[], review: ExecutionAgentReview) {
  const existingIndex = reviews.findIndex((entry) => entry.agentRole === review.agentRole);

  if (existingIndex < 0) {
    return [...reviews, review];
  }

  const next = [...reviews];
  next[existingIndex] = review;
  return next;
}

function buildAgentReview(input: {
  agentRole: ExecutionAgentRole;
  status: ExecutionAgentReview["status"];
  summary: string;
  findings: string[];
  risks: string[];
  blockingQuestions: string[];
}): ExecutionAgentReview {
  return {
    agentRole: input.agentRole,
    status: input.status,
    summary: input.summary,
    findings: uniqueItems(input.findings, 8),
    risks: uniqueItems(input.risks, 8),
    blockingQuestions: uniqueItems(input.blockingQuestions, 6),
    updatedAt: new Date().toISOString(),
  };
}

async function loadExecutionContext(executionRunId: string) {
  const run = await readExecutionRun(executionRunId);

  if (!run) {
    throw new Error("Execution run not found.");
  }

  const [project, feature, proposal] = await Promise.all([
    readProjectRecord(run.projectId),
    readFeatureInventoryRecord(run.projectId, run.featureId),
    readFeatureProposal(run.proposalId),
  ]);

  if (!project) {
    throw new Error("Project not found.");
  }

  if (!feature) {
    throw new Error("Feature not found.");
  }

  if (!proposal) {
    throw new Error("Approved proposal not found.");
  }

  const [sourceStudy, targetStudy, mappingSummary] = await Promise.all([
    readFeatureStudyRun(proposal.sourceStudyRunId),
    readFeatureStudyRun(proposal.targetStudyRunId),
    getLatestFeatureMappingSummary(run.projectId, run.featureId),
  ]);

  if (!sourceStudy?.understanding || !targetStudy?.understanding || !mappingSummary) {
    throw new Error("Execution requires source study, target study, and mapping summary context.");
  }

  return {
    run,
    project,
    feature,
    proposal,
    sourceStudy,
    targetStudy,
    mappingSummary,
    targetRepository: getTargetRepository(project),
  };
}

async function generateExecutionPlan(input: {
  project: ProjectRecord;
  featureName: string;
  proposal: FeatureProposalRecord;
  sourceStudy: FeatureStudyRunRecord;
  targetStudy: FeatureStudyRunRecord;
  mappingSummary: FeatureMappingSummaryRecord;
  operatorContext: string[];
}) {
  const prompt = [
    "You are planning a controlled execution run for ProjectMapper.",
    "Execution is downstream of intelligence and must strictly follow the approved proposal.",
    "Do not invent product decisions, expand scope, or refactor unrelated systems.",
    "This is a planning pass only. No code should be imagined beyond the files needed by the approved proposal.",
    "If anything is unclear, ask operator questions instead of guessing.",
    "Return valid JSON only.",
    `Project: ${input.project.name}`,
    `Mission: ${input.project.mission}`,
    `Feature: ${input.featureName}`,
    "Approved proposal:",
    formatPromptData({
      summary: input.proposal.content.proposalSummary,
      governingV2Patterns: input.proposal.content.governingV2Patterns,
      recommendedBuildShape: input.proposal.content.recommendedBuildShape,
      explicitNonGoals: input.proposal.content.explicitNonGoals,
      risksAndUnknowns: input.proposal.content.risksAndUnknowns,
      questionsForOperator: input.proposal.content.questionsForOperator,
      suggestedImplementationScope: input.proposal.content.suggestedImplementationScope,
      operatorNotes: input.proposal.operatorNotes,
      productDirectionDecisions: input.proposal.productDirectionDecisions,
      constraintsNonNegotiables: input.proposal.constraintsNonNegotiables,
      operatorResponses: input.proposal.operatorResponses,
    }),
    "Repo 1 feature study:",
    formatPromptData(input.sourceStudy.understanding),
    "Repo 2 feature study:",
    formatPromptData(input.targetStudy.understanding),
    "Feature mapping summary:",
    formatPromptData(input.mappingSummary),
    input.operatorContext.length > 0 ? "Prior operator answers:" : "No prior operator answers are available.",
    input.operatorContext.length > 0 ? input.operatorContext.join("\n\n") : "",
    "Planning requirements:",
    "- restate the implementation plan in plain language",
    "- identify only the files that actually need modification or creation",
    "- call out dependencies and risks",
    "- if any architecture or product decision remains unclear, add it to operatorQuestions",
    "- keep the step list disciplined and small",
  ].filter(Boolean).join("\n\n");

  return generateGeminiJson({
    prompt,
    schema: executionPlanningSchema,
  });
}

async function generateExecutionBatches(input: {
  project: ProjectRecord;
  featureName: string;
  proposal: FeatureProposalRecord;
  plan: z.infer<typeof executionPlanningSchema>;
  targetRepository: RepositoryRecord;
  branchName: string;
}) {
  const candidateFiles = uniqueItems([
    ...input.plan.filesToModify,
    ...input.plan.filesToCreate,
    ...input.plan.executionSteps.flatMap((step) => step.filesTouched),
  ], 8);

  const fileSnapshots = await Promise.all(candidateFiles.map(async (path) => {
    const snapshot = await getGitHubRepositoryFileSnapshot(input.targetRepository.url, path, input.branchName);

    return {
      path,
      exists: Boolean(snapshot),
      content: snapshot?.text ?? null,
    };
  }));

  const prompt = [
    "You are implementing a controlled execution run for ProjectMapper.",
    "You must follow the approved proposal and planning pass only.",
    "Do not expand scope, invent new features, or refactor unrelated systems.",
    "Return valid JSON only.",
    `Feature: ${input.featureName}`,
    `Branch: ${input.branchName}`,
    "Approved proposal:",
    formatPromptData({
      summary: input.proposal.content.proposalSummary,
      governingV2Patterns: input.proposal.content.governingV2Patterns,
      recommendedBuildShape: input.proposal.content.recommendedBuildShape,
      explicitNonGoals: input.proposal.content.explicitNonGoals,
      suggestedImplementationScope: input.proposal.content.suggestedImplementationScope,
      operatorNotes: input.proposal.operatorNotes,
      productDirectionDecisions: input.proposal.productDirectionDecisions,
      constraintsNonNegotiables: input.proposal.constraintsNonNegotiables,
      operatorResponses: input.proposal.operatorResponses,
    }),
    "Execution plan:",
    formatPromptData(input.plan),
    "Current target repository file state:",
    formatPromptData(fileSnapshots),
    "Implementation requirements:",
    "- produce 1 to 4 small batches",
    "- each batch should be safe and traceable",
    "- only include file operations that are necessary for the approved proposal",
    "- for create/update operations include the full resulting file content",
    "- delete operations should be rare and only used if the proposal explicitly requires them",
    "- if you cannot proceed safely, use additionalQuestions instead of guessing",
  ].join("\n\n");

  return generateGeminiJson({
    prompt,
    schema: executionImplementationSchema,
  });
}

async function generateExecutionFinalReport(input: {
  proposal: FeatureProposalRecord;
  progressLog: ExecutionProgressLogEntry[];
  changedFiles: ExecutionFileChangeSummary[];
  risks: string[];
  agentReviews: ExecutionAgentReview[];
}) {
  const prompt = [
    "You are writing a final execution report for ProjectMapper.",
    "Keep it traceable and grounded in what was actually changed.",
    "Return valid JSON only.",
    "Approved proposal:",
    formatPromptData({
      summary: input.proposal.content.proposalSummary,
      suggestedImplementationScope: input.proposal.content.suggestedImplementationScope,
      explicitNonGoals: input.proposal.content.explicitNonGoals,
    }),
    "Execution progress log:",
    formatPromptData(input.progressLog),
    "Changed files summary:",
    formatPromptData(input.changedFiles),
    "Risks identified:",
    formatPromptData(input.risks),
    "Reviewer outputs:",
    formatPromptData(input.agentReviews),
  ].join("\n\n");

  return generateGeminiJson({
    prompt,
    schema: executionFinalReportSchema,
  });
}

async function getChangedFileSnapshots(run: ExecutionRun, targetRepository: RepositoryRecord) {
  const paths = uniqueItems(run.changedFilesSummary.map((entry) => entry.path), 16);

  return Promise.all(paths.map(async (path) => {
    const snapshot = await getGitHubRepositoryFileSnapshot(targetRepository.url, path, run.branchName);
    return {
      path,
      summary: run.changedFilesSummary.find((entry) => entry.path === path)?.summary ?? "",
      content: snapshot?.text ?? null,
    };
  }));
}

async function generateReviewerOutput(input: {
  agentRole: Exclude<ExecutionAgentRole, "Coder" | "ProposalCompliance">;
  project: ProjectRecord;
  featureName: string;
  proposal: FeatureProposalRecord;
  mappingSummary: FeatureMappingSummaryRecord;
  changedFiles: Awaited<ReturnType<typeof getChangedFileSnapshots>>;
  operatorContext: string[];
}) {
  const roleInstructions: Record<Exclude<ExecutionAgentRole, "Coder" | "ProposalCompliance">, string[]> = {
    DesignPhilosophy: [
      "You are the design philosophy reviewer.",
      "Check that implementation decisions obey the approved proposal and the governing V2 patterns.",
      "Flag doctrine drift, architecture drift, or product-level scope expansion.",
    ],
    UiUx: [
      "You are the UI/UX reviewer.",
      "Check interaction quality, information architecture, and whether the changed UI recreates page sprawl or awkward flows.",
      "If there is no meaningful UI surface in the changed files, approve with a short explanation.",
    ],
    QaRisk: [
      "You are the QA and risk reviewer.",
      "Check for regression risk, missing validation, fragile assumptions, and what should be tested manually.",
      "Ask blocking questions only if the implementation cannot be safely reviewed without operator clarification.",
    ],
  };

  const prompt = [
    ...roleInstructions[input.agentRole],
    "This is a controlled execution review for ProjectMapper.",
    "Do not invent new product direction. Review only against the approved proposal and the actual changed files.",
    "Return valid JSON only.",
    `Project: ${input.project.name}`,
    `Feature: ${input.featureName}`,
    "Approved proposal:",
    formatPromptData({
      summary: input.proposal.content.proposalSummary,
      governingV2Patterns: input.proposal.content.governingV2Patterns,
      recommendedBuildShape: input.proposal.content.recommendedBuildShape,
      explicitNonGoals: input.proposal.content.explicitNonGoals,
      suggestedImplementationScope: input.proposal.content.suggestedImplementationScope,
      operatorNotes: input.proposal.operatorNotes,
      productDirectionDecisions: input.proposal.productDirectionDecisions,
      constraintsNonNegotiables: input.proposal.constraintsNonNegotiables,
    }),
    "Feature mapping summary:",
    formatPromptData(input.mappingSummary),
    "Changed files:",
    formatPromptData(input.changedFiles),
    input.operatorContext.length > 0 ? "Relevant operator answers:" : "No additional operator answers were provided.",
    input.operatorContext.length > 0 ? input.operatorContext.join("\n\n") : "",
    "Review requirements:",
    "- approved should be true only if this slice is acceptable for human review",
    "- findings should be concrete observations, not generic advice",
    "- blockingQuestions should be used only when the operator must clarify something before review can conclude",
  ].filter(Boolean).join("\n\n");

  return generateGeminiJson({
    prompt,
    schema: executionReviewerSchema,
  });
}

function updateRunQuestions(run: ExecutionRun, agentRole: ExecutionAgentRole, questions: string[]) {
  const unresolved = uniqueItems(questions, 6);

  return {
    ...run,
    status: "Blocked" as const,
    agentMessages: buildAgentMessages(agentRole, unresolved, run.agentMessages),
    unresolvedQuestions: unresolved,
  };
}

export async function startExecutionRun(input: {
  projectId: string;
  featureId: string;
  proposalId: string;
  operator: string;
}) {
  const [project, feature, proposal, latestRun] = await Promise.all([
    readProjectRecord(input.projectId),
    readFeatureInventoryRecord(input.projectId, input.featureId),
    readFeatureProposal(input.proposalId),
    getLatestExecutionRun(input.projectId, input.featureId),
  ]);

  if (!project || !feature || !proposal) {
    throw new Error("Execution could not start because the project, feature, or proposal is missing.");
  }

  if (proposal.status !== "Approved") {
    throw new Error("Only an approved proposal can start execution.");
  }

  if (latestRun && ["Running", "Blocked", "AwaitingReview"].includes(latestRun.status)) {
    throw new Error("An execution run is already active for this feature.");
  }

  const targetRepository = getTargetRepository(project);
  const branchName = buildBranchName(feature.slug, proposal.version);

  await createGitHubBranch(targetRepository.url, branchName, "main");

  const run: ExecutionRun = {
    id: `execution-${input.projectId}-${input.featureId}-${Date.now()}`,
    projectId: input.projectId,
    featureId: input.featureId,
    proposalId: proposal.id,
    targetRepositoryId: targetRepository.id,
    branchName,
    baseBranch: "main",
    status: "NotStarted",
    startedAt: new Date().toISOString(),
    progressLog: [],
    agentMessages: [],
    agentReviews: [],
    changedFilesSummary: [],
    commitsSummary: [],
    testResults: [{ title: "Automated tests", status: "NotRun", detail: "Execution v1 does not run automated tests yet." }],
    risksIdentified: [],
    unresolvedQuestions: [],
    finalReport: null,
    operatorReviewStatus: "Pending",
  };

  await upsertExecutionRun(run);
  return continueExecutionRun({ executionRunId: run.id, operator: input.operator });
}

export async function continueExecutionRun(input: {
  executionRunId: string;
  operator: string;
}) {
  const context = await loadExecutionContext(input.executionRunId);
  let run = context.run;

  if (run.operatorReviewStatus !== "Pending") {
    throw new Error("This execution run has already been reviewed.");
  }

  const answeredContext = getAnsweredOperatorContext(run);
  const plan = await generateExecutionPlan({
    project: context.project,
    featureName: context.feature.canonicalName,
    proposal: context.proposal,
    sourceStudy: context.sourceStudy,
    targetStudy: context.targetStudy,
    mappingSummary: context.mappingSummary,
    operatorContext: answeredContext,
  });

  if (plan.operatorQuestions.length > 0 || plan.missingInfo.length > 0) {
    const blockedQuestions = [...plan.operatorQuestions, ...plan.missingInfo];
    const blockedRun = updateRunQuestions(run, "ProposalCompliance", blockedQuestions);
    const progressEntry = nextProgressEntry(blockedRun, {
      intent: "Proposal compliance planning",
      filesTouched: uniqueItems([...plan.filesToModify, ...plan.filesToCreate], 8),
      summary: plan.planSummary,
      risks: uniqueItems(plan.risks, 6),
    });

    run = {
      ...blockedRun,
      agentReviews: upsertAgentReview(blockedRun.agentReviews, buildAgentReview({
        agentRole: "ProposalCompliance",
        status: "NeedsOperatorInput",
        summary: plan.planSummary,
        findings: [],
        risks: plan.risks,
        blockingQuestions: blockedQuestions,
      })),
      progressLog: [...blockedRun.progressLog, progressEntry],
      risksIdentified: uniqueItems([...blockedRun.risksIdentified, ...plan.risks], 12),
    };
    await upsertExecutionRun(run);
    return run;
  }

  run = {
    ...run,
    status: "Running",
    unresolvedQuestions: [],
    agentReviews: upsertAgentReview(run.agentReviews, buildAgentReview({
      agentRole: "ProposalCompliance",
      status: "Approved",
      summary: plan.planSummary,
      findings: uniqueItems([
        ...plan.dependencies.map((item) => `Dependency: ${item}`),
        ...plan.executionSteps.map((step) => `${step.intent}: ${step.summary}`),
      ], 8),
      risks: plan.risks,
      blockingQuestions: [],
    })),
    progressLog: [...run.progressLog, nextProgressEntry(run, {
      intent: "Proposal compliance planning",
      filesTouched: uniqueItems([...plan.filesToModify, ...plan.filesToCreate], 8),
      summary: plan.planSummary,
      risks: uniqueItems(plan.risks, 6),
    })],
    risksIdentified: uniqueItems([...run.risksIdentified, ...plan.risks], 12),
  };
  await upsertExecutionRun(run);

  const implementation = await generateExecutionBatches({
    project: context.project,
    featureName: context.feature.canonicalName,
    proposal: context.proposal,
    plan,
    targetRepository: context.targetRepository,
    branchName: run.branchName,
  });

  if (implementation.additionalQuestions.length > 0) {
    run = {
      ...updateRunQuestions(run, "Coder", implementation.additionalQuestions),
      agentReviews: upsertAgentReview(run.agentReviews, buildAgentReview({
        agentRole: "Coder",
        status: "NeedsOperatorInput",
        summary: "The coder agent could not safely proceed without operator clarification.",
        findings: [],
        risks: [],
        blockingQuestions: implementation.additionalQuestions,
      })),
    };
    await upsertExecutionRun(run);
    return run;
  }

  for (const batch of implementation.batches) {
    const filesTouched: string[] = [];
    const batchCommits = [] as ExecutionRun["commitsSummary"];
    const changedFiles = [] as ExecutionFileChangeSummary[];

    for (const operation of batch.operations) {
      if (operation.changeType === "delete") {
        const commit = await deleteGitHubFile({
          url: context.targetRepository.url,
          branch: run.branchName,
          path: operation.path,
          message: batch.commitMessage,
        });

        if (!commit) {
          continue;
        }

        filesTouched.push(operation.path);
        changedFiles.push({ path: operation.path, changeType: "delete", summary: operation.summary });
        batchCommits.push({ sha: commit.sha, message: commit.message, createdAt: new Date().toISOString() });
        continue;
      }

      if (typeof operation.content !== "string") {
        throw new Error(`Execution batch for ${operation.path} is missing file content.`);
      }

      const commit = await commitGitHubFileChange({
        url: context.targetRepository.url,
        branch: run.branchName,
        path: operation.path,
        content: operation.content,
        message: batch.commitMessage,
      });

      if (!commit) {
        continue;
      }

      filesTouched.push(operation.path);
      changedFiles.push({ path: operation.path, changeType: operation.changeType, summary: operation.summary });
      batchCommits.push({ sha: commit.sha, message: commit.message, createdAt: new Date().toISOString() });
    }

    run = {
      ...run,
      agentReviews: upsertAgentReview(run.agentReviews, buildAgentReview({
        agentRole: "Coder",
        status: "Approved",
        summary: `Coder applied batch: ${batch.intent}`,
        findings: changedFiles.map((entry) => `${entry.path}: ${entry.summary}`),
        risks: batch.risks,
        blockingQuestions: [],
      })),
      progressLog: [...run.progressLog, nextProgressEntry(run, {
        intent: batch.intent,
        filesTouched: uniqueItems(filesTouched, 8),
        summary: batch.summary,
        risks: uniqueItems(batch.risks, 6),
      })],
      changedFilesSummary: [...run.changedFilesSummary, ...changedFiles],
      commitsSummary: [...run.commitsSummary, ...batchCommits],
      risksIdentified: uniqueItems([...run.risksIdentified, ...batch.risks], 16),
    };
    await upsertExecutionRun(run);
  }

  const changedFileSnapshots = await getChangedFileSnapshots(run, context.targetRepository);

  for (const agentRole of REVIEWER_ROLES) {
    const review = await generateReviewerOutput({
      agentRole,
      project: context.project,
      featureName: context.feature.canonicalName,
      proposal: context.proposal,
      mappingSummary: context.mappingSummary,
      changedFiles: changedFileSnapshots,
      operatorContext: answeredContext,
    });

    const reviewRecord = buildAgentReview({
      agentRole,
      status: review.approved && review.blockingQuestions.length === 0 ? "Approved" : review.blockingQuestions.length > 0 ? "NeedsOperatorInput" : "Pending",
      summary: review.summary,
      findings: review.findings,
      risks: review.risks,
      blockingQuestions: review.blockingQuestions,
    });

    run = {
      ...run,
      agentReviews: upsertAgentReview(run.agentReviews, reviewRecord),
      risksIdentified: uniqueItems([...run.risksIdentified, ...review.risks], 20),
      progressLog: [...run.progressLog, nextProgressEntry(run, {
        intent: `${formatAgentRole(agentRole)} review`,
        filesTouched: uniqueItems(changedFileSnapshots.map((entry) => entry.path), 12),
        summary: review.summary,
        risks: review.risks,
      })],
    };
    await upsertExecutionRun(run);

    if (review.blockingQuestions.length > 0) {
      run = updateRunQuestions(run, agentRole, review.blockingQuestions);
      await upsertExecutionRun(run);
      return run;
    }
  }

  const finalReportContent = await generateExecutionFinalReport({
    proposal: context.proposal,
    progressLog: run.progressLog,
    changedFiles: run.changedFilesSummary,
    risks: run.risksIdentified,
    agentReviews: run.agentReviews,
  });

  const finalReport: ExecutionFinalReport = {
    summary: finalReportContent.summary,
    proposalAlignment: finalReportContent.proposalAlignment,
    filesChanged: uniqueItems(run.changedFilesSummary.map((entry) => entry.path), 16),
    assumptionsMade: finalReportContent.assumptionsMade,
    risks: finalReportContent.risks,
    manualTestRecommendations: finalReportContent.manualTestRecommendations,
  };

  run = {
    ...run,
    status: "AwaitingReview",
    completedAt: new Date().toISOString(),
    finalReport,
  };
  await upsertExecutionRun(run);
  return run;
}

export async function answerExecutionQuestions(input: {
  executionRunId: string;
  responses: Array<{ messageId: string; response: string }>;
  operator: string;
}) {
  const updated = await updateExecutionRun(input.executionRunId, (run) => ({
    ...run,
    agentMessages: run.agentMessages.map((message) => {
      const response = input.responses.find((entry) => entry.messageId === message.id);

      if (!response || !normalizeText(response.response)) {
        return message;
      }

      return {
        ...message,
        status: "Answered",
        response: normalizeText(response.response),
        respondedAt: new Date().toISOString(),
      };
    }),
    status: "Running",
    unresolvedQuestions: [],
  }));

  if (!updated) {
    throw new Error("Execution run not found.");
  }

  return continueExecutionRun({ executionRunId: input.executionRunId, operator: input.operator });
}

export async function abortExecutionRun(executionRunId: string) {
  const updated = await updateExecutionRun(executionRunId, (run) => ({
    ...run,
    status: "Aborted",
    completedAt: new Date().toISOString(),
  }));

  if (!updated) {
    throw new Error("Execution run not found.");
  }

  return updated;
}

export async function reviewExecutionRun(input: {
  executionRunId: string;
  decision: "Approved" | "Rejected";
}) {
  const updated = await updateExecutionRun(input.executionRunId, (run) => ({
    ...run,
    status: "Completed",
    completedAt: run.completedAt ?? new Date().toISOString(),
    operatorReviewStatus: input.decision,
  }));

  if (!updated) {
    throw new Error("Execution run not found.");
  }

  return updated;
}