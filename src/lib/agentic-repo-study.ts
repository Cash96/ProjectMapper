import { z } from "zod";

import type {
  RepoStudyDeepDiveFinding,
  RepoStudyDeepDiveTarget,
  RepoStudyFocusArea,
  RepoStudyInvestigationRecord,
  RepoStudyIterationDelta,
  RepoStudyOperatorQuestion,
  RepoStudyRunRecord,
  RepoStudyUnderstanding,
  RepositoryAnalysisArtifact,
} from "@/domain/intelligence";
import type { RepositoryRecord } from "@/domain/project-mapper";
import { generateGeminiJson } from "@/lib/gemini";
import { getGitHubRepositoryFileText } from "@/lib/github";
import { generateExhaustiveRepositoryTreeInsights } from "@/lib/repository-tree-study";

const broadScanSchema = z.object({
  summary: z.string().min(1),
  signals: z.array(z.string().min(1)).min(4).max(12),
});

const looseBroadScanSchema = z.object({
  summary: z.string().catch(""),
  signals: z.unknown().optional(),
});

const planSchema = z.object({
  focusAreas: z.array(z.object({
    title: z.string().min(1),
    rationale: z.string().min(1),
    priority: z.enum(["High", "Medium"]),
    pathHints: z.array(z.string().min(1)).min(1).max(6),
  })).min(3).max(6),
  deprioritizedAreas: z.array(z.string().min(1)).min(2).max(8),
});

const loosePlanSchema = z.object({
  focusAreas: z.unknown().optional(),
  deprioritizedAreas: z.unknown().optional(),
});

const looseDeepDiveSchema = z.object({
  findings: z.unknown().optional(),
  openQuestions: z.unknown().optional(),
  recommendedFollowUps: z.unknown().optional(),
  confidenceNotes: z.unknown().optional(),
});

const looseUnderstandingSchema = z.object({
  summary: z.string().catch(""),
  purpose: z.unknown().optional(),
  capabilities: z.unknown().optional(),
  coreWorkflows: z.unknown().optional(),
  importantEntities: z.unknown().optional(),
  integrations: z.unknown().optional(),
  architectureShape: z.unknown().optional(),
  interactionAndDesign: z.unknown().optional(),
  migrationRisks: z.unknown().optional(),
  nextStageGuidance: z.unknown().optional(),
  groundingReferences: z.unknown().optional(),
  confidenceNotes: z.unknown().optional(),
  openQuestions: z.unknown().optional(),
});

const looseGuidedLoopSchema = z.object({
  strategicImportance: z.unknown().optional(),
  highConfidenceAreas: z.unknown().optional(),
  weakConfidenceAreas: z.unknown().optional(),
  operatorQuestions: z.unknown().optional(),
  guidanceApplied: z.unknown().optional(),
  changedUnderstanding: z.unknown().optional(),
  strengthenedAreas: z.unknown().optional(),
  remainingUncertainty: z.unknown().optional(),
});

function normalizeText(value: string) {
  return value.replace(/[*_`#]+/g, "").replace(/\s+/g, " ").trim();
}

function summarizeGuidanceText(value: string) {
  const normalized = normalizeText(value);
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 177).trim()}...`;
}

function normalizeGuidanceAppliedItem(value: string) {
  return summarizeGuidanceText(
    normalizeText(value)
      .replace(/^Previous operator guidance(?:\s*\([^)]*\))?(?:\s+stated)?[:.]?\s*/i, "")
      .replace(/^['"]+|['"]+$/g, ""),
  );
}

function dedupeGuidanceApplied(items: string[], max: number) {
  return [...new Set(items.map((item) => normalizeGuidanceAppliedItem(item)).filter(Boolean))].slice(0, max);
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
    const record = value as Record<string, unknown>;
    const lead = [record.title, record.name, record.pattern, record.goal, record.risk, record.area]
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => normalizeText(entry))[0];
    const detail = [record.summary, record.description, record.note, record.rationale]
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => normalizeText(entry))[0];

    if (lead && detail) {
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

function dedupe(items: string[], max: number) {
  return [...new Set(items.map((item) => normalizeText(item)).filter(Boolean))].slice(0, max);
}

function toSentenceCaseTitle(value: string) {
  return normalizeText(value)
    .split(/[:,-]/)[0]
    .trim()
    .slice(0, 80);
}

function toPriority(value: unknown, fallbackIndex = 0): "High" | "Medium" {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "high" || normalized === "critical") {
      return "High";
    }
  }

  return fallbackIndex < 2 ? "High" : "Medium";
}

function selectMatchingCandidatePaths(hints: string[], candidates: string[], fallback: string[] = []) {
  return dedupe([
    ...resolvePathHints(hints, candidates),
    ...fallback,
  ], 6);
}

function buildFallbackFocusAreas(input: {
  artifact: RepositoryAnalysisArtifact;
  broadScanSignals: string[];
  candidates: string[];
}) {
  const fallbackDefinitions = [
    {
      title: "Application routing and entrypoints",
      rationale: "Review the request-handling entrypoints and primary routing layout to understand how users move through the system.",
      pathHints: [...input.artifact.routeFiles.slice(0, 4), ...input.artifact.configFiles.slice(0, 2)],
      priority: "High" as const,
    },
    {
      title: "Domain models and data behavior",
      rationale: "Inspect domain/data modules to understand core entities, persistence shape, and migration-sensitive business rules.",
      pathHints: [...input.artifact.modelFiles.slice(0, 4), ...input.artifact.workflowFiles.slice(0, 2)],
      priority: "High" as const,
    },
    {
      title: "Operational workflows and integrations",
      rationale: "Inspect workflow and integration code to understand background operations, external dependencies, and cross-cutting behavior.",
      pathHints: [...input.artifact.workflowFiles.slice(0, 4), ...input.artifact.aiFiles.slice(0, 2), ...input.artifact.configFiles.slice(0, 2)],
      priority: "Medium" as const,
    },
    {
      title: "UI and template surfaces",
      rationale: "Inspect user-facing rendering surfaces to capture the operator/user experience and migration-relevant interaction patterns.",
      pathHints: input.artifact.componentFiles.slice(0, 4),
      priority: "Medium" as const,
    },
  ];

  const signalFallbacks = input.broadScanSignals.map((signal, index) => ({
    title: toSentenceCaseTitle(signal) || `Focus area ${index + 1}`,
    rationale: normalizeText(signal),
    pathHints: input.candidates.slice(index * 2, index * 2 + 4),
    priority: toPriority(undefined, index),
  }));

  return [...fallbackDefinitions, ...signalFallbacks]
    .map((area, index) => ({
      title: area.title,
      rationale: area.rationale,
      priority: area.priority,
      pathHints: selectMatchingCandidatePaths(area.pathHints, input.candidates, area.pathHints),
      index,
    }))
    .filter((area) => area.pathHints.length > 0)
    .slice(0, 6)
    .map(({ title, rationale, priority, pathHints }) => ({ title, rationale, priority, pathHints }));
}

function normalizePlanFocusAreas(value: unknown, candidates: string[], fallbackAreas: RepoStudyFocusArea[]) {
  const normalized = Array.isArray(value) ? value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const title = typeof record.title === "string"
      ? normalizeText(record.title)
      : typeof record.name === "string"
        ? normalizeText(record.name)
        : typeof record.area === "string"
          ? normalizeText(record.area)
          : "";
    const rationale = typeof record.rationale === "string"
      ? normalizeText(record.rationale)
      : typeof record.summary === "string"
        ? normalizeText(record.summary)
        : typeof record.description === "string"
          ? normalizeText(record.description)
          : title;
    const pathHints = selectMatchingCandidatePaths(
      toListItems(record.pathHints ?? record.paths ?? record.files ?? record.examples),
      candidates,
      candidates.slice(index * 2, index * 2 + 4),
    );

    if (!title || !rationale || pathHints.length === 0) {
      return [];
    }

    return [{
      title,
      rationale,
      priority: toPriority(record.priority, index),
      pathHints,
    } satisfies RepoStudyFocusArea];
  }) : [];

  return planSchema.shape.focusAreas.parse(
    dedupe(
      [...normalized, ...fallbackAreas].map((area) => `${area.title}|||${area.rationale}|||${area.priority}|||${area.pathHints.join("&&")}`),
      6,
    ).map((entry) => {
      const [title, rationale, priority, pathHints] = entry.split("|||");
      return {
        title,
        rationale,
        priority: priority === "High" ? "High" : "Medium",
        pathHints: pathHints.split("&&").filter(Boolean),
      };
    }),
  );
}

function normalizeDeprioritizedAreas(value: unknown, fallbackAreas: string[]) {
  return planSchema.shape.deprioritizedAreas.parse(
    dedupe([
      ...toListItems(value),
      ...fallbackAreas,
    ], 8),
  );
}

function buildThreadContext(priorRuns: RepoStudyRunRecord[]) {
  if (priorRuns.length === 0) {
    return null;
  }

  return {
    previousRuns: priorRuns.map((run) => ({
      version: run.version,
      summary: run.understanding?.summary ?? run.summary.join(" "),
      strategicImportance: run.strategicImportance,
      highConfidenceAreas: run.highConfidenceAreas,
      weakConfidenceAreas: run.weakConfidenceAreas,
      operatorQuestions: run.operatorQuestions.map((question) => ({
        question: question.question,
        rationale: question.rationale,
        relatedAreas: question.relatedAreas,
      })),
      operatorGuidance: run.operatorGuidance.map((entry) => ({
        author: entry.author,
        guidance: entry.guidance,
      })),
      openQuestions: run.understanding?.openQuestions ?? [],
      confidenceNotes: run.understanding?.confidenceNotes ?? [],
      investigationOpenQuestions: run.investigation?.openQuestions ?? [],
      focusAreas: run.investigation?.focusAreas ?? [],
    })),
  };
}

function getThreadContextBlock(priorRuns: RepoStudyRunRecord[]) {
  const context = buildThreadContext(priorRuns);
  return context ? JSON.stringify(context, null, 2) : null;
}

function collectFallbackOperatorQuestions(input: {
  repository: RepositoryRecord;
  focusAreas: RepoStudyFocusArea[];
  weakConfidenceAreas: string[];
  openQuestions: string[];
}) {
  const focusArea = input.focusAreas[0]?.title ?? (input.repository.role === "Source" ? "legacy workflow intent" : "design-critical Repo 2 behavior");
  const secondFocusArea = input.focusAreas[1]?.title ?? focusArea;
  const weakArea = input.weakConfidenceAreas.find((area) => area.length <= 80 && !area.includes("?"))
    ?? input.focusAreas[2]?.title
    ?? focusArea;

  const sourceFallbacks = [
    {
      question: `Which parts of ${focusArea} represent core RevEd V1 product value versus accidental legacy sprawl?`,
      rationale: "This answer would help separate migration-worthy behavior from implementation noise.",
      priority: "High" as const,
      relatedAreas: [focusArea],
    },
    {
      question: `Are there curriculum partners, district commitments, or mission-critical behaviors hidden behind ${secondFocusArea} that the code alone does not make obvious?`,
      rationale: "This clarifies strategic value that may be underrepresented in repository structure alone.",
      priority: "High" as const,
      relatedAreas: [secondFocusArea],
    },
    {
      question: `Where might the current study be over-reading ${weakArea} as important when it is really incidental legacy behavior?`,
      rationale: "This reduces the risk of preserving the wrong thing during migration planning.",
      priority: "Medium" as const,
      relatedAreas: [weakArea],
    },
  ];

  const targetFallbacks = [
    {
      question: `Which design principles or product identity constraints around ${focusArea} must migration work never break in Repo 2?`,
      rationale: "This would sharpen the difference between acceptable extension and product drift.",
      priority: "High" as const,
      relatedAreas: [focusArea],
    },
    {
      question: `How strategically important is standards ingestion relative to ${secondFocusArea} and the current Repo 2 workflow model?`,
      rationale: "This would help prioritize migration planning around a major future-facing Repo 2 capability.",
      priority: "High" as const,
      relatedAreas: [secondFocusArea, "standards ingestion"],
    },
    {
      question: `Where might this study be misunderstanding ${weakArea} as an implementation detail when it is actually part of Repo 2's intended product philosophy?`,
      rationale: "This would reduce the chance of eroding strategically important Repo 2 patterns.",
      priority: "Medium" as const,
      relatedAreas: [weakArea],
    },
  ];

  return input.repository.role === "Source" ? sourceFallbacks : targetFallbacks;
}

function normalizeOperatorQuestions(value: unknown, fallbackQuestions: Array<Omit<RepoStudyOperatorQuestion, "id">>) {
  const normalized = Array.isArray(value)
    ? value.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const record = entry as Record<string, unknown>;
      const question = typeof record.question === "string"
        ? normalizeText(record.question)
        : typeof record.prompt === "string"
          ? normalizeText(record.prompt)
          : "";
      const rationale = typeof record.rationale === "string"
        ? normalizeText(record.rationale)
        : typeof record.reason === "string"
          ? normalizeText(record.reason)
          : question;
      const relatedAreas = dedupe(toListItems(record.relatedAreas ?? record.relatedTopics ?? record.focusAreas), 4);

      if (!question || !rationale) {
        return [];
      }

      return [{
        id: `question-${index + 1}`,
        question,
        rationale,
        priority: toPriority(record.priority, index),
        relatedAreas,
      } satisfies RepoStudyOperatorQuestion];
    })
    : [];

  return [...normalized, ...fallbackQuestions.map((question, index) => ({
    id: `fallback-question-${index + 1}`,
    ...question,
  }))]
    .filter((question, index, all) => all.findIndex((entry) => entry.question === question.question) === index)
    .slice(0, 6);
}

function collectUnderstandingItems(understanding: RepoStudyUnderstanding | null | undefined) {
  if (!understanding) {
    return [];
  }

  return dedupe([
    ...understanding.purpose,
    ...understanding.capabilities,
    ...understanding.coreWorkflows,
    ...understanding.importantEntities,
    ...understanding.integrations,
    ...understanding.architectureShape,
    ...understanding.interactionAndDesign,
    ...understanding.migrationRisks,
    ...understanding.nextStageGuidance,
  ], 40);
}

function buildFallbackIterationDelta(input: {
  priorRuns: RepoStudyRunRecord[];
  understanding: RepoStudyUnderstanding;
  investigation: RepoStudyInvestigationRecord;
}) {
  const latestPriorRun = input.priorRuns[input.priorRuns.length - 1] ?? null;

  if (!latestPriorRun) {
    return null;
  }

  const previousItems = new Set(collectUnderstandingItems(latestPriorRun.understanding));
  const currentItems = collectUnderstandingItems(input.understanding);
  const changedUnderstanding = currentItems.filter((item) => !previousItems.has(item)).slice(0, 8);
  const guidanceApplied = dedupeGuidanceApplied(latestPriorRun.operatorGuidance.map((entry) => entry.guidance), 6);
  const strengthenedAreas = dedupe([
    ...input.investigation.deepDiveFindings.map((finding) => `${finding.focusArea}: ${finding.summary}`),
    ...input.understanding.confidenceNotes,
  ], 6);
  const remainingUncertainty = dedupe([
    ...input.understanding.openQuestions,
    ...input.investigation.openQuestions,
  ], 6);

  return {
    guidanceApplied: guidanceApplied.length > 0 ? guidanceApplied : ["This pass incorporated the prior guided-study thread even where explicit operator notes were limited."],
    changedUnderstanding: changedUnderstanding.length > 0 ? changedUnderstanding : ["This pass refined the study using operator guidance even where the top-line structure remained similar."],
    strengthenedAreas: strengthenedAreas.length > 0 ? strengthenedAreas : ["Confidence strengthened around the focus areas selected for direct deep-dive review."],
    remainingUncertainty: remainingUncertainty.length > 0 ? remainingUncertainty : ["Some strategic uncertainty remains because bounded study cannot read every implementation path in full."],
  } satisfies RepoStudyIterationDelta;
}

function takeBounded(items: unknown, minimum: number, maximum: number, fallback: string[] = []) {
  const normalized = dedupe([...toListItems(items), ...fallback], maximum);

  if (normalized.length < minimum) {
    throw new Error(`Agentic study generation returned too few items for a required section (needed ${minimum}).`);
  }

  return normalized;
}

function getStudyFocusPrompt(repository: RepositoryRecord) {
  if (repository.role === "Source") {
    return [
      "Optimize the study for legacy feature understanding, workflow discovery, integration boundaries, entity discovery, migration value preservation, and proposal-candidate discovery.",
      "Call out what looks sprawling, tangled, or risky.",
    ].join(" ");
  }

  return [
    "Optimize the study for interaction model understanding, chat-shell behavior, contextual panel behavior, artifact workflows, governance/admin patterns, extension boundaries, anti-sprawl patterns, and migration drift risk.",
    "Call out what gives Repo 2 its product identity and what future migration work must avoid breaking.",
  ].join(" ");
}

function collectInvestigationCandidates(artifact: RepositoryAnalysisArtifact, repository: RepositoryRecord) {
  const candidates = [
    ...artifact.configFiles,
    ...artifact.keyFileExcerpts.map((entry) => entry.path),
    ...artifact.routeFiles,
    ...artifact.componentFiles,
    ...artifact.modelFiles,
    ...artifact.aiFiles,
    ...artifact.workflowFiles,
    ...artifact.importantDirectories.flatMap((directory) => directory.samplePaths),
  ];

  const allPaths = artifact.allFilePaths;

  const roleSpecific = repository.role === "Source"
    ? allPaths.filter((path) => /(^run\.py$|^requirements\.txt$|^app\/__init__\.py$|^app\/config\.py$|^app\/routes\/.+\.py$|^app\/data\/.+\.py$|^app\/mail\/.+\.py$|^migrations\/.+|^app\/templates\/.+|^app\/static\/js\/.+)/i.test(path)).slice(0, 40)
    : allPaths.filter((path) => /(^package\.json$|^src\/app\/.+|^src\/components\/.+|^src\/models\/.+|^src\/services\/.+|^Tasks\/.+|^src\/app\/api\/.+)/i.test(path)).slice(0, 40);

  return dedupe([...candidates, ...roleSpecific], 80);
}

function resolvePathHints(pathHints: string[], candidates: string[]) {
  const resolved: string[] = [];

  for (const hint of pathHints) {
    const normalizedHint = hint.trim();
    const exactMatch = candidates.find((path) => path === normalizedHint);

    if (exactMatch) {
      resolved.push(exactMatch);
      continue;
    }

    const containsMatch = candidates.find((path) => path.includes(normalizedHint));

    if (containsMatch) {
      resolved.push(containsMatch);
    }
  }

  return dedupe(resolved, 8);
}

async function runBroadScan(repository: RepositoryRecord, artifact: RepositoryAnalysisArtifact, threadContextBlock?: string | null) {
  const exhaustiveInsights = await generateExhaustiveRepositoryTreeInsights({
    artifact,
    repoLabel: repository.name,
    focus: getStudyFocusPrompt(repository),
  });

  const prompt = [
    `You are performing Phase A broad repo scan for ${repository.name}.`,
    getStudyFocusPrompt(repository),
    `The scan already reviewed the full repository tree covering ${artifact.totalFileCount} files and ${artifact.totalDirectoryCount} directories.`,
    "Summarize the repo's overall shape, major signals, and what appears central enough to investigate more deeply.",
    "Return valid JSON with these keys only: summary, signals",
    "Full-tree scan insights:",
    JSON.stringify(exhaustiveInsights, null, 2),
    "Repository artifact summary:",
    JSON.stringify({
      topLevelEntries: artifact.topLevelEntries,
      importantDirectories: artifact.importantDirectories,
      configFiles: artifact.configFiles,
      routeFiles: artifact.routeFiles,
      componentFiles: artifact.componentFiles,
      modelFiles: artifact.modelFiles,
      aiFiles: artifact.aiFiles,
      workflowFiles: artifact.workflowFiles,
    }, null, 2),
    threadContextBlock ? "Guided study thread context:" : "",
    threadContextBlock ?? "",
  ].join("\n\n");

  const broadScan = await generateGeminiJson({ prompt, schema: looseBroadScanSchema });
  const fallbackSignals = dedupe([
    ...exhaustiveInsights.notableAreas,
    ...exhaustiveInsights.workflowSignals,
    ...exhaustiveInsights.architecturalSignals,
    ...artifact.topLevelEntries.map((entry) => `Top-level repo area: ${entry}`),
    ...artifact.importantDirectories.map((directory) => `${directory.path}: ${directory.note}`),
  ], 12);
  return {
    exhaustiveInsights,
    broadScanSummary: normalizeText(broadScan.summary) || exhaustiveInsights.summary,
    broadScanSignals: broadScanSchema.parse({
      summary: normalizeText(broadScan.summary) || exhaustiveInsights.summary,
      signals: dedupe([...toListItems(broadScan.signals), ...fallbackSignals], 12),
    }).signals,
  };
}

async function runInvestigationPlan(input: {
  repository: RepositoryRecord;
  artifact: RepositoryAnalysisArtifact;
  broadScanSummary: string;
  broadScanSignals: string[];
  exhaustiveInsights: { summary: string; notableAreas: string[]; workflowSignals: string[]; architecturalSignals: string[]; migrationRisks: string[]; groundingReferences: string[]; chunkCount: number; };
  threadContextBlock?: string | null;
}) {
  const candidates = collectInvestigationCandidates(input.artifact, input.repository);
  const prompt = [
    `You are performing Phase B investigation planning for ${input.repository.name}.`,
    getStudyFocusPrompt(input.repository),
    "Choose the most important areas for deeper inspection in a bounded, traceable way.",
    "The plan should explain what is important, why, and what can be deprioritized for now.",
    "Return valid JSON with these keys only: focusAreas, deprioritizedAreas",
    "Broad scan summary:",
    input.broadScanSummary,
    "Broad scan signals:",
    JSON.stringify(input.broadScanSignals, null, 2),
    "Full-tree insights:",
    JSON.stringify(input.exhaustiveInsights, null, 2),
    "Candidate deep-dive paths:",
    candidates.join("\n"),
    input.threadContextBlock ? "Guided study thread context:" : "",
    input.threadContextBlock ?? "",
  ].join("\n\n");

  const rawPlan = await generateGeminiJson({ prompt, schema: loosePlanSchema });
  const fallbackFocusAreas = buildFallbackFocusAreas({
    artifact: input.artifact,
    broadScanSignals: input.broadScanSignals,
    candidates,
  });
  const fallbackDeprioritizedAreas = dedupe([
    ...input.artifact.importantDirectories
      .filter((directory) => /static|asset|fixture|seed|data/i.test(directory.path))
      .map((directory) => `${directory.path}: ${directory.note}`),
    ...input.exhaustiveInsights.migrationRisks,
    "Large static or data-heavy surfaces can be treated as context unless they directly drive migration behavior.",
    "Repetitive generated or content-heavy areas can be sampled through representative paths rather than exhaustively read file-by-file.",
  ], 8);

  const plan = {
    focusAreas: normalizePlanFocusAreas(rawPlan.focusAreas, candidates, fallbackFocusAreas),
    deprioritizedAreas: normalizeDeprioritizedAreas(rawPlan.deprioritizedAreas, fallbackDeprioritizedAreas),
  };

  return {
    focusAreas: plan.focusAreas.map<RepoStudyFocusArea>((area) => ({
      title: normalizeText(area.title),
      rationale: normalizeText(area.rationale),
      priority: area.priority,
      pathHints: dedupe(area.pathHints, 6),
    })),
    deprioritizedAreas: dedupe(plan.deprioritizedAreas, 8),
    candidates,
  };
}

async function fetchDeepDiveTargets(repository: RepositoryRecord, focusAreas: RepoStudyFocusArea[], candidates: string[]) {
  const targets = focusAreas.flatMap<RepoStudyDeepDiveTarget>((area) =>
    resolvePathHints(area.pathHints, candidates).map((path) => ({
      path,
      focusArea: area.title,
      reason: area.rationale,
    })),
  );

  const uniqueTargets = targets.filter((target, index, all) => all.findIndex((entry) => entry.path === target.path) === index).slice(0, 12);

  const files = await Promise.all(
    uniqueTargets.map(async (target) => {
      try {
        return {
          ...target,
          content: await getGitHubRepositoryFileText(repository.url, target.path),
        };
      } catch {
        return {
          ...target,
          content: null,
        };
      }
    }),
  );

  return files.filter((entry) => entry.content).map((entry) => ({
    path: entry.path,
    focusArea: entry.focusArea,
    reason: entry.reason,
    content: entry.content as string,
  }));
}

async function runDeepDive(input: {
  repository: RepositoryRecord;
  broadScanSummary: string;
  focusAreas: RepoStudyFocusArea[];
  deepDiveFiles: Array<{ path: string; focusArea: string; reason: string; content: string }>;
  threadContextBlock?: string | null;
}) {
  const prompt = [
    `You are performing Phase C and D of an agentic repo study for ${input.repository.name}.`,
    getStudyFocusPrompt(input.repository),
    "Use the selected deep-dive files to explain what was learned, what still seems uncertain, and where confidence is strong or weak.",
    "Return valid JSON with these keys only: findings, openQuestions, recommendedFollowUps, confidenceNotes",
    "Broad scan summary:",
    input.broadScanSummary,
    "Chosen focus areas:",
    JSON.stringify(input.focusAreas, null, 2),
    "Deep-dive file excerpts:",
    JSON.stringify(
      input.deepDiveFiles.map((file) => ({
        path: file.path,
        focusArea: file.focusArea,
        reason: file.reason,
        excerpt: file.content.split(/\r?\n/).slice(0, 80).join("\n").slice(0, 5000),
      })),
      null,
      2,
    ),
    input.threadContextBlock ? "Guided study thread context:" : "",
    input.threadContextBlock ?? "",
  ].join("\n\n");

  const raw = await generateGeminiJson({ prompt, schema: looseDeepDiveSchema });
  const findingsRaw = Array.isArray(raw.findings) ? raw.findings : [];

  const deepDiveFindings = findingsRaw.flatMap<RepoStudyDeepDiveFinding>((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const focusArea = typeof record.focusArea === "string" ? normalizeText(record.focusArea) : "General";
    const summary = typeof record.summary === "string" ? normalizeText(record.summary) : focusArea;
    const findings = takeBounded(record.findings, 1, 6, [summary]);
    const evidence = dedupe(toListItems(record.evidence), 8);

    return [{ focusArea, summary, findings, evidence }];
  });

  const fallbackFindings = input.focusAreas.flatMap<RepoStudyDeepDiveFinding>((area) => {
    const matchingFiles = input.deepDiveFiles.filter((file) => file.focusArea === area.title);

    if (matchingFiles.length === 0) {
      return [{
        focusArea: area.title,
        summary: area.rationale,
        findings: [`No file content was retrieved for this focus area, so conclusions remain provisional and tree-level only.`],
        evidence: area.pathHints,
      }];
    }

    return [{
      focusArea: area.title,
      summary: area.rationale,
      findings: dedupe([
        `Deep-dive inspection covered ${matchingFiles.length} file(s) tied to this focus area.`,
        ...matchingFiles.map((file) => `${file.path}: selected because ${file.reason}`),
      ], 6),
      evidence: dedupe(matchingFiles.map((file) => file.path), 8),
    }];
  });

  const openQuestions = dedupe([
    ...toListItems(raw.openQuestions),
    ...input.focusAreas
      .filter((area) => input.deepDiveFiles.every((file) => file.focusArea !== area.title))
      .map((area) => `What hidden behavior remains inside ${area.title.toLowerCase()} beyond the tree-level signals?`),
    "Which critical behaviors still depend on data/config/assets that were only sampled structurally rather than read in full?",
  ], 8);
  const recommendedFollowUps = dedupe([
    ...toListItems(raw.recommendedFollowUps),
    ...input.focusAreas.map((area) => `Inspect additional files for ${area.title.toLowerCase()} around ${area.pathHints.slice(0, 2).join(', ')}`),
    "Cross-check representative static/data-heavy areas against the application flows that reference them.",
  ], 8);
  const confidenceNotes = dedupe([
    ...toListItems(raw.confidenceNotes),
    `Confidence is anchored by full-tree coverage of the repository before bounded deep-dive selection.`,
    input.deepDiveFiles.length > 0
      ? `Confidence is stronger in ${input.deepDiveFiles.length} inspected target files and weaker outside those focused reads.`
      : "Confidence is limited because no deep-dive file contents were retrieved for this run.",
    `Confidence remains bounded because this study prioritizes representative investigation over exhaustive file-by-file reading.`,
  ], 8);

  return {
    deepDiveFindings: deepDiveFindings.length > 0 ? deepDiveFindings : fallbackFindings,
    openQuestions,
    recommendedFollowUps,
    confidenceNotes,
  };
}

async function runFinalSynthesis(input: {
  repository: RepositoryRecord;
  artifact: RepositoryAnalysisArtifact;
  investigation: RepoStudyInvestigationRecord;
  threadContextBlock?: string | null;
}) {
  const prompt = [
    `You are producing the final Phase E repo study synthesis for ${input.repository.name}.`,
    getStudyFocusPrompt(input.repository),
    "Use the investigation record below to produce the final repo study artifact.",
    "The final artifact should explain what the system is, what it does, how it is structured, key workflows, important entities, migration-relevant value, risks, and confidence/uncertainty.",
    "Return valid JSON with these keys only:",
    "summary, purpose, capabilities, coreWorkflows, importantEntities, integrations, architectureShape, interactionAndDesign, migrationRisks, nextStageGuidance, groundingReferences, confidenceNotes, openQuestions",
    "Investigation record:",
    JSON.stringify(input.investigation, null, 2),
    "Repository artifact summary:",
    JSON.stringify({
      fullName: input.artifact.fullName,
      totalFileCount: input.artifact.totalFileCount,
      totalDirectoryCount: input.artifact.totalDirectoryCount,
      topLevelEntries: input.artifact.topLevelEntries,
      importantDirectories: input.artifact.importantDirectories,
      configFiles: input.artifact.configFiles,
      keyFileExcerpts: input.artifact.keyFileExcerpts,
    }, null, 2),
    input.threadContextBlock ? "Guided study thread context:" : "",
    input.threadContextBlock ?? "",
  ].join("\n\n");

  const raw = await generateGeminiJson({ prompt, schema: looseUnderstandingSchema });
  const fallbackPurpose = dedupe([
    input.investigation.broadScanSummary,
    ...input.investigation.focusAreas.map((area) => `${area.title}: ${area.rationale}`),
    ...input.investigation.broadScanSignals,
  ], 8);
  const fallbackCapabilities = dedupe([
    ...input.investigation.deepDiveFindings.flatMap((finding) => finding.findings),
    ...input.investigation.focusAreas.map((area) => area.title),
    ...input.investigation.broadScanSignals,
  ], 10);
  const fallbackWorkflows = dedupe([
    ...input.investigation.deepDiveFindings.map((finding) => `${finding.focusArea}: ${finding.summary}`),
    ...input.investigation.deepDiveFindings.flatMap((finding) => finding.findings),
    ...input.investigation.recommendedFollowUps,
  ], 10);
  const fallbackEntities = dedupe([
    ...input.investigation.focusAreas.map((area) => `${area.title}: ${area.rationale}`),
    ...input.artifact.modelFiles,
    ...input.artifact.routeFiles,
  ], 10);
  const fallbackIntegrations = dedupe([
    ...input.artifact.aiFiles,
    ...input.artifact.workflowFiles,
    ...input.artifact.configFiles,
    ...input.investigation.broadScanSignals,
  ], 8);
  const fallbackArchitecture = dedupe([
    ...input.artifact.topLevelEntries.map((entry) => `Top-level area: ${entry}`),
    ...input.artifact.importantDirectories.map((directory) => `${directory.path}: ${directory.note}`),
    ...input.investigation.broadScanSignals,
  ], 8);
  const fallbackInteraction = dedupe([
    ...input.artifact.componentFiles,
    ...input.investigation.deepDiveFindings.map((finding) => `${finding.focusArea}: ${finding.summary}`),
    ...input.investigation.deepDiveFindings.flatMap((finding) => finding.findings),
  ], 8);
  const fallbackMigrationRisks = dedupe([
    ...input.investigation.recommendedFollowUps,
    ...input.investigation.openQuestions,
    ...input.investigation.confidenceNotes,
  ], 8);
  const fallbackNextStageGuidance = dedupe([
    ...input.investigation.recommendedFollowUps,
    ...input.investigation.focusAreas.map((area) => `Deepen ${area.title.toLowerCase()} analysis using ${area.pathHints.slice(0, 2).join(', ')}`),
    ...input.investigation.openQuestions,
  ], 8);
  const fallbackReferences = dedupe([
    ...input.artifact.configFiles,
    ...input.artifact.routeFiles,
    ...input.artifact.componentFiles,
    ...input.artifact.modelFiles,
    ...input.artifact.aiFiles,
    ...input.artifact.workflowFiles,
    ...input.artifact.keyFileExcerpts.map((entry) => entry.path),
    ...input.investigation.deepDiveTargets.map((target) => target.path),
  ], 12);
  const fallbackConfidenceNotes = dedupe([
    ...input.investigation.confidenceNotes,
    `Broad scan covered the full repository tree across ${input.artifact.totalFileCount} files and ${input.artifact.totalDirectoryCount} directories before selecting deep dives.`,
    input.investigation.deepDiveTargets.length > 0
      ? `Confidence is higher in areas anchored by ${input.investigation.deepDiveTargets.length} fetched deep-dive files.`
      : "Confidence is limited because no deep-dive file content was retrieved from the selected targets.",
    input.investigation.openQuestions.length > 0
      ? `Confidence remains bounded by ${input.investigation.openQuestions.length} open investigation questions.`
      : "Confidence is constrained by the repository-scale scan relying on bounded targeted inspection rather than reading every file in full.",
  ], 8);

  return {
    summary: normalizeText(raw.summary) || input.investigation.broadScanSummary,
    purpose: takeBounded(raw.purpose, 2, 8, fallbackPurpose),
    capabilities: takeBounded(raw.capabilities, 3, 10, fallbackCapabilities),
    coreWorkflows: takeBounded(raw.coreWorkflows, 3, 10, fallbackWorkflows),
    importantEntities: takeBounded(raw.importantEntities, 3, 10, fallbackEntities),
    integrations: takeBounded(raw.integrations, 2, 8, fallbackIntegrations),
    architectureShape: takeBounded(raw.architectureShape, 3, 8, fallbackArchitecture),
    interactionAndDesign: takeBounded(raw.interactionAndDesign, 3, 8, fallbackInteraction),
    migrationRisks: takeBounded(raw.migrationRisks, 3, 8, fallbackMigrationRisks),
    nextStageGuidance: takeBounded(raw.nextStageGuidance, 3, 8, fallbackNextStageGuidance),
    groundingReferences: takeBounded(raw.groundingReferences, 4, 12, fallbackReferences),
    confidenceNotes: takeBounded(raw.confidenceNotes, 2, 8, fallbackConfidenceNotes),
    openQuestions: dedupe([...toListItems(raw.openQuestions), ...input.investigation.openQuestions], 8),
  } satisfies RepoStudyUnderstanding;
}

async function runGuidedLoopHandoff(input: {
  repository: RepositoryRecord;
  understanding: RepoStudyUnderstanding;
  investigation: RepoStudyInvestigationRecord;
  priorRuns: RepoStudyRunRecord[];
}) {
  const prompt = [
    `You are preparing a guided study handoff for ${input.repository.name}.`,
    getStudyFocusPrompt(input.repository),
    "Summarize what now seems strategically important, where confidence is strong, where confidence is weak, and ask the operator a short list of specific high-leverage questions.",
    "Questions must be concrete and aimed at improving migration understanding, not generic repo trivia.",
    "If previous operator guidance exists, explain what changed in this pass because of it and what still remains uncertain.",
    "Return valid JSON with these keys only:",
    "strategicImportance, highConfidenceAreas, weakConfidenceAreas, operatorQuestions, guidanceApplied, changedUnderstanding, strengthenedAreas, remainingUncertainty",
    "Current understanding:",
    JSON.stringify(input.understanding, null, 2),
    "Current investigation:",
    JSON.stringify(input.investigation, null, 2),
    input.priorRuns.length > 0 ? "Guided study thread context:" : "",
    input.priorRuns.length > 0 ? JSON.stringify(buildThreadContext(input.priorRuns), null, 2) : "",
  ].join("\n\n");

  const raw = await generateGeminiJson({ prompt, schema: looseGuidedLoopSchema });
  const fallbackStrategicImportance = dedupe([
    ...input.understanding.nextStageGuidance,
    ...input.understanding.migrationRisks,
    ...input.investigation.focusAreas.filter((area) => area.priority === "High").map((area) => `${area.title}: ${area.rationale}`),
    input.understanding.summary,
  ], 8);
  const fallbackHighConfidenceAreas = dedupe([
    ...input.understanding.confidenceNotes,
    ...input.investigation.deepDiveFindings.map((finding) => `${finding.focusArea}: ${finding.summary}`),
    ...input.investigation.focusAreas.filter((area) => area.priority === "High").map((area) => `${area.title}: investigated directly`),
    `The study completed a full-tree scan before choosing bounded deep dives.`,
  ], 8);
  const fallbackWeakConfidenceAreas = dedupe([
    ...input.understanding.openQuestions,
    ...input.investigation.openQuestions,
    ...input.investigation.confidenceNotes,
    "Some product intent may still be invisible in code-only evidence without operator clarification.",
    "Representative deep dives reduce uncertainty, but they do not eliminate hidden behavior in untouched paths.",
  ], 8);
  const fallbackQuestions = collectFallbackOperatorQuestions({
    repository: input.repository,
    focusAreas: input.investigation.focusAreas,
    weakConfidenceAreas: fallbackWeakConfidenceAreas,
    openQuestions: input.understanding.openQuestions,
  });
  const fallbackIterationDelta = buildFallbackIterationDelta({
    priorRuns: input.priorRuns,
    understanding: input.understanding,
    investigation: input.investigation,
  });

  return {
    strategicImportance: takeBounded(raw.strategicImportance, 2, 8, fallbackStrategicImportance),
    highConfidenceAreas: takeBounded(raw.highConfidenceAreas, 2, 8, fallbackHighConfidenceAreas),
    weakConfidenceAreas: takeBounded(raw.weakConfidenceAreas, 2, 8, fallbackWeakConfidenceAreas),
    operatorQuestions: normalizeOperatorQuestions(raw.operatorQuestions, fallbackQuestions),
    iterationDelta: input.priorRuns.length > 0
      ? {
          guidanceApplied: dedupeGuidanceApplied(
            takeBounded(raw.guidanceApplied, 1, 6, fallbackIterationDelta?.guidanceApplied ?? ["This pass incorporated operator guidance from the previous study turn."]),
            6,
          ),
          changedUnderstanding: takeBounded(raw.changedUnderstanding, 1, 8, fallbackIterationDelta?.changedUnderstanding ?? ["This pass revised the study using prior context and fresh repository evidence."]),
          strengthenedAreas: takeBounded(raw.strengthenedAreas, 1, 6, fallbackIterationDelta?.strengthenedAreas ?? fallbackHighConfidenceAreas),
          remainingUncertainty: takeBounded(raw.remainingUncertainty, 1, 6, fallbackIterationDelta?.remainingUncertainty ?? fallbackWeakConfidenceAreas),
        } satisfies RepoStudyIterationDelta
      : null,
  };
}

export async function generateAgenticRepoStudy(input: {
  repository: RepositoryRecord;
  artifact: RepositoryAnalysisArtifact;
  priorRuns?: RepoStudyRunRecord[];
}): Promise<{
  investigation: RepoStudyInvestigationRecord;
  understanding: RepoStudyUnderstanding;
  strategicImportance: string[];
  highConfidenceAreas: string[];
  weakConfidenceAreas: string[];
  operatorQuestions: RepoStudyOperatorQuestion[];
  iterationDelta: RepoStudyIterationDelta | null;
}> {
  const priorRuns = input.priorRuns ?? [];
  const threadContextBlock = getThreadContextBlock(priorRuns);
  const broadScan = await runBroadScan(input.repository, input.artifact, threadContextBlock);
  const plan = await runInvestigationPlan({
    repository: input.repository,
    artifact: input.artifact,
    broadScanSummary: broadScan.broadScanSummary,
    broadScanSignals: broadScan.broadScanSignals,
    exhaustiveInsights: broadScan.exhaustiveInsights,
    threadContextBlock,
  });
  const deepDiveFiles = await fetchDeepDiveTargets(input.repository, plan.focusAreas, plan.candidates);
  const deepDive = await runDeepDive({
    repository: input.repository,
    broadScanSummary: broadScan.broadScanSummary,
    focusAreas: plan.focusAreas,
    deepDiveFiles,
    threadContextBlock,
  });

  const investigation: RepoStudyInvestigationRecord = {
    broadScanSummary: broadScan.broadScanSummary,
    broadScanSignals: broadScan.broadScanSignals,
    focusAreas: plan.focusAreas,
    deprioritizedAreas: plan.deprioritizedAreas,
    deepDiveTargets: deepDiveFiles.map<RepoStudyDeepDiveTarget>((file) => ({
      path: file.path,
      focusArea: file.focusArea,
      reason: file.reason,
    })),
    deepDiveFindings: deepDive.deepDiveFindings,
    openQuestions: deepDive.openQuestions,
    recommendedFollowUps: deepDive.recommendedFollowUps,
    confidenceNotes: deepDive.confidenceNotes,
  };

  const understanding = await runFinalSynthesis({
    repository: input.repository,
    artifact: input.artifact,
    investigation,
    threadContextBlock,
  });

  const guidedLoop = await runGuidedLoopHandoff({
    repository: input.repository,
    understanding,
    investigation,
    priorRuns,
  });

  return {
    investigation,
    understanding,
    strategicImportance: guidedLoop.strategicImportance,
    highConfidenceAreas: guidedLoop.highConfidenceAreas,
    weakConfidenceAreas: guidedLoop.weakConfidenceAreas,
    operatorQuestions: guidedLoop.operatorQuestions,
    iterationDelta: guidedLoop.iterationDelta,
  };
}