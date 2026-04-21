import { z } from "zod";

import type {
  DoctrineVersionRecord,
  FeatureMappingSummaryRecord,
  FeatureProposalContent,
  FeatureProposalDesignOption,
  FeatureProposalRecord,
  FeatureStudyRunRecord,
} from "@/domain/intelligence";
import type { ProjectRecord } from "@/domain/project-mapper";
import { getLatestDoctrineVersion } from "@/lib/doctrine-store";
import { getLatestFeatureMappingSummary, readFeatureInventoryRecord, readFeatureStudyRun, updateFeatureInventoryRecord } from "@/lib/feature-store";
import { generateGeminiJson } from "@/lib/gemini";
import { getLatestFeatureProposal, upsertFeatureProposal, updateFeatureProposal } from "@/lib/proposal-store";

const looseFeatureProposalSchema = z.object({
  proposalSummary: z.unknown().optional(),
  sourceBehaviorSummary: z.unknown().optional(),
  targetContextSummary: z.unknown().optional(),
  gapAssessment: z.unknown().optional(),
  designDirectionOptions: z.unknown().optional(),
  governingV2Patterns: z.unknown().optional(),
  recommendedBuildShape: z.unknown().optional(),
  operatorDesignQuestions: z.unknown().optional(),
  explicitNonGoals: z.unknown().optional(),
  risksAndUnknowns: z.unknown().optional(),
  questionsForOperator: z.unknown().optional(),
  suggestedImplementationScope: z.unknown().optional(),
  revisionDelta: z.unknown().optional(),
});

export interface FeatureProposalReadinessCheck {
  label: string;
  satisfied: boolean;
  detail: string;
}

export interface FeatureProposalReadiness {
  ready: boolean;
  sourceStudy: FeatureStudyRunRecord | null;
  targetStudy: FeatureStudyRunRecord | null;
  mappingSummary: FeatureMappingSummaryRecord | null;
  doctrineVersion: DoctrineVersionRecord | null;
  checks: FeatureProposalReadinessCheck[];
  blockingReasons: string[];
}

type ReadyFeatureProposalInputs = {
  sourceStudy: FeatureStudyRunRecord;
  targetStudy: FeatureStudyRunRecord;
  mappingSummary: FeatureMappingSummaryRecord;
  doctrineVersion: DoctrineVersionRecord;
  checks: FeatureProposalReadinessCheck[];
  blockingReasons: string[];
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toListItems(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\n+/)
      .map((entry) => normalizeText(entry))
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

function uniqueItems(items: string[], limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];

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

function normalizeSummary(value: unknown, fallback: string) {
  if (typeof value === "string" && normalizeText(value)) {
    return normalizeText(value);
  }

  const items = toListItems(value);
  return items[0] ?? fallback;
}

function normalizeSection(value: unknown, fallback: string[], minimum = 1, limit = 8) {
  const items = uniqueItems(toListItems(value), limit);
  return items.length >= minimum ? items : uniqueItems(fallback, limit);
}

function formatPromptData(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function serializeList(items: string[]) {
  return items.join("\n");
}

function normalizeDesignOptionPosture(value: string): FeatureProposalDesignOption["posture"] {
  const normalized = normalizeText(value).toLowerCase();

  if (normalized.includes("ambitious")) {
    return "More Ambitious";
  }

  if (normalized.includes("recommended") || normalized.includes("v2")) {
    return "Recommended / V2-native";
  }

  return "Safe / Minimal";
}

function normalizeDesignDirectionOptions(value: unknown, fallbackFeatureName: string): FeatureProposalDesignOption[] {
  const fallback: FeatureProposalDesignOption[] = [
    {
      title: "Option A",
      posture: "Safe / Minimal",
      description: `Rebuild ${fallbackFeatureName} using the smallest V2-compatible interpretation that preserves core user value without recreating V1 sprawl.`,
      pros: [
        "Lower delivery risk and easier fit with current Repo 2 systems.",
        "Preserves the most important capability without overcommitting to legacy behavior.",
      ],
      cons: [
        "May under-shoot the best V2 experience.",
        "Can leave value fragmented if the feature wants a more integrated interaction model.",
      ],
      doctrineAlignment: [
        "Aligns with migration simplification and V2-native reinterpretation.",
      ],
    },
    {
      title: "Option B",
      posture: "Recommended / V2-native",
      description: `Re-express ${fallbackFeatureName} as a shared V2-native workflow built around chat, panels, artifacts, and existing Repo 2 systems.`,
      pros: [
        "Best alignment with doctrine and long-term product direction.",
        "Improves UX instead of merely translating V1 behavior.",
      ],
      cons: [
        "Requires stronger product decisions up front.",
        "May require deeper integration work than a minimal port.",
      ],
      doctrineAlignment: [
        "Strong alignment with chat-native, artifact-driven, and system-unifying RevEd V2 doctrine.",
      ],
    },
  ];

  if (!Array.isArray(value)) {
    return fallback;
  }

  const options = value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const title = typeof record.title === "string" && normalizeText(record.title)
      ? normalizeText(record.title)
      : `Option ${String.fromCharCode(65 + index)}`;
    const description = normalizeSummary(
      record.description ?? record.summary,
      `${title} proposes one possible V2-native direction for ${fallbackFeatureName}.`,
    );
    const pros = normalizeSection(record.pros, ["Supports the migration direction with plausible product value."], 1, 4);
    const cons = normalizeSection(record.cons, ["Includes tradeoffs that must be weighed before building."], 1, 4);
    const doctrineAlignment = normalizeSection(record.doctrineAlignment, ["Should be evaluated against V2 doctrine and migration rules."], 1, 4);

    return [{
      title,
      posture: normalizeDesignOptionPosture(String(record.posture ?? title)),
      description,
      pros,
      cons,
      doctrineAlignment,
    } satisfies FeatureProposalDesignOption];
  });

  return options.length > 0 ? options.slice(0, 3) : fallback;
}

function getDoctrineSection(
  content: DoctrineVersionRecord["content"],
  key: keyof DoctrineVersionRecord["content"],
  fallbackKeys: string[] = [],
) {
  const record = content as unknown as Record<string, unknown>;
  const direct = record[key];

  if (Array.isArray(direct)) {
    return direct.filter((entry): entry is string => typeof entry === "string");
  }

  for (const fallbackKey of fallbackKeys) {
    const fallback = record[fallbackKey];

    if (Array.isArray(fallback)) {
      return fallback.filter((entry): entry is string => typeof entry === "string");
    }
  }

  return [];
}

export function parseTextareaList(value: FormDataEntryValue | null, fallback: string[] = []) {
  if (typeof value !== "string") {
    return fallback;
  }

  const items = uniqueItems(value.split(/\n+/), 12);
  return items.length > 0 ? items : fallback;
}

function buildProposalPrompt(input: {
  project: ProjectRecord;
  featureName: string;
  sourceStudy: FeatureStudyRunRecord;
  targetStudy: FeatureStudyRunRecord;
  mappingSummary: FeatureMappingSummaryRecord;
  doctrineVersion: DoctrineVersionRecord;
  priorProposal: FeatureProposalRecord | null;
  revisionNote?: string;
}) {
  return [
    "You are generating a serious migration implementation proposal for ProjectMapper.",
    "This is the proposal layer between intelligence gathering and execution.",
    "The proposal must answer what should be built in Repo 2 before any code execution begins.",
    "Optimize for V2-native implementation thinking, not V1 mirroring.",
    "Do not propose literal route copying, legacy page sprawl, or structures that fight the chat, panel, artifact, and modern V2 interaction model.",
    "Preserve product capability, not legacy form.",
    "Be decisive and specific. This is not another summary.",
    "Return valid JSON with only these keys:",
    "proposalSummary, sourceBehaviorSummary, targetContextSummary, gapAssessment, governingV2Patterns, recommendedBuildShape, explicitNonGoals, risksAndUnknowns, questionsForOperator, suggestedImplementationScope",
    `Project: ${input.project.name}`,
    `Mission: ${input.project.mission}`,
    `Feature: ${input.featureName}`,
    "Repo 1 feature study:",
    formatPromptData({
      summary: input.sourceStudy.understanding?.summary,
      featureDefinition: input.sourceStudy.understanding?.featureDefinition,
      userValue: input.sourceStudy.understanding?.userValue,
      workflows: input.sourceStudy.understanding?.workflows,
      workflowNarrative: input.sourceStudy.understanding?.workflowNarrative,
      relevantPaths: input.sourceStudy.understanding?.relevantPaths,
      importantData: input.sourceStudy.understanding?.importantData,
      aiInvolvement: input.sourceStudy.understanding?.aiInvolvement,
      migrationInterpretation: input.sourceStudy.understanding?.migrationInterpretation,
      rebuildImplications: input.sourceStudy.understanding?.rebuildImplications,
      highConfidenceAreas: input.sourceStudy.highConfidenceAreas,
      weakConfidenceAreas: input.sourceStudy.weakConfidenceAreas,
    }),
    "Repo 2 feature study:",
    formatPromptData({
      summary: input.targetStudy.understanding?.summary,
      featureDefinition: input.targetStudy.understanding?.featureDefinition,
      existingBehavior: input.targetStudy.understanding?.existingBehavior,
      relevantPaths: input.targetStudy.understanding?.relevantPaths,
      coreTouchpoints: input.targetStudy.understanding?.coreTouchpoints,
      importantData: input.targetStudy.understanding?.importantData,
      dependencies: input.targetStudy.understanding?.dependencies,
      architectureNotes: input.targetStudy.understanding?.architectureNotes,
      migrationInterpretation: input.targetStudy.understanding?.migrationInterpretation,
      highConfidenceAreas: input.targetStudy.highConfidenceAreas,
      weakConfidenceAreas: input.targetStudy.weakConfidenceAreas,
    }),
    "Feature mapping summary:",
    formatPromptData(input.mappingSummary),
    "Approved Repo 2 doctrine:",
    formatPromptData(input.doctrineVersion.content),
    input.priorProposal
      ? "Existing proposal draft and operator review context:"
      : "No prior proposal exists for this feature.",
    input.priorProposal
      ? formatPromptData({
          version: input.priorProposal.version,
          status: input.priorProposal.status,
          operatorComments: input.priorProposal.operatorComments,
          operatorResponses: input.priorProposal.operatorResponses,
          operatorNotes: input.priorProposal.operatorNotes,
          productDirectionDecisions: input.priorProposal.productDirectionDecisions,
          constraintsNonNegotiables: input.priorProposal.constraintsNonNegotiables,
          content: input.priorProposal.content,
        })
      : "",
    input.revisionNote ? `Revision request: ${input.revisionNote}` : "",
    input.priorProposal?.operatorNotes ? `Operator notes: ${input.priorProposal.operatorNotes}` : "",
    input.priorProposal?.productDirectionDecisions ? `Product direction decisions: ${input.priorProposal.productDirectionDecisions}` : "",
    input.priorProposal?.constraintsNonNegotiables ? `Constraints and non-negotiables: ${input.priorProposal.constraintsNonNegotiables}` : "",
    "Proposal requirements:",
    "Act like a product designer, system architect, and collaborator, not a summarizer.",
    "Push beyond literal translation. Prefer better UX, stronger AI integration, cleaner system design, and more V2-native interaction patterns where justified.",
    "Challenge weak assumptions and identify better alternatives when the obvious path is too conservative.",
    "- proposalSummary should be a plain-English migration direction for this feature",
    "- sourceBehaviorSummary should explain what the feature actually does in Repo 1",
    "- targetContextSummary should explain what already exists in Repo 2 that matters",
    "- gapAssessment should distinguish existing, partial, missing, and reinterpreted capability",
    "- designDirectionOptions should include Option A safe/minimal, Option B recommended/V2-native, and Option C only when a meaningfully more ambitious path is credible",
    "- each design option should include description, pros, cons, and doctrine alignment",
    "- governingV2Patterns should be grounded in doctrine and Repo 2 patterns",
    "- recommendedBuildShape should describe the likely V2-native implementation shape",
    "- operatorDesignQuestions should ask high-value product and philosophy questions, not implementation trivia",
    "- explicitNonGoals should clearly reject bad migration moves and legacy carry-over",
    "- risksAndUnknowns should cover product, architecture, migration, and confidence concerns",
    "- questionsForOperator should include only high-value questions that materially improve implementation understanding if still needed",
    "- suggestedImplementationScope should describe what the first build pass should include",
    "- revisionDelta should explain what changed from the previous version and which operator inputs drove those changes when revising",
  ].filter(Boolean).join("\n\n");
}

function normalizeProposalContent(
  raw: z.infer<typeof looseFeatureProposalSchema>,
  context: {
    featureName: string;
    sourceStudy: FeatureStudyRunRecord;
    targetStudy: FeatureStudyRunRecord;
    mappingSummary: FeatureMappingSummaryRecord;
    doctrineVersion: DoctrineVersionRecord;
    priorProposal: FeatureProposalRecord | null;
    operatorInputs: {
      operatorNotes: string;
      productDirectionDecisions: string;
      constraintsNonNegotiables: string;
      operatorResponses: string;
    };
  },
): FeatureProposalContent {
  return {
    proposalSummary: normalizeSummary(
      raw.proposalSummary,
      `Build ${context.featureName} as a V2-native capability grounded in existing Repo 2 patterns rather than mirroring the Repo 1 implementation surface.`,
    ),
    sourceBehaviorSummary: normalizeSection(raw.sourceBehaviorSummary, [
      context.sourceStudy.understanding?.summary ?? `${context.featureName} behavior in Repo 1 needs to be preserved as product capability.`,
      ...context.mappingSummary.sourceBehavior,
    ], 2),
    targetContextSummary: normalizeSection(raw.targetContextSummary, [
      context.targetStudy.understanding?.summary ?? `${context.featureName} must be grounded against the current Repo 2 architecture.`,
      ...context.mappingSummary.existingInTarget,
      ...context.mappingSummary.partialInTarget,
    ], 2),
    gapAssessment: normalizeSection(raw.gapAssessment, [
      ...context.mappingSummary.missingInTarget,
      ...context.mappingSummary.partialInTarget,
      ...context.mappingSummary.openQuestions,
    ], 2),
    designDirectionOptions: normalizeDesignDirectionOptions(raw.designDirectionOptions, context.featureName),
    governingV2Patterns: normalizeSection(raw.governingV2Patterns, [
      ...context.mappingSummary.governingPatterns,
      ...context.mappingSummary.doctrineConstraints,
      ...getDoctrineSection(context.doctrineVersion.content, "productDoctrine", ["architecturePatterns", "uxPatterns"]),
      ...getDoctrineSection(context.doctrineVersion.content, "interactionModel", ["interactionPatterns"]),
      ...getDoctrineSection(context.doctrineVersion.content, "migrationRules", ["criticalRules"]),
      ...getDoctrineSection(context.doctrineVersion.content, "featureDesignRules", ["criticalRules"]),
      ...getDoctrineSection(context.doctrineVersion.content, "technicalConstraints", ["criticalRules"]),
    ], 2, 10),
    recommendedBuildShape: normalizeSection(raw.recommendedBuildShape, [
      ...context.mappingSummary.recommendedNextSteps,
      ...(context.targetStudy.understanding?.migrationInterpretation ?? []),
      ...(context.targetStudy.understanding?.rebuildImplications ?? []),
    ], 2, 10),
    operatorDesignQuestions: normalizeSection(raw.operatorDesignQuestions, [
      "What should the ideal user experience for this feature feel like in RevEd V2: guided assistant, workflow tool, or editable artifact workspace?",
      "Should this feature optimize for simplicity or power in its first V2 version?",
      "How much AI autonomy versus explicit user control should the V2 experience expose?",
      "Should this become a generalized system capability or remain a more specialized experience?",
    ], 3, 8),
    explicitNonGoals: normalizeSection(raw.explicitNonGoals, [
      "Do not mirror Repo 1 route and page structure directly inside Repo 2.",
      "Do not preserve legacy implementation shape when the capability can fit a cleaner V2-native interaction model.",
    ], 2),
    risksAndUnknowns: normalizeSection(raw.risksAndUnknowns, [
      ...context.mappingSummary.openQuestions,
      ...context.mappingSummary.confidenceNotes,
      ...(context.sourceStudy.understanding?.openQuestions ?? []),
      ...(context.targetStudy.understanding?.openQuestions ?? []),
    ], 2, 10),
    questionsForOperator: normalizeSection(raw.questionsForOperator, [
      ...context.mappingSummary.openQuestions,
      ...(context.sourceStudy.understanding?.openQuestions ?? []),
      ...(context.targetStudy.understanding?.openQuestions ?? []),
    ], 0, 6),
    suggestedImplementationScope: normalizeSection(raw.suggestedImplementationScope, [
      ...context.mappingSummary.recommendedNextSteps,
      ...(context.targetStudy.understanding?.rebuildImplications ?? []),
    ], 2, 10),
    revisionDelta: normalizeSection(raw.revisionDelta, [
      context.priorProposal
        ? `This revision reconsidered the prior proposal using the operator inputs captured for ${context.featureName}.`
        : "Initial proposal draft created from the latest studies, mapping summary, and doctrine.",
      ...(context.operatorInputs.operatorNotes ? [`Operator notes influenced the revised direction: ${context.operatorInputs.operatorNotes}`] : []),
      ...(context.operatorInputs.productDirectionDecisions ? [`Product direction decisions shaped the revision: ${context.operatorInputs.productDirectionDecisions}`] : []),
      ...(context.operatorInputs.constraintsNonNegotiables ? [`Constraints and non-negotiables were applied: ${context.operatorInputs.constraintsNonNegotiables}`] : []),
      ...(context.operatorInputs.operatorResponses ? [`Operator answers to proposal questions influenced the revision: ${context.operatorInputs.operatorResponses}`] : []),
    ], 1, 6),
  };
}

export async function getFeatureProposalReadiness(projectId: string, featureId: string): Promise<FeatureProposalReadiness> {
  const feature = await readFeatureInventoryRecord(projectId, featureId);

  if (!feature) {
    throw new Error("Feature not found.");
  }

  const [sourceStudy, targetStudy, mappingSummary, doctrineVersion] = await Promise.all([
    feature.latestSourceStudyRunId ? readFeatureStudyRun(feature.latestSourceStudyRunId) : Promise.resolve(null),
    feature.latestTargetStudyRunId ? readFeatureStudyRun(feature.latestTargetStudyRunId) : Promise.resolve(null),
    feature.latestMappingSummaryId ? getLatestFeatureMappingSummary(projectId, featureId) : Promise.resolve(null),
    getLatestDoctrineVersion(projectId),
  ]);

  const checks: FeatureProposalReadinessCheck[] = [
    {
      label: "Repo 1 feature study",
      satisfied: Boolean(sourceStudy?.status === "Complete" && sourceStudy.understanding),
      detail: sourceStudy?.status === "Complete" && sourceStudy.understanding
        ? `Repo 1 feature study v${sourceStudy.version} is ready.`
        : "Complete Repo 1 feature study before generating a proposal.",
    },
    {
      label: "Repo 2 feature study",
      satisfied: Boolean(targetStudy?.status === "Complete" && targetStudy.understanding),
      detail: targetStudy?.status === "Complete" && targetStudy.understanding
        ? `Repo 2 feature study v${targetStudy.version} is ready.`
        : "Complete Repo 2 feature study before generating a proposal.",
    },
    {
      label: "Current mapping",
      satisfied: Boolean(mappingSummary?.status === "Current"),
      detail: mappingSummary?.status === "Current"
        ? "A current feature mapping summary is available."
        : "Refresh feature mapping before proposal generation.",
    },
    {
      label: "Approved doctrine",
      satisfied: doctrineVersion?.status === "Approved",
      detail: doctrineVersion?.status === "Approved"
        ? `Doctrine v${doctrineVersion.version} is approved and ready.`
        : doctrineVersion
          ? `Doctrine v${doctrineVersion.version} is ${doctrineVersion.status.toLowerCase()} and cannot ground proposal generation yet.`
          : "Generate and approve doctrine before proposal generation.",
    },
  ];

  return {
    ready: checks.every((check) => check.satisfied),
    sourceStudy,
    targetStudy,
    mappingSummary,
    doctrineVersion,
    checks,
    blockingReasons: checks.filter((check) => !check.satisfied).map((check) => check.detail),
  };
}

export async function assertFeatureProposalReady(projectId: string, featureId: string) {
  const readiness = await getFeatureProposalReadiness(projectId, featureId);

  if (!readiness.ready || !readiness.sourceStudy || !readiness.targetStudy || !readiness.mappingSummary || !readiness.doctrineVersion) {
    throw new Error(readiness.blockingReasons.join(" "));
  }

  return {
    sourceStudy: readiness.sourceStudy,
    targetStudy: readiness.targetStudy,
    mappingSummary: readiness.mappingSummary,
    doctrineVersion: readiness.doctrineVersion,
    checks: readiness.checks,
    blockingReasons: readiness.blockingReasons,
  } satisfies ReadyFeatureProposalInputs;
}

function appendRevisionEntry(
  proposal: FeatureProposalRecord | null,
  version: number,
  action: FeatureProposalRecord["revisionHistory"][number]["action"],
  actor: string,
  note?: string,
) {
  return [
    ...(proposal?.revisionHistory ?? []),
    {
      version,
      action,
      actor,
      createdAt: new Date().toISOString(),
      note: note ? normalizeText(note) : undefined,
    },
  ];
}

export async function generateFeatureProposal(input: {
  project: ProjectRecord;
  featureId: string;
  generatedBy: string;
  revisionNote?: string;
}) {
  const feature = await readFeatureInventoryRecord(input.project.id, input.featureId);

  if (!feature) {
    throw new Error("The requested feature could not be found.");
  }

  const readiness = await assertFeatureProposalReady(input.project.id, input.featureId);
  const priorProposal = await getLatestFeatureProposal(input.project.id, input.featureId);
  const raw = await generateGeminiJson({
    prompt: buildProposalPrompt({
      project: input.project,
      featureName: feature.canonicalName,
      sourceStudy: readiness.sourceStudy,
      targetStudy: readiness.targetStudy,
      mappingSummary: readiness.mappingSummary,
      doctrineVersion: readiness.doctrineVersion,
      priorProposal,
      revisionNote: input.revisionNote,
    }),
    schema: looseFeatureProposalSchema,
  });
  const content = normalizeProposalContent(raw, {
    featureName: feature.canonicalName,
    sourceStudy: readiness.sourceStudy,
    targetStudy: readiness.targetStudy,
    mappingSummary: readiness.mappingSummary,
    doctrineVersion: readiness.doctrineVersion,
    priorProposal,
    operatorInputs: {
      operatorNotes: priorProposal?.operatorNotes ?? "",
      productDirectionDecisions: priorProposal?.productDirectionDecisions ?? "",
      constraintsNonNegotiables: priorProposal?.constraintsNonNegotiables ?? "",
      operatorResponses: priorProposal?.operatorResponses ?? "",
    },
  });
  const version = (priorProposal?.version ?? 0) + 1;
  const now = new Date().toISOString();
  const record: FeatureProposalRecord = {
    id: priorProposal?.id ?? `feature-proposal-${input.project.id}-${input.featureId}`,
    projectId: input.project.id,
    featureId: input.featureId,
    featureName: feature.canonicalName,
    sourceStudyRunId: readiness.sourceStudy.id,
    targetStudyRunId: readiness.targetStudy.id,
    mappingSummaryId: readiness.mappingSummary.id,
    doctrineVersionId: readiness.doctrineVersion.id,
    version,
    status: "Draft",
    createdAt: priorProposal?.createdAt ?? now,
    updatedAt: now,
    generatedBy: priorProposal?.generatedBy ?? input.generatedBy,
    operatorComments: priorProposal?.operatorComments ?? "",
    operatorResponses: priorProposal?.operatorResponses ?? "",
    operatorNotes: priorProposal?.operatorNotes ?? "",
    productDirectionDecisions: priorProposal?.productDirectionDecisions ?? "",
    constraintsNonNegotiables: priorProposal?.constraintsNonNegotiables ?? "",
    approvedBy: undefined,
    approvedAt: undefined,
    content,
    revisionHistory: appendRevisionEntry(
      priorProposal,
      version,
      priorProposal ? "Revision Requested" : "Generated",
      input.generatedBy,
      input.revisionNote,
    ),
  };

  await upsertFeatureProposal(record);
  await updateFeatureInventoryRecord(input.project.id, input.featureId, (current) => ({
    ...current,
    status: "Proposed",
    updatedAt: now,
  }));
  return record;
}

export async function updateFeatureProposalDraft(input: {
  proposalId: string;
  editedBy: string;
  content: FeatureProposalContent;
  operatorComments: string;
  operatorResponses: string;
  operatorNotes: string;
  productDirectionDecisions: string;
  constraintsNonNegotiables: string;
}) {
  return updateFeatureProposal(input.proposalId, (proposal) => ({
    ...proposal,
    updatedAt: new Date().toISOString(),
    status: proposal.status === "Approved" ? "Approved" : "Draft",
    content: input.content,
    operatorComments: normalizeText(input.operatorComments),
    operatorResponses: normalizeText(input.operatorResponses),
    operatorNotes: normalizeText(input.operatorNotes),
    productDirectionDecisions: normalizeText(input.productDirectionDecisions),
    constraintsNonNegotiables: normalizeText(input.constraintsNonNegotiables),
    revisionHistory: appendRevisionEntry(proposal, proposal.version, "Edited", input.editedBy),
  }));
}

export async function approveFeatureProposal(input: {
  proposalId: string;
  approvedBy: string;
}) {
  return updateFeatureProposal(input.proposalId, (proposal) => ({
    ...proposal,
    status: "Approved",
    updatedAt: new Date().toISOString(),
    approvedBy: input.approvedBy,
    approvedAt: new Date().toISOString(),
    revisionHistory: appendRevisionEntry(proposal, proposal.version, "Approved", input.approvedBy),
  }));
}

export function buildEditableProposalContent(input: FeatureProposalContent) {
  return {
    proposalSummary: input.proposalSummary,
    sourceBehaviorSummary: serializeList(input.sourceBehaviorSummary),
    targetContextSummary: serializeList(input.targetContextSummary),
    gapAssessment: serializeList(input.gapAssessment),
    designDirectionOptions: input.designDirectionOptions,
    governingV2Patterns: serializeList(input.governingV2Patterns),
    recommendedBuildShape: serializeList(input.recommendedBuildShape),
    operatorDesignQuestions: serializeList(input.operatorDesignQuestions),
    explicitNonGoals: serializeList(input.explicitNonGoals),
    risksAndUnknowns: serializeList(input.risksAndUnknowns),
    questionsForOperator: serializeList(input.questionsForOperator),
    suggestedImplementationScope: serializeList(input.suggestedImplementationScope),
    revisionDelta: serializeList(input.revisionDelta),
  };
}