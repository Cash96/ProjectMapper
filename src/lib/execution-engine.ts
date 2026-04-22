import { Storage } from "@google-cloud/storage";
import { z } from "zod";

import type {
  ExecutionAgentReview,
  ExecutionAgentMessage,
  ExecutionAgentRole,
  ExecutionDecisionCategory,
  ExecutionDecisionConfidence,
  ExecutionDecisionRecord,
  ExecutionFileChangeSummary,
  ExecutionFinalReport,
  ExecutionInvestigationAction,
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

const looseExecutionPlanningSchema = z.object({
  planSummary: z.unknown().optional(),
  filesToModify: z.unknown().optional(),
  filesToCreate: z.unknown().optional(),
  dependencies: z.unknown().optional(),
  risks: z.unknown().optional(),
  missingInfo: z.unknown().optional(),
  operatorQuestions: z.unknown().optional(),
  executionSteps: z.unknown().optional(),
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

const executionDecisionCategorySchema = z.enum([
  "ImplementationDetail",
  "LowRiskAssumption",
  "ProductDecision",
  "AccessIssue",
  "HighImpactAmbiguity",
]);

const executionDecisionConfidenceSchema = z.enum(["High", "Medium", "Low"]);

const executionDecisionAnalysisSchema = z.object({
  summary: z.string().min(1),
  assumptionsToProceed: z.array(z.string().min(1)).max(8).default([]),
  unresolvedRisks: z.array(z.string().min(1)).max(8).default([]),
  decisions: z.array(z.object({
    issue: z.string().min(1),
    category: executionDecisionCategorySchema,
    confidence: executionDecisionConfidenceSchema,
    investigated: z.array(z.string().min(1)).min(1).max(6),
    findings: z.array(z.string().min(1)).min(1).max(8),
    options: z.array(z.string().min(1)).min(1).max(4),
    recommendedDefault: z.string().min(1),
    decisionRequired: z.string().min(1),
    resolvedAutonomously: z.boolean(),
  })).max(8).default([]),
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

function createInvestigationAction(input: Omit<ExecutionInvestigationAction, "id" | "createdAt">): ExecutionInvestigationAction {
  return {
    id: `execution-investigation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
}

function formatDecisionCategory(category: ExecutionDecisionCategory) {
  switch (category) {
    case "ImplementationDetail":
      return "Implementation detail";
    case "LowRiskAssumption":
      return "Low-risk assumption";
    case "ProductDecision":
      return "Product decision";
    case "AccessIssue":
      return "Access issue";
    case "HighImpactAmbiguity":
      return "High-impact ambiguity";
  }
}

function isEscalationCategory(category: ExecutionDecisionCategory) {
  return category === "ProductDecision" || category === "AccessIssue" || category === "HighImpactAmbiguity";
}

function toListItems(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n|[•●▪■]|\s+-\s+/)
      .map((entry) => normalizeText(entry.replace(/^(?:\d+\.|[-*])\s*/, "")))
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => toListItems(entry));
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => toListItems(entry));
  }

  return [];
}

function normalizeExecutionPlanning(raw: z.infer<typeof looseExecutionPlanningSchema>) {
  const rawSteps = Array.isArray(raw.executionSteps) ? raw.executionSteps : [];
  const normalizedSteps = rawSteps.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const intent = normalizeText(String(record.intent ?? record.title ?? record.step ?? ""));
    const summary = normalizeText(String(record.summary ?? record.description ?? record.intent ?? ""));

    if (!intent || !summary) {
      return [];
    }

    return [{
      intent,
      summary,
      filesTouched: uniqueItems(toListItems(record.filesTouched ?? record.files ?? record.paths), 6),
      risks: uniqueItems(toListItems(record.risks), 6),
    }];
  }).slice(0, 4);

  const fallbackSummary = normalizeText(String(raw.planSummary ?? "Implementation plan generated from the approved proposal."))
    || "Implementation plan generated from the approved proposal.";

  return executionPlanningSchema.parse({
    planSummary: fallbackSummary,
    filesToModify: uniqueItems(toListItems(raw.filesToModify), 8),
    filesToCreate: uniqueItems(toListItems(raw.filesToCreate), 6),
    dependencies: uniqueItems(toListItems(raw.dependencies), 8),
    risks: uniqueItems(toListItems(raw.risks), 8),
    missingInfo: uniqueItems(toListItems(raw.missingInfo), 8),
    operatorQuestions: uniqueItems(toListItems(raw.operatorQuestions), 6),
    executionSteps: normalizedSteps.length > 0
      ? normalizedSteps
      : [{
          intent: "Implement approved proposal",
          summary: fallbackSummary,
          filesTouched: uniqueItems([
            ...toListItems(raw.filesToModify),
            ...toListItems(raw.filesToCreate),
          ], 6),
          risks: uniqueItems(toListItems(raw.risks), 6),
        }],
  });
}

function getTargetRepository(project: ProjectRecord) {
  const repository = project.repositories.find((entry) => entry.role === "Target");

  if (!repository) {
    throw new Error("Repo 2 must be configured before execution can begin.");
  }

  return repository;
}

function getRepositoryByRole(project: ProjectRecord, role: RepositoryRecord["role"]) {
  return project.repositories.find((entry) => entry.role === role) ?? null;
}

function clipText(value: string, limit = 1200) {
  return value.length > limit ? `${value.slice(0, limit)}\n...` : value;
}

function parseJsonFieldSummary(text: string) {
  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] && typeof parsed[0] === "object") {
      return uniqueItems(Object.keys(parsed[0] as Record<string, unknown>), 12);
    }

    if (parsed && typeof parsed === "object") {
      return uniqueItems(Object.keys(parsed as Record<string, unknown>), 12);
    }
  } catch {
    return [];
  }

  return [];
}

function buildDecisionContext(decisions: ExecutionDecisionRecord[]) {
  return decisions
    .filter((decision) => decision.resolvedAutonomously)
    .map((decision) => [
      `Issue: ${decision.issue}`,
      `Category: ${formatDecisionCategory(decision.category)}`,
      `Recommended default: ${decision.recommendedDefault}`,
      `Supporting findings: ${decision.findings.join(" | ")}`,
    ].join("\n"));
}

function getExecutionDecisionContext(run: Pick<ExecutionRun, "decisionRecords" | "assumptionsLogged">) {
  return uniqueItems([
    ...buildDecisionContext(run.decisionRecords),
    ...run.assumptionsLogged,
  ], 28);
}

function hasAppliedExecutionChanges(run: Pick<ExecutionRun, "changedFilesSummary" | "commitsSummary">) {
  return run.changedFilesSummary.length > 0 || run.commitsSummary.length > 0;
}

function createExecutionDecisionRecord(input: {
  agentRole: ExecutionAgentRole;
  issue: string;
  category: ExecutionDecisionCategory;
  confidence: ExecutionDecisionConfidence;
  investigated: string[];
  findings: string[];
  options: string[];
  recommendedDefault: string;
  decisionRequired: string;
  resolvedAutonomously?: boolean;
}) {
  return {
    id: `execution-decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    agentRole: input.agentRole,
    issue: normalizeText(input.issue),
    category: input.category,
    confidence: input.confidence,
    investigated: uniqueItems(input.investigated, 6),
    findings: uniqueItems(input.findings, 8),
    options: uniqueItems(input.options, 4),
    recommendedDefault: normalizeText(input.recommendedDefault),
    decisionRequired: normalizeText(input.decisionRequired),
    resolvedAutonomously: input.resolvedAutonomously ?? false,
  } satisfies ExecutionDecisionRecord;
}

function createEscalationDecisionsFromQuestions(input: {
  agentRole: ExecutionAgentRole;
  questions: string[];
  summary: string;
  findings: string[];
  risks: string[];
}) {
  return uniqueItems(input.questions, 6).map((question) => createExecutionDecisionRecord({
    agentRole: input.agentRole,
    issue: question,
    category: "HighImpactAmbiguity",
    confidence: "Medium",
    investigated: [input.summary, ...input.findings],
    findings: [
      input.summary,
      ...input.findings,
      ...input.risks.map((risk) => `Risk: ${risk}`),
    ],
    options: [
      "Provide operator direction so review can conclude.",
      "Pause execution until the ambiguity is resolved.",
    ],
    recommendedDefault: "Pause execution until the ambiguity is resolved.",
    decisionRequired: "Provide the missing decision or confirm that execution should remain paused.",
  }));
}

function createReviewerDispositionDecision(input: {
  agentRole: Exclude<ExecutionAgentRole, "Coder" | "ProposalCompliance">;
  summary: string;
  findings: string[];
  risks: string[];
}) {
  const reviewerName = formatAgentRole(input.agentRole);

  return createExecutionDecisionRecord({
    agentRole: input.agentRole,
    issue: `${reviewerName} review did not approve the current implementation.`,
    category: "HighImpactAmbiguity",
    confidence: "Medium",
    investigated: [input.summary, ...input.findings],
    findings: [
      input.summary,
      ...input.findings,
      ...input.risks.map((risk) => `Risk: ${risk}`),
    ],
    options: [
      "Pause execution and revise the implementation based on reviewer feedback.",
      "Proceed toward human review with the reviewer concerns explicitly accepted.",
    ],
    recommendedDefault: "Pause execution and revise the implementation before human review.",
    decisionRequired: `Decide whether to accept the ${reviewerName} concerns or require implementation revisions before review continues.`,
  });
}

function appendUniqueActions(existing: ExecutionInvestigationAction[], next: ExecutionInvestigationAction[]) {
  const seen = new Set(existing.map((entry) => `${entry.title.toLowerCase()}::${entry.detail.toLowerCase()}`));
  const merged = [...existing];

  for (const entry of next) {
    const key = `${entry.title.toLowerCase()}::${entry.detail.toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

function appendUniqueDecisionRecords(existing: ExecutionDecisionRecord[], next: ExecutionDecisionRecord[]) {
  const seen = new Set(existing.map((entry) => `${entry.agentRole.toLowerCase()}::${normalizeText(entry.issue).toLowerCase()}`));
  const merged = [...existing];

  for (const entry of next) {
    const key = `${entry.agentRole.toLowerCase()}::${normalizeText(entry.issue).toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

function buildDecisionMessages(agentRole: ExecutionAgentRole, decisions: ExecutionDecisionRecord[], existing: ExecutionAgentMessage[]) {
  const nextMessages = [...existing];

  for (const decision of decisions) {
    const existingIndex = nextMessages.findIndex(
      (message) => message.agentRole === agentRole && normalizeText(message.message).toLowerCase() === normalizeText(decision.issue).toLowerCase(),
    );

    if (existingIndex >= 0 && nextMessages[existingIndex]?.status === "Open") {
      continue;
    }

    const nextMessage = {
      id: `execution-message-${Date.now()}-${nextMessages.length + 1}`,
      createdAt: new Date().toISOString(),
      agentRole,
      kind: "Question",
      status: "Open",
      message: decision.issue,
      category: decision.category,
      confidence: decision.confidence,
      investigationSummary: decision.investigated,
      findings: decision.findings,
      options: decision.options,
      recommendedDefault: decision.recommendedDefault,
      decisionRequired: decision.decisionRequired,
    } satisfies ExecutionAgentMessage;

    if (existingIndex >= 0) {
      nextMessages[existingIndex] = nextMessage;
      continue;
    }

    nextMessages.push(nextMessage);
  }

  return nextMessages;
}

type ExecutionRepositoryEvidence = {
  actions: ExecutionInvestigationAction[];
  findings: string[];
  sourceSnapshots: Array<{ path: string; excerpt: string }>;
  targetSnapshots: Array<{ path: string; excerpt: string }>;
};

type ExecutionGcsEvidence = {
  actions: ExecutionInvestigationAction[];
  findings: string[];
};

type ExecutionInvestigationEvidence = {
  actions: ExecutionInvestigationAction[];
  findings: string[];
  sourceSnapshots: Array<{ path: string; excerpt: string }>;
  targetSnapshots: Array<{ path: string; excerpt: string }>;
  environmentSignals: string[];
};

function extractBucketReferences(values: string[]) {
  const combined = values.join("\n");
  const references = new Map<string, { bucket: string; prefix: string | null }>();
  const gsMatches = [...combined.matchAll(/gs:\/\/([a-z0-9._-]+)(?:\/([^\s"')]+))?/gi)];

  for (const match of gsMatches) {
    const bucket = normalizeText(match[1] ?? "");
    const prefix = normalizeText(match[2] ?? "");

    if (!bucket) {
      continue;
    }

    references.set(bucket, { bucket, prefix: prefix || null });
  }

  const bucketMatches = [...combined.matchAll(/bucket(?:\s+is\s+called|\s+called|\s*:)\s*([a-z0-9._-]+)/gi)];
  const prefixMatches = [...combined.matchAll(/(?:sub\s+directory|prefix|path)(?:\s+of|\s*:)\s*([a-z0-9/_-]+\/?)/gi)];
  const sharedPrefix = prefixMatches.map((match) => normalizeText(match[1] ?? "")).find(Boolean) || null;

  for (const match of bucketMatches) {
    const bucket = normalizeText(match[1] ?? "");

    if (!bucket) {
      continue;
    }

    references.set(bucket, { bucket, prefix: references.get(bucket)?.prefix ?? sharedPrefix });
  }

  return [...references.values()];
}

async function inspectBucketReference(reference: { bucket: string; prefix: string | null }) {
  const actions: ExecutionInvestigationAction[] = [];
  const findings: string[] = [];
  const prefix = reference.prefix ?? undefined;

  try {
    const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT?.trim() || undefined });
    const [files] = await storage.bucket(reference.bucket).getFiles({ prefix, autoPaginate: false, maxResults: 25 });
    const fileNames = files.map((file) => file.name).filter(Boolean);
    const sampleJsonFiles = files.filter((file) => file.name.toLowerCase().endsWith(".json")).slice(0, 3);
    const discoveredFields = new Set<string>();

    for (const file of sampleJsonFiles) {
      const [content] = await file.download();
      const fields = parseJsonFieldSummary(content.toString("utf8"));

      for (const field of fields) {
        discoveredFields.add(field);
      }
    }

    actions.push(createInvestigationAction({
      title: "GCS bucket listing",
      detail: `Listed ${fileNames.length} object(s) from gs://${reference.bucket}${prefix ? `/${prefix}` : ""}.`,
      status: "Completed",
    }));

    findings.push(`GCS inspection found ${fileNames.length} object(s) in gs://${reference.bucket}${prefix ? `/${prefix}` : ""}.`);

    if (sampleJsonFiles.length > 0) {
      findings.push(`Sampled ${sampleJsonFiles.length} JSON file(s); common fields include ${uniqueItems([...discoveredFields], 12).join(", ") || "no stable object keys"}.`);
    }

    return { actions, findings } satisfies ExecutionGcsEvidence;
  } catch (error) {
    const nodeScript = [
      "const { Storage } = require('@google-cloud/storage');",
      `const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT || undefined });`,
      `async function main() {`,
      `  const [files] = await storage.bucket('${reference.bucket}').getFiles({ prefix: ${prefix ? `'${prefix}'` : 'undefined'}, autoPaginate: false, maxResults: 25 });`,
      "  console.log(files.map((file) => file.name));",
      "}",
      "main().catch((error) => { console.error(error); process.exit(1); });",
    ].join("\n");

    actions.push(createInvestigationAction({
      title: "GCS bucket listing",
      detail: `Direct access to gs://${reference.bucket}${prefix ? `/${prefix}` : ""} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      status: "Blocked",
    }));

    findings.push(`GCS access failed for gs://${reference.bucket}${prefix ? `/${prefix}` : ""}. Generated fallback inspection script:\n${nodeScript}`);
    return { actions, findings } satisfies ExecutionGcsEvidence;
  }
}

async function collectRepositoryEvidence(input: {
  project: ProjectRecord;
  sourceStudy: FeatureStudyRunRecord;
  targetStudy: FeatureStudyRunRecord;
  plan: z.infer<typeof executionPlanningSchema>;
}) {
  const sourceRepository = getRepositoryByRole(input.project, "Source");
  const targetRepository = getRepositoryByRole(input.project, "Target");
  const actions: ExecutionInvestigationAction[] = [];
  const findings: string[] = [];

  const sourcePaths = uniqueItems([
    ...input.sourceStudy.understanding?.relevantPaths ?? [],
    ...input.sourceStudy.understanding?.coreTouchpoints ?? [],
  ], 4);
  const targetPaths = uniqueItems([
    ...input.targetStudy.understanding?.relevantPaths ?? [],
    ...input.targetStudy.understanding?.coreTouchpoints ?? [],
    ...input.plan.filesToModify,
    ...input.plan.filesToCreate,
    ...input.plan.executionSteps.flatMap((step) => step.filesTouched),
  ], 8);

  const sourceSnapshots = sourceRepository
    ? (await Promise.all(sourcePaths.map(async (path) => {
        const snapshot = await getGitHubRepositoryFileSnapshot(sourceRepository.url, path, sourceRepository.defaultBranch || "main");

        if (!snapshot?.text) {
          return null;
        }

        return { path, excerpt: clipText(snapshot.text) };
      }))).filter((entry): entry is { path: string; excerpt: string } => Boolean(entry))
    : [];

  const targetSnapshots = targetRepository
    ? (await Promise.all(targetPaths.map(async (path) => {
        const snapshot = await getGitHubRepositoryFileSnapshot(targetRepository.url, path, targetRepository.defaultBranch || "main");

        if (!snapshot?.text) {
          return null;
        }

        return { path, excerpt: clipText(snapshot.text) };
      }))).filter((entry): entry is { path: string; excerpt: string } => Boolean(entry))
    : [];

  actions.push(createInvestigationAction({
    title: "Repo evidence scan",
    detail: `Inspected ${sourceSnapshots.length} source snapshot(s) and ${targetSnapshots.length} target snapshot(s) before escalation.`,
    status: sourceSnapshots.length + targetSnapshots.length > 0 ? "Completed" : "Skipped",
  }));

  if (sourceSnapshots.length > 0) {
    findings.push(`Repo 1 evidence came from ${sourceSnapshots.map((entry) => entry.path).join(", ")}.`);
  }

  if (targetSnapshots.length > 0) {
    findings.push(`Repo 2 evidence came from ${targetSnapshots.map((entry) => entry.path).join(", ")}.`);
  }

  return {
    actions,
    findings,
    sourceSnapshots,
    targetSnapshots,
  } satisfies ExecutionRepositoryEvidence;
}

async function collectInvestigationEvidence(input: {
  project: ProjectRecord;
  proposal: FeatureProposalRecord;
  sourceStudy: FeatureStudyRunRecord;
  targetStudy: FeatureStudyRunRecord;
  plan: z.infer<typeof executionPlanningSchema>;
}) {
  const repoEvidence = await collectRepositoryEvidence(input);
  const environmentSignals = uniqueItems(Object.keys(process.env)
    .filter((key) => /(GOOGLE|GCP|GCS|BUCKET|STORAGE|MONGODB|GITHUB)/i.test(key)), 16);
  const environmentActions = [createInvestigationAction({
    title: "Environment scan",
    detail: environmentSignals.length > 0
      ? `Found relevant environment keys: ${environmentSignals.join(", ")}.`
      : "No explicit Google Cloud or storage-related environment keys were present.",
    status: environmentSignals.length > 0 ? "Completed" : "Skipped",
  })];
  const contentValues = [
    input.proposal.operatorNotes,
    input.proposal.operatorResponses,
    input.proposal.productDirectionDecisions,
    input.proposal.constraintsNonNegotiables,
    input.proposal.content.proposalSummary,
    ...input.proposal.content.sourceBehaviorSummary,
    ...input.proposal.content.targetContextSummary,
    ...input.proposal.content.gapAssessment,
  ].filter(Boolean);
  const bucketReferences = extractBucketReferences(contentValues);
  const gcsEvidence = bucketReferences.length > 0
    ? await Promise.all(bucketReferences.slice(0, 2).map((reference) => inspectBucketReference(reference)))
    : [{ actions: [createInvestigationAction({ title: "External content inspection", detail: "No explicit GCS bucket reference was found in the approved proposal or operator notes.", status: "Skipped" })], findings: [] } satisfies ExecutionGcsEvidence];

  return {
    actions: appendUniqueActions([...repoEvidence.actions, ...environmentActions], gcsEvidence.flatMap((entry) => entry.actions)),
    findings: uniqueItems([
      ...repoEvidence.findings,
      ...gcsEvidence.flatMap((entry) => entry.findings),
      environmentSignals.length > 0 ? `Relevant environment keys are available: ${environmentSignals.join(", ")}.` : "No storage-specific environment keys were available for direct external inspection.",
    ], 20),
    sourceSnapshots: repoEvidence.sourceSnapshots,
    targetSnapshots: repoEvidence.targetSnapshots,
    environmentSignals,
  } satisfies ExecutionInvestigationEvidence;
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
    "Investigate-first: only surface operatorQuestions when the issue is truly a product decision, access issue, or high-impact ambiguity.",
    "This is a planning pass only. No code should be imagined beyond the files needed by the approved proposal.",
    "Implementation details and low-risk assumptions should be expressed as defaults, not as questions.",
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
    "- only add operatorQuestions for product decisions, access issues, or high-impact ambiguities",
    "- keep the step list disciplined and small",
  ].filter(Boolean).join("\n\n");

  const raw = await generateGeminiJson({
    prompt,
    schema: looseExecutionPlanningSchema,
  });

  return normalizeExecutionPlanning(raw);
}

async function generateExecutionBatches(input: {
  project: ProjectRecord;
  featureName: string;
  proposal: FeatureProposalRecord;
  plan: z.infer<typeof executionPlanningSchema>;
  targetRepository: RepositoryRecord;
  branchName: string;
  decisionContext?: string[];
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
    input.decisionContext && input.decisionContext.length > 0 ? "Autonomous investigation defaults:" : "",
    input.decisionContext && input.decisionContext.length > 0 ? input.decisionContext.join("\n\n") : "",
    "Implementation requirements:",
    "- produce 1 to 4 small batches",
    "- each batch should be safe and traceable",
    "- only include file operations that are necessary for the approved proposal",
    "- for create/update operations include the full resulting file content",
    "- delete operations should be rare and only used if the proposal explicitly requires them",
    "- resolve implementation details and low-risk assumptions using the provided evidence and defaults",
    "- additionalQuestions are allowed only for product decisions, access issues, or high-impact ambiguities",
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
  decisionContext?: string[];
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
    input.decisionContext && input.decisionContext.length > 0 ? "Autonomous investigation decisions:" : "",
    input.decisionContext && input.decisionContext.length > 0 ? input.decisionContext.join("\n\n") : "",
    "Review requirements:",
    "- investigate-first: prefer approving with bounded assumptions over asking avoidable questions",
    "- approved should be true only if this slice is acceptable for human review",
    "- findings should be concrete observations, not generic advice",
    "- blockingQuestions should be used only when the operator must clarify something before review can conclude",
  ].filter(Boolean).join("\n\n");

  return generateGeminiJson({
    prompt,
    schema: executionReviewerSchema,
  });
}

async function runAutonomousInvestigation(input: {
  agentRole: ExecutionAgentRole;
  phaseLabel: string;
  issues: string[];
  project: ProjectRecord;
  featureName: string;
  proposal: FeatureProposalRecord;
  sourceStudy: FeatureStudyRunRecord;
  targetStudy: FeatureStudyRunRecord;
  mappingSummary: FeatureMappingSummaryRecord;
  plan: z.infer<typeof executionPlanningSchema>;
  operatorContext: string[];
}) {
  const issues = uniqueItems(input.issues, 8);

  if (issues.length === 0) {
    return {
      summary: "No investigation was required.",
      assumptions: [],
      unresolvedRisks: [],
      actions: [],
      decisions: [],
      escalationDecisions: [],
    };
  }

  const evidence = await collectInvestigationEvidence({
    project: input.project,
    proposal: input.proposal,
    sourceStudy: input.sourceStudy,
    targetStudy: input.targetStudy,
    plan: input.plan,
  });

  const prompt = [
    "You are the autonomous investigation phase for ProjectMapper execution.",
    "Investigate before escalating. Behave like a senior engineer with bounded authority.",
    "Classify each issue into exactly one category:",
    "- ImplementationDetail",
    "- LowRiskAssumption",
    "- ProductDecision",
    "- AccessIssue",
    "- HighImpactAmbiguity",
    "Only ProductDecision, AccessIssue, and HighImpactAmbiguity may remain unresolved.",
    "ImplementationDetail and LowRiskAssumption must be resolved autonomously with a recommended default.",
    "Do not ask raw questions. Every unresolved item must include what was investigated, what was found, options, a recommended default, and the exact decision required.",
    `Phase: ${input.phaseLabel}`,
    `Agent role: ${formatAgentRole(input.agentRole)}`,
    `Project: ${input.project.name}`,
    `Feature: ${input.featureName}`,
    "Issues to investigate:",
    formatPromptData(issues),
    "Approved proposal:",
    formatPromptData({
      summary: input.proposal.content.proposalSummary,
      governingV2Patterns: input.proposal.content.governingV2Patterns,
      recommendedBuildShape: input.proposal.content.recommendedBuildShape,
      explicitNonGoals: input.proposal.content.explicitNonGoals,
      operatorResponses: input.proposal.operatorResponses,
      operatorNotes: input.proposal.operatorNotes,
      productDirectionDecisions: input.proposal.productDirectionDecisions,
      constraintsNonNegotiables: input.proposal.constraintsNonNegotiables,
    }),
    "Execution plan:",
    formatPromptData(input.plan),
    "Repo 1 study summary:",
    formatPromptData({
      summary: input.sourceStudy.understanding?.summary,
      relevantPaths: input.sourceStudy.understanding?.relevantPaths,
      coreTouchpoints: input.sourceStudy.understanding?.coreTouchpoints,
      importantData: input.sourceStudy.understanding?.importantData,
    }),
    "Repo 2 study summary:",
    formatPromptData({
      summary: input.targetStudy.understanding?.summary,
      relevantPaths: input.targetStudy.understanding?.relevantPaths,
      coreTouchpoints: input.targetStudy.understanding?.coreTouchpoints,
      importantData: input.targetStudy.understanding?.importantData,
    }),
    "Mapping summary:",
    formatPromptData(input.mappingSummary),
    "Investigation actions already performed:",
    formatPromptData(evidence.actions.map((action) => ({ title: action.title, detail: action.detail, status: action.status }))),
    "Investigation findings:",
    formatPromptData(evidence.findings),
    "Repo 1 excerpts:",
    formatPromptData(evidence.sourceSnapshots),
    "Repo 2 excerpts:",
    formatPromptData(evidence.targetSnapshots),
    evidence.environmentSignals.length > 0 ? "Environment signals:" : "",
    evidence.environmentSignals.length > 0 ? formatPromptData(evidence.environmentSignals) : "",
    input.operatorContext.length > 0 ? "Previously answered operator context:" : "No prior operator answers are available.",
    input.operatorContext.length > 0 ? input.operatorContext.join("\n\n") : "",
  ].filter(Boolean).join("\n\n");

  const analysis = await generateGeminiJson({
    prompt,
    schema: executionDecisionAnalysisSchema,
  });

  const decisions: ExecutionDecisionRecord[] = analysis.decisions.map((decision, index) => ({
    id: `execution-decision-${Date.now()}-${index + 1}`,
    createdAt: new Date().toISOString(),
    agentRole: input.agentRole,
    issue: normalizeText(decision.issue),
    category: decision.category,
    confidence: decision.confidence,
    investigated: uniqueItems(decision.investigated, 6),
    findings: uniqueItems(decision.findings, 8),
    options: uniqueItems(decision.options, 4),
    recommendedDefault: normalizeText(decision.recommendedDefault),
    decisionRequired: normalizeText(decision.decisionRequired),
    resolvedAutonomously: decision.resolvedAutonomously && !isEscalationCategory(decision.category),
  }));

  return {
    summary: normalizeText(analysis.summary),
    assumptions: uniqueItems(analysis.assumptionsToProceed, 8),
    unresolvedRisks: uniqueItems(analysis.unresolvedRisks, 8),
    actions: evidence.actions,
    decisions,
    escalationDecisions: decisions.filter((decision) => !decision.resolvedAutonomously && isEscalationCategory(decision.category)),
  };
}

function updateRunQuestions(run: ExecutionRun, agentRole: ExecutionAgentRole, decisions: ExecutionDecisionRecord[]) {
  const unresolved = uniqueItems(decisions.map((decision) => decision.issue), 6);

  return {
    ...run,
    status: "Blocked" as const,
    investigationStatus: "Completed" as const,
    agentMessages: buildDecisionMessages(agentRole, decisions, run.agentMessages),
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
  const baseBranch = targetRepository.defaultBranch || "main";

  await createGitHubBranch(targetRepository.url, branchName, baseBranch);

  const run: ExecutionRun = {
    id: `execution-${input.projectId}-${input.featureId}-${Date.now()}`,
    projectId: input.projectId,
    featureId: input.featureId,
    proposalId: proposal.id,
    targetRepositoryId: targetRepository.id,
    branchName,
    baseBranch,
    status: "NotStarted",
    investigationStatus: "NotStarted",
    startedAt: new Date().toISOString(),
    progressLog: [],
    investigationActions: [],
    decisionRecords: [],
    agentMessages: [],
    agentReviews: [],
    changedFilesSummary: [],
    commitsSummary: [],
    testResults: [{ title: "Automated tests", status: "NotRun", detail: "Execution v1 does not run automated tests yet." }],
    risksIdentified: [],
    assumptionsLogged: [],
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

  const planningIssues = uniqueItems([...plan.operatorQuestions, ...plan.missingInfo], 8);

  run = {
    ...run,
    status: "Running",
    investigationStatus: planningIssues.length > 0 ? "InProgress" : "Completed",
    progressLog: [...run.progressLog, nextProgressEntry(run, {
      intent: "Proposal compliance planning",
      filesTouched: uniqueItems([...plan.filesToModify, ...plan.filesToCreate], 8),
      summary: plan.planSummary,
      risks: uniqueItems(plan.risks, 6),
    })],
    risksIdentified: uniqueItems([...run.risksIdentified, ...plan.risks], 12),
  };
  await upsertExecutionRun(run);

  const planningInvestigation = await runAutonomousInvestigation({
    agentRole: "ProposalCompliance",
    phaseLabel: "Execution planning investigation",
    issues: planningIssues,
    project: context.project,
    featureName: context.feature.canonicalName,
    proposal: context.proposal,
    sourceStudy: context.sourceStudy,
    targetStudy: context.targetStudy,
    mappingSummary: context.mappingSummary,
    plan,
    operatorContext: answeredContext,
  });

  const planningDecisionContext = buildDecisionContext(planningInvestigation.decisions);
  const planningAssumptions = uniqueItems([
    ...planningInvestigation.assumptions,
    ...planningInvestigation.decisions
      .filter((decision) => decision.resolvedAutonomously)
      .map((decision) => `${formatDecisionCategory(decision.category)}: ${decision.recommendedDefault}`),
  ], 16);

  run = {
    ...run,
    investigationStatus: "Completed",
    investigationActions: appendUniqueActions(run.investigationActions, planningInvestigation.actions),
    decisionRecords: appendUniqueDecisionRecords(run.decisionRecords, planningInvestigation.decisions),
    assumptionsLogged: uniqueItems([...run.assumptionsLogged, ...planningAssumptions], 20),
    risksIdentified: uniqueItems([...run.risksIdentified, ...planningInvestigation.unresolvedRisks], 16),
    progressLog: planningIssues.length > 0
      ? [...run.progressLog, nextProgressEntry(run, {
          intent: "Autonomous investigation",
          filesTouched: uniqueItems([...plan.filesToModify, ...plan.filesToCreate], 8),
          summary: planningInvestigation.summary,
          risks: uniqueItems(planningInvestigation.unresolvedRisks, 6),
        })]
      : run.progressLog,
  };

  if (planningInvestigation.escalationDecisions.length > 0) {
    const blockedRun = updateRunQuestions(run, "ProposalCompliance", planningInvestigation.escalationDecisions);

    run = {
      ...blockedRun,
      agentReviews: upsertAgentReview(blockedRun.agentReviews, buildAgentReview({
        agentRole: "ProposalCompliance",
        status: "NeedsOperatorInput",
        summary: planningInvestigation.summary || plan.planSummary,
        findings: uniqueItems([
          ...planningDecisionContext,
          ...plan.dependencies.map((item) => `Dependency: ${item}`),
        ], 8),
        risks: uniqueItems([...plan.risks, ...planningInvestigation.unresolvedRisks], 8),
        blockingQuestions: planningInvestigation.escalationDecisions.map((decision) => decision.issue),
      })),
    };
    await upsertExecutionRun(run);
    return run;
  }

  run = {
    ...run,
    unresolvedQuestions: [],
    agentReviews: upsertAgentReview(run.agentReviews, buildAgentReview({
      agentRole: "ProposalCompliance",
      status: "Approved",
      summary: plan.planSummary,
      findings: uniqueItems([
        ...plan.dependencies.map((item) => `Dependency: ${item}`),
        ...plan.executionSteps.map((step) => `${step.intent}: ${step.summary}`),
        ...planningAssumptions,
      ], 8),
      risks: uniqueItems([...plan.risks, ...planningInvestigation.unresolvedRisks], 8),
      blockingQuestions: [],
    })),
  };
  await upsertExecutionRun(run);

  if (!hasAppliedExecutionChanges(run)) {
    let implementationDecisionContext = getExecutionDecisionContext(run);
    let implementation = await generateExecutionBatches({
      project: context.project,
      featureName: context.feature.canonicalName,
      proposal: context.proposal,
      plan,
      targetRepository: context.targetRepository,
      branchName: run.branchName,
      decisionContext: implementationDecisionContext,
    });

    if (implementation.additionalQuestions.length > 0) {
      run = {
        ...run,
        investigationStatus: "InProgress",
      };
      await upsertExecutionRun(run);

      const coderInvestigation = await runAutonomousInvestigation({
        agentRole: "Coder",
        phaseLabel: "Implementation investigation",
        issues: implementation.additionalQuestions,
        project: context.project,
        featureName: context.feature.canonicalName,
        proposal: context.proposal,
        sourceStudy: context.sourceStudy,
        targetStudy: context.targetStudy,
        mappingSummary: context.mappingSummary,
        plan,
        operatorContext: [...answeredContext, ...planningDecisionContext],
      });

      const coderAssumptions = uniqueItems([
        ...coderInvestigation.assumptions,
        ...coderInvestigation.decisions
          .filter((decision) => decision.resolvedAutonomously)
          .map((decision) => `${formatDecisionCategory(decision.category)}: ${decision.recommendedDefault}`),
      ], 12);

      run = {
        ...run,
        investigationStatus: "Completed",
        investigationActions: appendUniqueActions(run.investigationActions, coderInvestigation.actions),
        decisionRecords: appendUniqueDecisionRecords(run.decisionRecords, coderInvestigation.decisions),
        assumptionsLogged: uniqueItems([...run.assumptionsLogged, ...coderAssumptions], 24),
        risksIdentified: uniqueItems([...run.risksIdentified, ...coderInvestigation.unresolvedRisks], 18),
        progressLog: [...run.progressLog, nextProgressEntry(run, {
          intent: "Implementation investigation",
          filesTouched: uniqueItems([...plan.filesToModify, ...plan.filesToCreate], 8),
          summary: coderInvestigation.summary,
          risks: uniqueItems(coderInvestigation.unresolvedRisks, 6),
        })],
      };

      if (coderInvestigation.escalationDecisions.length > 0) {
        const blockedRun = updateRunQuestions(run, "Coder", coderInvestigation.escalationDecisions);

        run = {
          ...blockedRun,
          agentReviews: upsertAgentReview(blockedRun.agentReviews, buildAgentReview({
            agentRole: "Coder",
            status: "NeedsOperatorInput",
            summary: coderInvestigation.summary,
            findings: coderAssumptions,
            risks: coderInvestigation.unresolvedRisks,
            blockingQuestions: coderInvestigation.escalationDecisions.map((decision) => decision.issue),
          })),
        };
        await upsertExecutionRun(run);
        return run;
      }

      run = {
        ...run,
        agentReviews: upsertAgentReview(run.agentReviews, buildAgentReview({
          agentRole: "Coder",
          status: "Approved",
          summary: "The coder agent resolved implementation unknowns through autonomous investigation and regenerated the work plan before applying changes.",
          findings: coderAssumptions,
          risks: coderInvestigation.unresolvedRisks,
          blockingQuestions: [],
        })),
      };
      await upsertExecutionRun(run);

      implementationDecisionContext = getExecutionDecisionContext(run);
      implementation = await generateExecutionBatches({
        project: context.project,
        featureName: context.feature.canonicalName,
        proposal: context.proposal,
        plan,
        targetRepository: context.targetRepository,
        branchName: run.branchName,
        decisionContext: implementationDecisionContext,
      });
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
  }

  const changedFileSnapshots = await getChangedFileSnapshots(run, context.targetRepository);

  for (const agentRole of REVIEWER_ROLES) {
    let review = await generateReviewerOutput({
      agentRole,
      project: context.project,
      featureName: context.feature.canonicalName,
      proposal: context.proposal,
      mappingSummary: context.mappingSummary,
      changedFiles: changedFileSnapshots,
      operatorContext: answeredContext,
      decisionContext: getExecutionDecisionContext(run),
    });

    let reviewerEscalations: ExecutionDecisionRecord[] = [];
    let reviewerRisks = review.risks;
    let reviewerStatus: ExecutionAgentReview["status"] = review.approved ? "Approved" : "Pending";

    if (review.blockingQuestions.length > 0) {
      run = {
        ...run,
        investigationStatus: "InProgress",
      };
      await upsertExecutionRun(run);

      const reviewInvestigation = await runAutonomousInvestigation({
        agentRole,
        phaseLabel: `${formatAgentRole(agentRole)} review investigation`,
        issues: review.blockingQuestions,
        project: context.project,
        featureName: context.feature.canonicalName,
        proposal: context.proposal,
        sourceStudy: context.sourceStudy,
        targetStudy: context.targetStudy,
        mappingSummary: context.mappingSummary,
        plan,
        operatorContext: [...answeredContext, ...planningDecisionContext, ...run.assumptionsLogged],
      });

      const reviewAssumptions = uniqueItems([
        ...reviewInvestigation.assumptions,
        ...reviewInvestigation.decisions
          .filter((decision) => decision.resolvedAutonomously)
          .map((decision) => `${formatDecisionCategory(decision.category)}: ${decision.recommendedDefault}`),
      ], 12);

      reviewerEscalations = reviewInvestigation.escalationDecisions;
      reviewerRisks = uniqueItems([...review.risks, ...reviewInvestigation.unresolvedRisks], 8);

      run = {
        ...run,
        investigationStatus: "Completed",
        investigationActions: appendUniqueActions(run.investigationActions, reviewInvestigation.actions),
        decisionRecords: appendUniqueDecisionRecords(run.decisionRecords, reviewInvestigation.decisions),
        assumptionsLogged: uniqueItems([...run.assumptionsLogged, ...reviewAssumptions], 28),
        risksIdentified: uniqueItems([...run.risksIdentified, ...reviewInvestigation.unresolvedRisks], 20),
        progressLog: [...run.progressLog, nextProgressEntry(run, {
          intent: `${formatAgentRole(agentRole)} investigation`,
          filesTouched: uniqueItems(changedFileSnapshots.map((entry) => entry.path), 12),
          summary: reviewInvestigation.summary,
          risks: uniqueItems(reviewInvestigation.unresolvedRisks, 6),
        })],
      };
      await upsertExecutionRun(run);

      if (reviewerEscalations.length === 0) {
        review = await generateReviewerOutput({
          agentRole,
          project: context.project,
          featureName: context.feature.canonicalName,
          proposal: context.proposal,
          mappingSummary: context.mappingSummary,
          changedFiles: changedFileSnapshots,
          operatorContext: answeredContext,
          decisionContext: getExecutionDecisionContext(run),
        });
        reviewerRisks = uniqueItems([...review.risks, ...reviewInvestigation.unresolvedRisks], 8);

        if (review.blockingQuestions.length > 0) {
          reviewerEscalations = createEscalationDecisionsFromQuestions({
            agentRole,
            questions: review.blockingQuestions,
            summary: review.summary,
            findings: review.findings,
            risks: reviewerRisks,
          });
        }
      }
    }

    reviewerStatus = reviewerEscalations.length > 0 ? "NeedsOperatorInput" : review.approved ? "Approved" : "Pending";

    const reviewRecord = buildAgentReview({
      agentRole,
      status: reviewerStatus,
      summary: review.summary,
      findings: review.findings,
      risks: reviewerRisks,
      blockingQuestions: reviewerEscalations.map((decision) => decision.issue),
    });

    run = {
      ...run,
      agentReviews: upsertAgentReview(run.agentReviews, reviewRecord),
      risksIdentified: uniqueItems([...run.risksIdentified, ...reviewerRisks], 20),
      progressLog: [...run.progressLog, nextProgressEntry(run, {
        intent: `${formatAgentRole(agentRole)} review`,
        filesTouched: uniqueItems(changedFileSnapshots.map((entry) => entry.path), 12),
        summary: review.summary,
        risks: reviewerRisks,
      })],
    };
    await upsertExecutionRun(run);

    if (reviewerEscalations.length > 0) {
      run = updateRunQuestions(run, agentRole, reviewerEscalations);
      await upsertExecutionRun(run);
      return run;
    }

    if (!review.approved) {
      const reviewerDispositionDecision = createReviewerDispositionDecision({
        agentRole,
        summary: review.summary,
        findings: review.findings,
        risks: reviewerRisks,
      });
      const blockedRun = updateRunQuestions(run, agentRole, [reviewerDispositionDecision]);

      run = {
        ...blockedRun,
        agentReviews: upsertAgentReview(blockedRun.agentReviews, buildAgentReview({
          agentRole,
          status: "NeedsOperatorInput",
          summary: review.summary,
          findings: review.findings,
          risks: reviewerRisks,
          blockingQuestions: [reviewerDispositionDecision.issue],
        })),
      };
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