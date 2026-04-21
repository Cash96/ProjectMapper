import { z } from "zod";

import type {
  FeatureInventoryRecord,
  FeatureMappingSummaryRecord,
  FeatureStudyRunRecord,
  FeatureStudyUnderstanding,
  RepositoryAnalysisArtifact,
  RepoStudyIterationDelta,
  RepoStudyOperatorGuidanceEntry,
  RepoStudyOperatorQuestion,
  RepoStudyRunRecord,
} from "@/domain/intelligence";
import type { ProjectRecord, RepositoryRecord } from "@/domain/project-mapper";
import {
  createFeatureStudyRun,
  getLatestFeatureMappingSummary,
  listFeatureInventory,
  readFeatureInventoryRecord,
  readFeatureStudyRun,
  updateFeatureInventoryRecord,
  updateFeatureStudyRun,
  upsertFeatureInventoryRecord,
  upsertFeatureMappingSummary,
} from "@/lib/feature-store";
import { generateGeminiJson } from "@/lib/gemini";
import { getGitHubRepositoryFileText } from "@/lib/github";
import { getLatestRepoStudyRun } from "@/lib/repo-study-store";

const featureDiscoveryItemSchema = z.object({
  canonicalName: z.string().min(1),
  summary: z.string().min(1),
  tags: z.unknown().optional(),
  sourceEvidence: z.unknown().optional(),
  priority: z.string().optional(),
  confidence: z.string().optional(),
});

const featureDiscoverySchema = z
  .union([
    z.object({
      features: z.array(featureDiscoveryItemSchema).min(3).max(12),
    }),
    z.array(featureDiscoveryItemSchema).min(3).max(12),
  ])
  .transform((value) => (Array.isArray(value) ? { features: value } : value));

type FeatureStudyIterationDeltaInput = {
  guidanceApplied: string[];
  changedUnderstanding: string[];
  strengthenedAreas: string[];
  remainingUncertainty: string[];
};

type FeatureStudyUnderstandingInput = {
  summary: string;
  featureDefinition: string[];
  userValue: string[];
  workflows: string[];
  workflowNarrative: string[];
  existingBehavior: string[];
  relevantPaths: string[];
  coreTouchpoints: string[];
  importantData: string[];
  aiInvolvement: string[];
  dependencies: string[];
  distinctiveBehaviors: string[];
  architectureNotes: string[];
  migrationInterpretation: string[];
  rebuildImplications: string[];
  confidenceAssessment: string[];
  confidenceNotes: string[];
  openQuestions: string[];
};

const looseFeatureInvestigationPlanSchema = z.object({
  centralPaths: z.unknown().optional(),
  supportingPaths: z.unknown().optional(),
  investigationGoals: z.unknown().optional(),
  adjacentSystems: z.unknown().optional(),
});

const looseFeatureStudySchema = z.object({
  understanding: z.unknown().optional(),
  strategicImportance: z.unknown().optional(),
  highConfidenceAreas: z.unknown().optional(),
  weakConfidenceAreas: z.unknown().optional(),
  operatorQuestions: z.unknown().optional(),
  iterationDelta: z.unknown().optional(),
  summary: z.unknown().optional(),
  userValue: z.unknown().optional(),
  workflows: z.unknown().optional(),
  featureDefinition: z.unknown().optional(),
  workflowNarrative: z.unknown().optional(),
  existingBehavior: z.unknown().optional(),
  relevantPaths: z.unknown().optional(),
  coreTouchpoints: z.unknown().optional(),
  importantData: z.unknown().optional(),
  aiInvolvement: z.unknown().optional(),
  dependencies: z.unknown().optional(),
  distinctiveBehaviors: z.unknown().optional(),
  architectureNotes: z.unknown().optional(),
  migrationInterpretation: z.unknown().optional(),
  rebuildImplications: z.unknown().optional(),
  confidenceAssessment: z.unknown().optional(),
  confidenceNotes: z.unknown().optional(),
  openQuestions: z.unknown().optional(),
});

const featureMappingSchema = z.object({
  summary: z.string().min(1),
  sourceBehavior: z.array(z.string().min(1)).min(2).max(8),
  existingInTarget: z.array(z.string().min(1)).max(8),
  partialInTarget: z.array(z.string().min(1)).max(8),
  missingInTarget: z.array(z.string().min(1)).max(8),
  governingPatterns: z.array(z.string().min(1)).min(2).max(8),
  doctrineConstraints: z.array(z.string().min(1)).max(8),
  openQuestions: z.array(z.string().min(1)).max(8),
  recommendedNextSteps: z.array(z.string().min(1)).min(2).max(8),
  confidenceNotes: z.array(z.string().min(1)).min(1).max(6),
});

const looseFeatureMappingSchema = z.object({
  summary: z.unknown().optional(),
  sourceBehavior: z.unknown().optional(),
  existingInTarget: z.unknown().optional(),
  partialInTarget: z.unknown().optional(),
  missingInTarget: z.unknown().optional(),
  governingPatterns: z.unknown().optional(),
  doctrineConstraints: z.unknown().optional(),
  openQuestions: z.unknown().optional(),
  recommendedNextSteps: z.unknown().optional(),
  confidenceNotes: z.unknown().optional(),
});

function normalizeText(value: string) {
  return value.replace(/[*_`#]+/g, "").replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueItems(items: string[], limit: number) {
  return [...new Set(items.map(normalizeText).filter(Boolean))].slice(0, limit);
}

function splitStringItems(value: string) {
  return value
    .split(/\r?\n|[•●▪■]|\s+-\s+/)
    .map((entry) => normalizeText(entry.replace(/^(?:\d+\.|[-*])\s*/, "")))
    .filter(Boolean);
}

function toListItems(value: unknown): string[] {
  if (typeof value === "string") {
    return splitStringItems(value);
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => toListItems(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const lead = [record.title, record.name, record.question, record.path, record.area]
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => normalizeText(entry))[0];
    const detail = [record.summary, record.description, record.note, record.rationale, record.value]
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => normalizeText(entry))[0];

    if (lead && detail && lead !== detail) {
      return [`${lead}: ${detail}`];
    }

    if (lead) {
      return [lead];
    }

    if (detail) {
      return [detail];
    }
  }

  return [];
}

function takeBounded(section: string, items: unknown, minimum: number, maximum: number, fallback: string[] = []) {
  const normalized = [...toListItems(items), ...fallback];
  const unique = uniqueItems(normalized, maximum);

  if (unique.length < minimum) {
    throw new Error(`Feature study generation returned too few items for ${section} (needed ${minimum}).`);
  }

  return unique;
}

function trimPromptData<T>(value: T) {
  return JSON.stringify(value, null, 2);
}

function formatRole(role: RepositoryRecord["role"]) {
  return role === "Source" ? "Repo 1" : "Repo 2";
}

function normalizeDiscoveryScale(value: string | undefined) {
  const normalized = normalizeText(value ?? "").toLowerCase();

  if (normalized === "high") {
    return "High" as const;
  }

  if (normalized === "low") {
    return "Low" as const;
  }

  return "Medium" as const;
}

function normalizeFeatureDiscoveryItem(item: z.infer<typeof featureDiscoveryItemSchema>) {
  const canonicalName = normalizeText(item.canonicalName);

  return {
    canonicalName,
    summary: normalizeText(item.summary),
    tags: uniqueItems(toListItems(item.tags), 6).length > 0
      ? uniqueItems(toListItems(item.tags), 6)
      : uniqueItems([canonicalName, "migration-topic"], 6),
    sourceEvidence: uniqueItems(toListItems(item.sourceEvidence), 6).length > 0
      ? uniqueItems(toListItems(item.sourceEvidence), 6)
      : [`Grounded in the Repo 1 study synthesis for ${canonicalName}.`],
    priority: normalizeDiscoveryScale(item.priority),
    confidence: normalizeDiscoveryScale(item.confidence),
  };
}

function getRepositoryForRole(project: ProjectRecord, role: RepositoryRecord["role"]) {
  const repository = project.repositories.find((entry) => entry.role === role);

  if (!repository) {
    throw new Error(`${formatRole(role)} is not configured for this project.`);
  }

  return repository;
}

async function getGroundingRepoStudy(project: ProjectRecord, repository: RepositoryRecord) {
  const run = await getLatestRepoStudyRun(project.id, repository.id);

  if (!run || run.status !== "Complete" || !run.understanding || !run.artifact) {
    throw new Error(`${formatRole(repository.role)} needs a completed repo study before feature intelligence can use it.`);
  }

  return run;
}

type FeatureInvestigationCandidate = {
  path: string;
  category: string;
  score: number;
  reasons: string[];
};

type FeatureInvestigationPlan = {
  centralPaths: string[];
  supportingPaths: string[];
  investigationGoals: string[];
  adjacentSystems: string[];
};

type FeatureInvestigationExcerpt = {
  path: string;
  category: string;
  score: number;
  reasons: string[];
  excerpt: string;
};

const FEATURE_STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "then", "them", "they", "have", "uses", "using",
  "user", "users", "feature", "topic", "study", "repo", "v1", "v2", "curriculum", "content", "system", "module",
]);

function tokenizeFeatureTerms(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !FEATURE_STOP_WORDS.has(token));
}

function extractPathHints(items: string[]) {
  const matches = items.flatMap((item) => item.match(/[A-Za-z0-9_.()/-]+\/[A-Za-z0-9_.()/-]+(?:\.[A-Za-z0-9]+)?/g) ?? []);
  return uniqueItems(matches, 10);
}

function collectFeatureTerms(
  feature: FeatureInventoryRecord,
  parentRun: FeatureStudyRunRecord | null,
  activeGuidance: string[] = [],
) {
  return uniqueItems([
    ...tokenizeFeatureTerms(feature.canonicalName),
    ...tokenizeFeatureTerms(feature.summary),
    ...feature.tags.flatMap((tag) => tokenizeFeatureTerms(tag)),
    ...feature.sourceEvidence.flatMap((item) => tokenizeFeatureTerms(item)),
    ...activeGuidance.flatMap((entry) => tokenizeFeatureTerms(entry)),
  ], 24);
}

function getActiveFeatureStudyGuidance(parentRun: FeatureStudyRunRecord | null, initialGuidance?: string) {
  const guidance = normalizeText(initialGuidance ?? "");

  return uniqueItems([
    ...(parentRun?.operatorGuidance ?? []).map((entry) => entry.guidance),
    ...(guidance ? [guidance] : []),
  ], 6);
}

function createFeatureStudyGuidanceEntry(author: string, guidance: string): RepoStudyOperatorGuidanceEntry {
  return {
    id: `feature-guidance-${Date.now()}`,
    createdAt: new Date().toISOString(),
    author,
    guidance: normalizeText(guidance),
  };
}

function classifyFeaturePath(artifact: RepositoryAnalysisArtifact, path: string) {
  if (artifact.routeFiles.includes(path)) {
    return "route";
  }

  if (artifact.aiFiles.includes(path)) {
    return "ai";
  }

  if (artifact.workflowFiles.includes(path)) {
    return "workflow";
  }

  if (artifact.modelFiles.includes(path)) {
    return "model";
  }

  if (artifact.componentFiles.includes(path)) {
    return "component";
  }

  if (artifact.configFiles.includes(path)) {
    return "config";
  }

  return "file";
}

function scoreFeatureCandidatePath(input: {
  artifact: RepositoryAnalysisArtifact;
  path: string;
  featureTerms: string[];
  pathHints: string[];
}) {
  const lowerPath = input.path.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  const matchedTerms = input.featureTerms.filter((term) => lowerPath.includes(term));

  if (matchedTerms.length > 0) {
    score += Math.min(16, matchedTerms.length * 4);
    reasons.push(`Path matches feature terms: ${matchedTerms.slice(0, 4).join(", ")}.`);
  }

  const hinted = input.pathHints.find((hint) => lowerPath.includes(hint.toLowerCase()));

  if (hinted) {
    score += 14;
    reasons.push(`Path aligns with hinted evidence: ${hinted}.`);
  }

  if (input.artifact.keyFileExcerpts.some((entry) => entry.path === input.path)) {
    score += 8;
    reasons.push("Already surfaced as a key repo-study excerpt.");
  }

  const category = classifyFeaturePath(input.artifact, input.path);
  const categoryBonus: Record<string, number> = {
    route: 7,
    ai: 7,
    workflow: 6,
    model: 5,
    component: 4,
    config: 3,
    file: 1,
  };

  score += categoryBonus[category] ?? 1;
  reasons.push(`${category} file category contributes investigation value.`);

  return {
    path: input.path,
    category,
    score,
    reasons: uniqueItems(reasons, 4),
  } satisfies FeatureInvestigationCandidate;
}

function collectFeatureInvestigationCandidates(
  artifact: RepositoryAnalysisArtifact,
  featureTerms: string[],
  pathHints: string[],
) {
  const candidatePool = uniqueItems([
    ...artifact.keyFileExcerpts.map((entry) => entry.path),
    ...artifact.routeFiles,
    ...artifact.componentFiles,
    ...artifact.modelFiles,
    ...artifact.aiFiles,
    ...artifact.workflowFiles,
    ...artifact.configFiles,
    ...artifact.allFilePaths.filter((path) => {
      const lowerPath = path.toLowerCase();
      return featureTerms.some((term) => lowerPath.includes(term)) || pathHints.some((hint) => lowerPath.includes(hint.toLowerCase()));
    }),
  ], 80);

  return candidatePool
    .map((path) => scoreFeatureCandidatePath({ artifact, path, featureTerms, pathHints }))
    .filter((candidate) => candidate.score >= 4)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
}

function resolveFeaturePlanPaths(value: unknown, candidates: FeatureInvestigationCandidate[]) {
  const requested = uniqueItems(toListItems(value), 10);
  const resolved: string[] = [];

  for (const item of requested) {
    const normalized = item.toLowerCase();
    const exact = candidates.find((candidate) => candidate.path.toLowerCase() === normalized);

    if (exact) {
      resolved.push(exact.path);
      continue;
    }

    const partial = candidates.find((candidate) => candidate.path.toLowerCase().includes(normalized));

    if (partial) {
      resolved.push(partial.path);
    }
  }

  return uniqueItems(resolved, 10);
}

async function runFeatureInvestigationPlan(input: {
  feature: FeatureInventoryRecord;
  repository: RepositoryRecord;
  repoStudy: RepoStudyRunRecord;
  parentRun: FeatureStudyRunRecord | null;
  activeGuidance: string[];
  featureTerms: string[];
  pathHints: string[];
}) {
  const candidates = collectFeatureInvestigationCandidates(input.repoStudy.artifact as RepositoryAnalysisArtifact, input.featureTerms, input.pathHints);
  const fallbackCentral = candidates.slice(0, 8).map((candidate) => candidate.path);
  const fallbackSupporting = candidates.slice(8, 16).map((candidate) => candidate.path);
  const prompt = [
    `You are planning a bounded feature investigation for ${input.feature.canonicalName} in ${input.repository.name}.`,
    `Repository role: ${formatRole(input.repository.role)}`,
    "Choose the central files and the surrounding supporting files that should be read to understand this feature deeply.",
    "Favor routes, workflows, AI paths, models, and implementation surfaces that make the feature real.",
    "Return JSON with only: centralPaths, supportingPaths, investigationGoals, adjacentSystems.",
    "Feature record:",
    trimPromptData(input.feature),
    "Relevant repo-study grounding:",
    trimPromptData({
      summary: input.repoStudy.understanding?.summary,
      capabilities: input.repoStudy.understanding?.capabilities,
      coreWorkflows: input.repoStudy.understanding?.coreWorkflows,
      importantEntities: input.repoStudy.understanding?.importantEntities,
      architectureShape: input.repoStudy.understanding?.architectureShape,
      groundingReferences: input.repoStudy.understanding?.groundingReferences,
    }),
    input.parentRun
      ? "Prior feature-study context:"
      : "No prior feature-study context.",
    input.parentRun
      ? trimPromptData({
          priorSummary: input.parentRun.understanding?.summary,
          priorRelevantPaths: input.parentRun.understanding?.relevantPaths,
          priorOpenQuestions: input.parentRun.understanding?.openQuestions,
          operatorGuidance: input.activeGuidance,
        })
      : "",
    "Candidate paths:",
    trimPromptData(candidates.map((candidate) => ({
      path: candidate.path,
      category: candidate.category,
      score: candidate.score,
      reasons: candidate.reasons,
    }))),
  ].join("\n\n");

  const rawPlan = await generateGeminiJson({ prompt, schema: looseFeatureInvestigationPlanSchema });

  return {
    centralPaths: resolveFeaturePlanPaths(rawPlan.centralPaths, candidates).length > 0
      ? resolveFeaturePlanPaths(rawPlan.centralPaths, candidates)
      : fallbackCentral,
    supportingPaths: resolveFeaturePlanPaths(rawPlan.supportingPaths, candidates).length > 0
      ? resolveFeaturePlanPaths(rawPlan.supportingPaths, candidates)
      : fallbackSupporting,
    investigationGoals: takeBounded("investigationGoals", rawPlan.investigationGoals, 2, 6, [
      `Reconstruct how ${input.feature.canonicalName} actually works in ${input.repository.name}.`,
      `Separate true product value from legacy implementation detail for migration planning.`,
    ]),
    adjacentSystems: takeBounded("adjacentSystems", rawPlan.adjacentSystems, 2, 8, [
      `${input.feature.canonicalName} likely depends on adjacent routes, content structures, and operator flows in ${input.repository.name}.`,
      `${input.feature.canonicalName} should be understood relative to nearby AI, model, and workflow surfaces.`,
    ]),
  } satisfies FeatureInvestigationPlan;
}

function buildFeatureExcerpt(content: string, featureTerms: string[]) {
  const lines = content.split(/\r?\n/);
  const lowerTerms = featureTerms.map((term) => term.toLowerCase());
  const matchIndex = lines.findIndex((line) => lowerTerms.some((term) => line.toLowerCase().includes(term)));
  const start = Math.max(0, (matchIndex >= 0 ? matchIndex : 0) - 4);
  const end = Math.min(lines.length, start + 36);

  return lines.slice(start, end).join("\n").slice(0, 3200);
}

async function fetchFeatureInvestigationExcerpts(input: {
  repository: RepositoryRecord;
  repoStudy: RepoStudyRunRecord;
  plan: FeatureInvestigationPlan;
  featureTerms: string[];
}) {
  const plannedPaths = uniqueItems([...input.plan.centralPaths, ...input.plan.supportingPaths], 16);
  const candidates = collectFeatureInvestigationCandidates(input.repoStudy.artifact as RepositoryAnalysisArtifact, input.featureTerms, plannedPaths);
  const byPath = new Map(candidates.map((candidate) => [candidate.path, candidate]));
  const files = await Promise.all(
    plannedPaths.map(async (path) => {
      let content: string | null = null;

      try {
        content = await getGitHubRepositoryFileText(input.repository.url, path, input.repoStudy.artifact?.defaultBranch);
      } catch {
        return null;
      }

      if (!content) {
        return null;
      }

      const candidate = byPath.get(path);

      return {
        path,
        category: candidate?.category ?? classifyFeaturePath(input.repoStudy.artifact as RepositoryAnalysisArtifact, path),
        score: candidate?.score ?? 0,
        reasons: candidate?.reasons ?? [],
        excerpt: buildFeatureExcerpt(content, input.featureTerms),
      } satisfies FeatureInvestigationExcerpt;
    }),
  );

  return files.filter((entry): entry is FeatureInvestigationExcerpt => Boolean(entry));
}

function buildDiscoveryPrompt(project: ProjectRecord, sourceStudy: RepoStudyRunRecord) {
  return [
    "You are identifying first-class product features from a deeply studied legacy source repository.",
    "Return only meaningful migration feature topics, not technical chores, generic architecture buckets, or low-level implementation details.",
    "Each feature should represent a coherent user/business capability that could later be studied, mapped, and proposed independently.",
    "",
    `Project: ${project.name}`,
    `Mission: ${project.mission}`,
    `Source repository: ${sourceStudy.repositoryName}`,
    "",
    "Repo 1 study understanding:",
    trimPromptData({
      summary: sourceStudy.understanding?.summary,
      purpose: sourceStudy.understanding?.purpose,
      capabilities: sourceStudy.understanding?.capabilities,
      coreWorkflows: sourceStudy.understanding?.coreWorkflows,
      importantEntities: sourceStudy.understanding?.importantEntities,
      nextStageGuidance: sourceStudy.understanding?.nextStageGuidance,
      groundingReferences: sourceStudy.understanding?.groundingReferences,
    }),
    "",
    "Repo 1 structural grounding:",
    trimPromptData({
      importantDirectories: sourceStudy.artifact?.importantDirectories.slice(0, 12),
      routeFiles: sourceStudy.artifact?.routeFiles.slice(0, 20),
      componentFiles: sourceStudy.artifact?.componentFiles.slice(0, 20),
      modelFiles: sourceStudy.artifact?.modelFiles.slice(0, 20),
      workflowFiles: sourceStudy.artifact?.workflowFiles.slice(0, 20),
      keyFileExcerpts: sourceStudy.artifact?.keyFileExcerpts.slice(0, 10),
    }),
    "",
    "Output requirements:",
    "- 4 to 10 features",
    "- canonicalName should be operator-friendly and concise",
    "- summary should explain why this is a real migration topic",
    "- tags should be compact topical labels",
    "- sourceEvidence should reference specific repo-study findings, files, or workflows",
    "- priority reflects migration importance",
    "- confidence reflects how clearly the feature is grounded in the repo study",
  ].join("\n");
}

function buildStudyPrompt(input: {
  project: ProjectRecord;
  feature: FeatureInventoryRecord;
  repository: RepositoryRecord;
  repoStudy: RepoStudyRunRecord;
  parentRun: FeatureStudyRunRecord | null;
  activeGuidance: string[];
  investigationPlan: FeatureInvestigationPlan;
  investigationExcerpts: FeatureInvestigationExcerpt[];
}) {
  return [
    `You are producing a deep ${formatRole(input.repository.role)} feature investigation for migration planning.`,
    "Act like a product architect plus technical analyst. Investigate the feature using the selected evidence, not generic repo summarization.",
    "The study must explain what the feature really is, where it lives, how it works, what data and AI behaviors matter, what adjacent systems it depends on, and what migration interpretation is grounded by the evidence.",
    "",
    `Project: ${input.project.name}`,
    `Mission: ${input.project.mission}`,
    `Repository: ${input.repository.name}`,
    `Repository role: ${formatRole(input.repository.role)}`,
    "",
    "Feature inventory record:",
    trimPromptData(input.feature),
    "",
    `${formatRole(input.repository.role)} repo study grounding:`,
    trimPromptData({
      summary: input.repoStudy.understanding?.summary,
      capabilities: input.repoStudy.understanding?.capabilities,
      coreWorkflows: input.repoStudy.understanding?.coreWorkflows,
      importantEntities: input.repoStudy.understanding?.importantEntities,
      architectureShape: input.repoStudy.understanding?.architectureShape,
      migrationRisks: input.repoStudy.understanding?.migrationRisks,
      groundingReferences: input.repoStudy.understanding?.groundingReferences,
      routeFiles: input.repoStudy.artifact?.routeFiles.slice(0, 20),
      componentFiles: input.repoStudy.artifact?.componentFiles.slice(0, 20),
      modelFiles: input.repoStudy.artifact?.modelFiles.slice(0, 20),
      workflowFiles: input.repoStudy.artifact?.workflowFiles.slice(0, 20),
      keyFileExcerpts: input.repoStudy.artifact?.keyFileExcerpts.slice(0, 8),
    }),
    "",
    "Feature investigation plan:",
    trimPromptData(input.investigationPlan),
    "",
    "Fetched investigation excerpts:",
    trimPromptData(input.investigationExcerpts.map((entry) => ({
      path: entry.path,
      category: entry.category,
      score: entry.score,
      reasons: entry.reasons,
      excerpt: entry.excerpt,
    }))),
    "",
    input.parentRun
      ? "Prior feature-study context to continue from:"
      : "No prior feature-study run exists for this repository-role pair.",
    input.parentRun
      ? trimPromptData({
        priorSummary: input.parentRun.understanding?.summary,
        priorRelevantPaths: input.parentRun.understanding?.relevantPaths,
        priorOpenQuestions: input.parentRun.understanding?.openQuestions,
        operatorGuidance: input.activeGuidance,
      })
      : "",
    "",
    "Output requirements:",
    "- featureDefinition should explain what the feature really is",
    "- userValue should explain who benefits and why the feature matters",
    "- workflows and workflowNarrative should reconstruct how the feature operates in practice",
    "- coreTouchpoints should distinguish central implementation surfaces from supporting adjacent ones",
    "- importantData should identify important records, models, IDs, content structures, configs, or assets",
    "- aiInvolvement should describe where AI generation, transformation, differentiation, scoring, or prompt flows appear",
    "- dependencies should describe adjacent systems or cross-cutting dependencies",
    "- distinctiveBehaviors should explain what makes the feature strategically distinct",
    "- migrationInterpretation and rebuildImplications should separate must-preserve product value from legacy baggage",
    "- confidenceAssessment and confidenceNotes must be earned from evidence coverage, central file inspection, and unresolved ambiguity",
    "- relevantPaths should be specific files/directories from the investigation when possible",
    "- operatorQuestions should only include real unresolved issues that would improve future passes",
    "- iterationDelta should be null for a first pass without parent context",
    "- summary should be a compact set of operator-facing bullets",
  ].join("\n");
}

function buildMappingPrompt(input: {
  project: ProjectRecord;
  feature: FeatureInventoryRecord;
  sourceRun: FeatureStudyRunRecord;
  targetRun: FeatureStudyRunRecord;
}) {
  return [
    "You are comparing a source feature study with a target feature study to produce a migration mapping summary.",
    "Focus on what exists, what partially exists, what is missing, and what constraints should govern future proposal work.",
    "",
    `Project: ${input.project.name}`,
    `Mission: ${input.project.mission}`,
    `Feature: ${input.feature.canonicalName}`,
    "",
    "Doctrine context:",
    trimPromptData({
      doctrineSummary: input.project.doctrine.summary,
      approvalState: input.project.doctrine.approvalState,
      criticalRules: input.project.doctrine.criticalRules,
      antiPatterns: input.project.doctrine.antiPatterns,
    }),
    "",
    "Repo 1 feature study:",
    trimPromptData(input.sourceRun.understanding),
    "",
    "Repo 2 feature study:",
    trimPromptData(input.targetRun.understanding),
    "",
    "Output requirements:",
    "- existingInTarget should only include behavior clearly present already",
    "- partialInTarget should capture partial fit or adjacent capability",
    "- missingInTarget should capture meaningful gaps to close",
    "- governingPatterns should describe V2-native constraints or architecture patterns",
    "- doctrineConstraints should convert approved or draft doctrine into clear planning constraints",
  ].join("\n");
}

function buildOperatorQuestion(question: {
  question: string;
  rationale: string;
  priority: "High" | "Medium";
  relatedAreas: string[];
},
index: number,
runId: string,
): RepoStudyOperatorQuestion {
  return {
    id: `${runId}-question-${index + 1}`,
    question: normalizeText(question.question),
    rationale: normalizeText(question.rationale),
    priority: question.priority,
    relatedAreas: uniqueItems(question.relatedAreas, 6),
  };
}

function normalizeIterationDelta(
  iterationDelta: FeatureStudyIterationDeltaInput | null,
): RepoStudyIterationDelta | null {
  if (!iterationDelta) {
    return null;
  }

  return {
    guidanceApplied: uniqueItems(iterationDelta.guidanceApplied, 6),
    changedUnderstanding: uniqueItems(iterationDelta.changedUnderstanding, 6),
    strengthenedAreas: uniqueItems(iterationDelta.strengthenedAreas, 6),
    remainingUncertainty: uniqueItems(iterationDelta.remainingUncertainty, 6),
  };
}

function normalizeFeatureMappingResult(
  raw: z.infer<typeof looseFeatureMappingSchema>,
  context: {
    featureName: string;
    sourceRun: FeatureStudyRunRecord;
    targetRun: FeatureStudyRunRecord;
  },
) {
  const sourceSummary = context.sourceRun.understanding?.summary ?? `${context.featureName} behavior in Repo 1 has been studied.`;
  const targetSummary = context.targetRun.understanding?.summary ?? `${context.featureName} behavior in Repo 2 has been studied.`;
  const sourceBehavior = takeBounded(
    "sourceBehavior",
    raw.sourceBehavior,
    2,
    8,
    [
      sourceSummary,
      ...(context.sourceRun.understanding?.featureDefinition ?? []),
      ...(context.sourceRun.understanding?.workflows ?? []),
    ],
  );

  return featureMappingSchema.parse({
    summary: typeof raw.summary === "string" && normalizeText(raw.summary)
      ? normalizeText(raw.summary)
      : `${context.featureName} mapping compares Repo 1 behavior against Repo 2 capabilities to define migration gaps and governing constraints.`,
    sourceBehavior,
    existingInTarget: takeBounded(
      "existingInTarget",
      raw.existingInTarget,
      0,
      8,
      [targetSummary],
    ),
    partialInTarget: takeBounded(
      "partialInTarget",
      raw.partialInTarget,
      0,
      8,
      context.targetRun.understanding?.migrationInterpretation ?? [],
    ),
    missingInTarget: takeBounded(
      "missingInTarget",
      raw.missingInTarget,
      0,
      8,
      context.sourceRun.understanding?.rebuildImplications ?? [],
    ),
    governingPatterns: takeBounded(
      "governingPatterns",
      raw.governingPatterns,
      2,
      8,
      [
        ...(context.targetRun.understanding?.architectureNotes ?? []),
        ...(context.targetRun.understanding?.dependencies ?? []),
      ],
    ),
    doctrineConstraints: takeBounded(
      "doctrineConstraints",
      raw.doctrineConstraints,
      0,
      8,
      [],
    ),
    openQuestions: takeBounded(
      "openQuestions",
      raw.openQuestions,
      0,
      8,
      [
        ...(context.sourceRun.understanding?.openQuestions ?? []),
        ...(context.targetRun.understanding?.openQuestions ?? []),
      ],
    ),
    recommendedNextSteps: takeBounded(
      "recommendedNextSteps",
      raw.recommendedNextSteps,
      2,
      8,
      [
        `Design a V2-native implementation shape for ${context.featureName} before execution starts.`,
        `Use Repo 2 patterns and approved doctrine to decide what should be preserved, reinterpreted, or omitted.`,
      ],
    ),
    confidenceNotes: takeBounded(
      "confidenceNotes",
      raw.confidenceNotes,
      1,
      6,
      [
        "Confidence depends on how clearly Repo 1 behavior and Repo 2 analogs were grounded in the feature studies.",
      ],
    ),
  });
}

function normalizeStudyUnderstanding(understanding: FeatureStudyUnderstandingInput): FeatureStudyUnderstanding {
  return {
    summary: normalizeText(understanding.summary),
    featureDefinition: uniqueItems(understanding.featureDefinition, 6),
    userValue: uniqueItems(understanding.userValue, 8),
    workflows: uniqueItems(understanding.workflows, 8),
    workflowNarrative: uniqueItems(understanding.workflowNarrative, 8),
    existingBehavior: uniqueItems(understanding.existingBehavior, 10),
    relevantPaths: uniqueItems(understanding.relevantPaths, 10),
    coreTouchpoints: uniqueItems(understanding.coreTouchpoints, 10),
    importantData: uniqueItems(understanding.importantData, 8),
    aiInvolvement: uniqueItems(understanding.aiInvolvement, 8),
    dependencies: uniqueItems(understanding.dependencies, 8),
    distinctiveBehaviors: uniqueItems(understanding.distinctiveBehaviors, 8),
    architectureNotes: uniqueItems(understanding.architectureNotes, 8),
    migrationInterpretation: uniqueItems(understanding.migrationInterpretation, 8),
    rebuildImplications: uniqueItems(understanding.rebuildImplications, 8),
    confidenceAssessment: uniqueItems(understanding.confidenceAssessment, 8),
    confidenceNotes: uniqueItems(understanding.confidenceNotes, 6),
    openQuestions: uniqueItems(understanding.openQuestions, 8),
  };
}

function normalizeOperatorQuestions(
  value: unknown,
  featureName: string,
): Array<{
  question: string;
  rationale: string;
  priority: "High" | "Medium";
  relatedAreas: string[];
}> {
  if (!Array.isArray(value)) {
    return [] as Array<{
      question: string;
      rationale: string;
      priority: "High" | "Medium";
      relatedAreas: string[];
    }>;
  }

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const question = normalizeText(entry);

      if (!question) {
        return [];
      }

      return [{
        question,
        rationale: `Clarifying this point would improve confidence in the ${featureName} feature study.`,
        priority: "Medium" as const,
        relatedAreas: [],
      }];
    }

    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const question = typeof record.question === "string"
        ? normalizeText(record.question)
        : typeof record.title === "string"
          ? normalizeText(record.title)
          : "";

      if (!question) {
        return [];
      }

      const rationale = typeof record.rationale === "string"
        ? normalizeText(record.rationale)
        : `Clarifying this point would improve confidence in the ${featureName} feature study.`;
      const priority: "High" | "Medium" = typeof record.priority === "string" && record.priority.trim().toLowerCase() === "high"
        ? "High"
        : "Medium";
      const relatedAreas = uniqueItems(toListItems(record.relatedAreas ?? record.areas), 6);

      return [{ question, rationale, priority, relatedAreas }];
    }

    return [];
  }).slice(0, 6);
}

function normalizeFeatureStudyResult(
  value: z.infer<typeof looseFeatureStudySchema>,
  input: {
    featureName: string;
    repositoryName: string;
    parentRun: FeatureStudyRunRecord | null;
    investigationPlan: FeatureInvestigationPlan;
    investigationExcerpts: FeatureInvestigationExcerpt[];
  },
) {
  const understandingRecord = value.understanding && typeof value.understanding === "object"
    ? (value.understanding as Record<string, unknown>)
    : {};
  const centralPaths = input.investigationPlan.centralPaths;
  const supportingPaths = input.investigationPlan.supportingPaths;
  const excerptPaths = input.investigationExcerpts.map((entry) => entry.path);
  const aiEvidence = input.investigationExcerpts.filter((entry) => entry.category === "ai");
  const modelEvidence = input.investigationExcerpts.filter((entry) => entry.category === "model" || entry.category === "config");
  const workflowEvidence = input.investigationExcerpts.filter((entry) => ["route", "workflow", "component"].includes(entry.category));
  const confidenceFallback = [
    `The study inspected ${input.investigationExcerpts.length} fetched file excerpts after planning central and supporting paths.`,
    centralPaths.length > 0
      ? `Confidence is strongest around central surfaces such as ${centralPaths.slice(0, 3).join(", ")}.`
      : `Confidence is limited because no central paths were clearly isolated for ${input.featureName}.`,
    supportingPaths.length > 0
      ? `Supporting evidence came from adjacent surfaces including ${supportingPaths.slice(0, 3).join(", ")}.`
      : `Adjacent-system coverage remains thin for ${input.featureName}.`,
  ];
  const understanding: FeatureStudyUnderstanding = normalizeStudyUnderstanding({
    summary: normalizeText(
      typeof understandingRecord.summary === "string"
        ? understandingRecord.summary
        : `Deep ${input.repositoryName} investigation for ${input.featureName}.`,
    ),
    featureDefinition: takeBounded("understanding.featureDefinition", understandingRecord.featureDefinition ?? value.featureDefinition, 2, 6, [
      `${input.featureName} is a real product capability inside ${input.repositoryName}, not just a generic page or low-level route.`,
      `${input.featureName} should be understood through its workflow, touchpoints, and surrounding system relationships.`,
    ]),
    userValue: takeBounded("understanding.userValue", understandingRecord.userValue ?? value.userValue, 2, 8, [
      `${input.featureName} appears to represent real user or operator value that should be preserved during migration.`,
      `${input.featureName} should be translated into V2-native behavior rather than copied literally.`,
    ]),
    workflows: takeBounded("understanding.workflows", understandingRecord.workflows ?? value.workflows, 2, 8, [
      `${input.featureName} likely spans a concrete user or operator workflow in ${input.repositoryName}.`,
      `This feature should be understood through entrypoints, state changes, and expected outcomes.`,
    ]),
    workflowNarrative: takeBounded("understanding.workflowNarrative", understandingRecord.workflowNarrative ?? value.workflowNarrative, 2, 8, [
      workflowEvidence.length > 0
        ? `Key workflow evidence appears in ${workflowEvidence.slice(0, 3).map((entry) => entry.path).join(", ")}.`
        : `${input.featureName} still needs stronger workflow reconstruction from routes, components, or workflow files.`,
      `Completion should be expressed in terms of actions, state changes, outputs, and feature outcomes.`,
    ]),
    existingBehavior: takeBounded("understanding.existingBehavior", understandingRecord.existingBehavior ?? value.existingBehavior, 2, 10, [
      `${input.featureName} has grounded behavior in the studied repository.`,
      `The study should preserve actual behavior and constraints, not only labels or screen names.`,
    ]),
    relevantPaths: takeBounded("understanding.relevantPaths", understandingRecord.relevantPaths ?? value.relevantPaths, 1, 10, [
      ...excerptPaths.slice(0, 6),
      ...centralPaths.slice(0, 4),
    ]),
    coreTouchpoints: takeBounded("understanding.coreTouchpoints", understandingRecord.coreTouchpoints ?? value.coreTouchpoints, 3, 10, [
      ...centralPaths.slice(0, 6).map((path) => `Central path: ${path}`),
      ...supportingPaths.slice(0, 4).map((path) => `Supporting path: ${path}`),
    ]),
    importantData: takeBounded("understanding.importantData", understandingRecord.importantData ?? value.importantData, 2, 8, [
      ...modelEvidence.slice(0, 4).map((entry) => `Data or configuration surface: ${entry.path}`),
      `${input.featureName} likely depends on content, records, or configuration that should be preserved semantically during migration.`,
    ]),
    aiInvolvement: takeBounded("understanding.aiInvolvement", understandingRecord.aiInvolvement ?? value.aiInvolvement, 1, 8, [
      aiEvidence.length > 0
        ? `Possible AI-relevant implementation appears in ${aiEvidence.slice(0, 4).map((entry) => entry.path).join(", ")}.`
        : `No explicit AI-specific files were strongly tied to ${input.featureName}; AI involvement may be indirect or still unclear.`,
    ]),
    dependencies: takeBounded("understanding.dependencies", understandingRecord.dependencies ?? value.dependencies, 2, 8, [
      ...input.investigationPlan.adjacentSystems,
      `${input.featureName} depends on adjacent systems beyond a single route or page.`,
    ]),
    distinctiveBehaviors: takeBounded("understanding.distinctiveBehaviors", understandingRecord.distinctiveBehaviors ?? value.distinctiveBehaviors, 2, 8, [
      `${input.featureName} appears to be more than a generic screen because it draws on specific workflow and implementation surfaces.`,
      `${input.featureName} should be differentiated by what it uniquely enables or orchestrates.`,
    ]),
    architectureNotes: takeBounded("understanding.architectureNotes", understandingRecord.architectureNotes ?? value.architectureNotes, 2, 8, [
      `${input.featureName} needs to be mapped through the repository's existing architectural boundaries.`,
      `Feature behavior should be understood in terms of domain entities, workflows, and integration points.`,
    ]),
    migrationInterpretation: takeBounded("understanding.migrationInterpretation", understandingRecord.migrationInterpretation ?? value.migrationInterpretation, 2, 8, [
      `${input.featureName} should preserve workflow outcomes and product capability, not incidental legacy structure.`,
      `Migration should reinterpret ${input.featureName} through V2-native patterns instead of copying central files literally.`,
    ]),
    rebuildImplications: takeBounded("understanding.rebuildImplications", understandingRecord.rebuildImplications ?? value.rebuildImplications, 2, 8, [
      `${input.featureName} should be rebuilt in a V2-native shape instead of mirroring legacy implementation details.`,
      `This feature likely needs a scoped migration plan grounded in real behavior and constraints.`,
    ]),
    confidenceAssessment: takeBounded("understanding.confidenceAssessment", understandingRecord.confidenceAssessment ?? value.confidenceAssessment, 2, 8, confidenceFallback),
    confidenceNotes: takeBounded("understanding.confidenceNotes", understandingRecord.confidenceNotes ?? value.confidenceNotes, 1, 6, [
      ...confidenceFallback,
      `This feature study still depends on bounded investigation rather than exhaustive repository-wide file reading.`,
    ]),
    openQuestions: uniqueItems(toListItems(understandingRecord.openQuestions ?? value.openQuestions), 8),
  });

  const strategicImportance = takeBounded("strategicImportance", value.strategicImportance, 1, 6, [
    `${input.featureName} is important enough to merit explicit migration-level study.`,
  ]);
  const highConfidenceAreas = takeBounded("highConfidenceAreas", value.highConfidenceAreas, 1, 6, [
    `The study identified at least one concrete behavior slice for ${input.featureName}.`,
  ]);
  const weakConfidenceAreas = takeBounded("weakConfidenceAreas", value.weakConfidenceAreas, 1, 6, [
    `Some parts of ${input.featureName} still need clarification or operator correction.`,
  ]);
  const operatorQuestions = normalizeOperatorQuestions(value.operatorQuestions, input.featureName);
  const summary = takeBounded("summary", value.summary, 2, 6, [
    `${input.featureName}: focused ${input.repositoryName} feature study completed.`,
    `${input.featureName}: review workflows, paths, and implications before proposal work.`,
  ]);
  const rawIteration = value.iterationDelta && typeof value.iterationDelta === "object"
    ? (value.iterationDelta as Record<string, unknown>)
    : null;
  const iterationDelta = input.parentRun && rawIteration
    ? normalizeIterationDelta({
      guidanceApplied: uniqueItems(toListItems(rawIteration.guidanceApplied), 6),
      changedUnderstanding: uniqueItems(toListItems(rawIteration.changedUnderstanding), 6),
      strengthenedAreas: uniqueItems(toListItems(rawIteration.strengthenedAreas), 6),
      remainingUncertainty: uniqueItems(toListItems(rawIteration.remainingUncertainty), 6),
    })
    : null;

  return {
    understanding,
    strategicImportance,
    highConfidenceAreas,
    weakConfidenceAreas,
    operatorQuestions,
    iterationDelta,
    summary,
  };
}

export async function discoverProjectFeatures(input: {
  project: ProjectRecord;
  triggeredBy: string;
}) {
  const sourceRepository = getRepositoryForRole(input.project, "Source");
  const sourceStudy = await getGroundingRepoStudy(input.project, sourceRepository);
  const existing = await listFeatureInventory(input.project.id);
  const discovered = await generateGeminiJson({
    prompt: buildDiscoveryPrompt(input.project, sourceStudy),
    schema: featureDiscoverySchema,
  });

  const now = new Date().toISOString();
  const bySlug = new Map(existing.map((record) => [record.slug, record]));
  const records: FeatureInventoryRecord[] = [];

  for (const feature of discovered.features.map((entry) => normalizeFeatureDiscoveryItem(entry))) {
    const slug = slugify(feature.canonicalName);
    const existingRecord = bySlug.get(slug);
    const record: FeatureInventoryRecord = {
      id: existingRecord?.id ?? `feature-${input.project.id}-${slug}`,
      projectId: input.project.id,
      slug,
      canonicalName: normalizeText(feature.canonicalName),
      summary: normalizeText(feature.summary),
      tags: uniqueItems(feature.tags, 6),
      sourceEvidence: uniqueItems(feature.sourceEvidence, 6),
      discoverySource: existingRecord?.discoverySource ?? "AI Discovered",
      suggestedBy: existingRecord?.suggestedBy,
      status: existingRecord?.status ?? "Discovered",
      priority: feature.priority,
      confidence: feature.confidence,
      latestSourceStudyRunId: existingRecord?.latestSourceStudyRunId ?? null,
      latestTargetStudyRunId: existingRecord?.latestTargetStudyRunId ?? null,
      latestMappingSummaryId: existingRecord?.latestMappingSummaryId ?? null,
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertFeatureInventoryRecord(record);
    records.push(record);
  }

  return records;
}

export async function createManualFeature(input: {
  projectId: string;
  canonicalName: string;
  summary: string;
  tags: string[];
  suggestedBy: string;
}) {
  const slug = slugify(input.canonicalName);
  const now = new Date().toISOString();
  const existing = await readFeatureInventoryRecord(input.projectId, `feature-${input.projectId}-${slug}`);

  if (existing) {
    return existing;
  }

  const record: FeatureInventoryRecord = {
    id: `feature-${input.projectId}-${slug}`,
    projectId: input.projectId,
    slug,
    canonicalName: normalizeText(input.canonicalName),
    summary: normalizeText(input.summary),
    tags: uniqueItems(input.tags, 6),
    sourceEvidence: ["Manual operator suggestion."],
    discoverySource: "Manual Suggestion",
    suggestedBy: input.suggestedBy,
    status: "Discovered",
    priority: "Medium",
    confidence: "Medium",
    latestSourceStudyRunId: null,
    latestTargetStudyRunId: null,
    latestMappingSummaryId: null,
    createdAt: now,
    updatedAt: now,
  };

  await upsertFeatureInventoryRecord(record);
  return record;
}

export async function appendOperatorGuidanceToFeatureStudyRun(input: {
  studyRunId: string;
  author: string;
  guidance: string;
}) {
  const entry = createFeatureStudyGuidanceEntry(input.author, input.guidance);

  return updateFeatureStudyRun(input.studyRunId, (run) => ({
    ...run,
    operatorGuidance: [...run.operatorGuidance, entry],
  }));
}

export async function runFeatureStudy(input: {
  project: ProjectRecord;
  featureId: string;
  repositoryRole: RepositoryRecord["role"];
  triggeredBy: string;
  continueFromRunId?: string;
  initialGuidance?: string;
}) {
  const feature = await readFeatureInventoryRecord(input.project.id, input.featureId);

  if (!feature) {
    throw new Error("The requested feature could not be found.");
  }

  const repository = getRepositoryForRole(input.project, input.repositoryRole);
  const repoStudy = await getGroundingRepoStudy(input.project, repository);
  const parentRun = input.continueFromRunId ? await readFeatureStudyRun(input.continueFromRunId) : null;

  if (parentRun && (parentRun.projectId !== input.project.id || parentRun.featureId !== feature.id || parentRun.repositoryRole !== input.repositoryRole)) {
    throw new Error("The requested feature-study continuation does not belong to this feature and repository.");
  }

  if (parentRun && parentRun.status !== "Complete") {
    throw new Error("Only a completed feature study run can be continued.");
  }

  const activeGuidance = getActiveFeatureStudyGuidance(parentRun, input.initialGuidance);
  const newGuidanceEntry = normalizeText(input.initialGuidance ?? "")
    ? createFeatureStudyGuidanceEntry(input.triggeredBy, input.initialGuidance ?? "")
    : null;

  const initialRun = await createFeatureStudyRun({
    projectId: input.project.id,
    featureId: feature.id,
    featureName: feature.canonicalName,
    repositoryId: repository.id,
    repositoryRole: repository.role,
    triggeredBy: input.triggeredBy,
    status: "Studying",
    startedAt: new Date().toISOString(),
    parentRunId: parentRun?.id ?? null,
    groundingRepoStudyRunId: repoStudy.id,
    scopedPaths: parentRun?.scopedPaths ?? [],
    understanding: null,
    strategicImportance: [],
    highConfidenceAreas: [],
    weakConfidenceAreas: [],
    operatorQuestions: [],
    operatorGuidance: newGuidanceEntry
      ? [...(parentRun?.operatorGuidance ?? []), newGuidanceEntry]
      : [...(parentRun?.operatorGuidance ?? [])],
    iterationDelta: null,
    summary: [`${feature.canonicalName}: ${formatRole(repository.role)} feature study started.`],
  });

  try {
    const featureTerms = collectFeatureTerms(feature, parentRun, activeGuidance);
    const pathHints = extractPathHints([
      ...feature.sourceEvidence,
      ...(parentRun?.understanding?.relevantPaths ?? []),
      ...activeGuidance,
    ]);
    const investigationPlan = await runFeatureInvestigationPlan({
      feature,
      repository,
      repoStudy,
      parentRun,
      activeGuidance,
      featureTerms,
      pathHints,
    });
    const investigationExcerpts = await fetchFeatureInvestigationExcerpts({
      repository,
      repoStudy,
      plan: investigationPlan,
      featureTerms,
    });
    const result = await generateGeminiJson({
      prompt: buildStudyPrompt({
        project: input.project,
        feature,
        repository,
        repoStudy,
        parentRun,
        activeGuidance,
        investigationPlan,
        investigationExcerpts,
      }),
      schema: looseFeatureStudySchema,
    });
    const normalizedResult = normalizeFeatureStudyResult(result, {
      featureName: feature.canonicalName,
      repositoryName: repository.name,
      parentRun,
      investigationPlan,
      investigationExcerpts,
    });
    const normalizedUnderstanding = normalizedResult.understanding;
    const completedRun = await updateFeatureStudyRun(initialRun.id, (run) => ({
      ...run,
      status: "Complete",
      completedAt: new Date().toISOString(),
      scopedPaths: normalizedUnderstanding.relevantPaths,
      understanding: normalizedUnderstanding,
      strategicImportance: normalizedResult.strategicImportance,
      highConfidenceAreas: normalizedResult.highConfidenceAreas,
      weakConfidenceAreas: normalizedResult.weakConfidenceAreas,
      operatorQuestions: normalizedResult.operatorQuestions.map((question, index) => buildOperatorQuestion(question, index, run.id)),
      iterationDelta: normalizedResult.iterationDelta,
      understandingError: undefined,
      failureMessage: undefined,
      summary: normalizedResult.summary,
    }));

    if (!completedRun) {
      throw new Error("The feature study run could not be updated.");
    }

    await updateFeatureInventoryRecord(input.project.id, feature.id, (record) => ({
      ...record,
      status:
        input.repositoryRole === "Target"
          ? record.latestSourceStudyRunId
            ? "Studied"
            : "Studying"
          : record.latestTargetStudyRunId
            ? "Studied"
            : "Studying",
      latestSourceStudyRunId: input.repositoryRole === "Source" ? completedRun.id : record.latestSourceStudyRunId,
      latestTargetStudyRunId: input.repositoryRole === "Target" ? completedRun.id : record.latestTargetStudyRunId,
      updatedAt: new Date().toISOString(),
    }));

    const latestRecord = await readFeatureInventoryRecord(input.project.id, feature.id);

    if (latestRecord?.latestSourceStudyRunId && latestRecord.latestTargetStudyRunId) {
      try {
        await refreshFeatureMappingSummary({
          project: input.project,
          featureId: feature.id,
        });
      } catch {
        // Mapping refresh is downstream from study completion and should not fail the study run itself.
      }
    }

    return completedRun;
  } catch (error) {
    return updateFeatureStudyRun(initialRun.id, (run) => ({
      ...run,
      status: "Failed",
      completedAt: new Date().toISOString(),
      understanding: null,
      strategicImportance: [],
      highConfidenceAreas: [],
      weakConfidenceAreas: [],
      operatorQuestions: [],
      iterationDelta: null,
      understandingError: error instanceof Error ? error.message : "Feature study failed.",
      failureMessage: error instanceof Error ? error.message : "Feature study failed.",
      summary: [`${feature.canonicalName}: ${formatRole(repository.role)} feature study failed.`],
    }));
  }
}

export async function refreshFeatureMappingSummary(input: {
  project: ProjectRecord;
  featureId: string;
}) {
  const feature = await readFeatureInventoryRecord(input.project.id, input.featureId);

  if (!feature || !feature.latestSourceStudyRunId || !feature.latestTargetStudyRunId) {
    throw new Error("Both Repo 1 and Repo 2 feature studies must exist before mapping can be generated.");
  }

  const sourceRun = await readFeatureStudyRun(feature.latestSourceStudyRunId);
  const targetRun = await readFeatureStudyRun(feature.latestTargetStudyRunId);

  if (!sourceRun?.understanding || !targetRun?.understanding || sourceRun.status !== "Complete" || targetRun.status !== "Complete") {
    throw new Error("Both feature studies must be complete before mapping can be generated.");
  }

  const latestMapping = await getLatestFeatureMappingSummary(input.project.id, feature.id);
  const rawMapping = await generateGeminiJson({
    prompt: buildMappingPrompt({
      project: input.project,
      feature,
      sourceRun,
      targetRun,
    }),
    schema: looseFeatureMappingSchema,
  });
  const mapping = normalizeFeatureMappingResult(rawMapping, {
    featureName: feature.canonicalName,
    sourceRun,
    targetRun,
  });
  const now = new Date().toISOString();
  const record: FeatureMappingSummaryRecord = {
    id: latestMapping?.id ?? `feature-mapping-${input.project.id}-${feature.id}`,
    projectId: input.project.id,
    featureId: feature.id,
    sourceStudyRunId: sourceRun.id,
    targetStudyRunId: targetRun.id,
    status: "Current",
    createdAt: latestMapping?.createdAt ?? now,
    updatedAt: now,
    summary: normalizeText(mapping.summary),
    sourceBehavior: uniqueItems(mapping.sourceBehavior, 8),
    existingInTarget: uniqueItems(mapping.existingInTarget, 8),
    partialInTarget: uniqueItems(mapping.partialInTarget, 8),
    missingInTarget: uniqueItems(mapping.missingInTarget, 8),
    governingPatterns: uniqueItems(mapping.governingPatterns, 8),
    doctrineConstraints: uniqueItems(mapping.doctrineConstraints, 8),
    openQuestions: uniqueItems(mapping.openQuestions, 8),
    recommendedNextSteps: uniqueItems(mapping.recommendedNextSteps, 8),
    confidenceNotes: uniqueItems(mapping.confidenceNotes, 6),
  };

  await upsertFeatureMappingSummary(record);
  await updateFeatureInventoryRecord(input.project.id, feature.id, (existing) => ({
    ...existing,
    status: "Mapped",
    latestMappingSummaryId: record.id,
    updatedAt: now,
  }));

  return record;
}

export function getFeatureStatusTone(status: FeatureInventoryRecord["status"]) {
  if (["Mapped", "Merged"].includes(status)) {
    return "success" as const;
  }

  if (["Studying", "Building", "Proposed"].includes(status)) {
    return "info" as const;
  }

  if (["Stale"].includes(status)) {
    return "warning" as const;
  }

  return "neutral" as const;
}