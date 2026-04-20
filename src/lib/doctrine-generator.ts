import { z } from "zod";

import type { AnalysisRunRecord, DoctrineDraftContent } from "@/domain/intelligence";
import type { ProjectRecord } from "@/domain/project-mapper";
import { generateGeminiJson } from "@/lib/gemini";

const doctrineDraftSchema = z.object({
  summary: z.string().min(1),
  architecturePatterns: z.array(z.string().min(1)).min(2).max(8),
  uxPatterns: z.array(z.string().min(1)).min(2).max(8),
  interactionPatterns: z.array(z.string().min(1)).min(2).max(8),
  criticalRules: z.array(z.string().min(1)).min(3).max(8),
  antiPatterns: z.array(z.string().min(1)).min(3).max(8),
  groundingReferences: z.array(z.string().min(1)).min(4).max(12),
});

const looseDoctrineDraftSchema = z.object({
  summary: z.string().catch(""),
  architecturePatterns: z.unknown().optional(),
  uxPatterns: z.unknown().optional(),
  interactionPatterns: z.unknown().optional(),
  criticalRules: z.unknown().optional(),
  antiPatterns: z.unknown().optional(),
  groundingReferences: z.unknown().optional(),
});

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitStringItems(value: string) {
  return value
    .split(/\r?\n|[•●▪■]|\s+-\s+/)
    .map((entry) => normalizeText(entry.replace(/^(?:\d+\.|[-*])\s*/, "")))
    .filter(Boolean);
}

function toDoctrineListItem(value: unknown): string[] {
  if (typeof value === "string") {
    return splitStringItems(value);
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => toDoctrineListItem(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const lead = [record.pattern, record.rule, record.title, record.name]
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => normalizeText(entry))[0];
    const detail = [record.description, record.summary, record.note, record.rationale]
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

function dedupeAndBound(items: string[], minimum: number, maximum: number) {
  const seen = new Set<string>();
  const normalized = items.filter((item) => {
    const candidate = normalizeText(item);

    if (!candidate || seen.has(candidate)) {
      return false;
    }

    seen.add(candidate);
    return true;
  });

  return normalized.slice(0, Math.max(minimum, maximum));
}

function takeBounded(items: string[], minimum: number, maximum: number, fallback: string[] = []) {
  const combined = [...items, ...fallback];
  const bounded = dedupeAndBound(combined, minimum, maximum).slice(0, maximum);

  if (bounded.length < minimum) {
    throw new Error(`Doctrine generation returned too few items for a required section (needed ${minimum}).`);
  }

  return bounded;
}

function collectReferenceFallbacks(run: AnalysisRunRecord) {
  const artifact = run.repoB;

  return [
    ...artifact.configFiles,
    ...artifact.routeFiles,
    ...artifact.componentFiles,
    ...artifact.modelFiles,
    ...artifact.aiFiles,
    ...artifact.workflowFiles,
    ...artifact.keyFileExcerpts.map((entry) => entry.path),
  ];
}

function normalizeDoctrineDraft(
  raw: z.infer<typeof looseDoctrineDraftSchema>,
  analysisRun: AnalysisRunRecord,
): DoctrineDraftContent {
  const architecturePatterns = toDoctrineListItem(raw.architecturePatterns);
  const uxPatterns = toDoctrineListItem(raw.uxPatterns);
  const interactionPatterns = toDoctrineListItem(raw.interactionPatterns);
  const criticalRules = toDoctrineListItem(raw.criticalRules);
  const antiPatterns = toDoctrineListItem(raw.antiPatterns);
  const nestedReferences = [
    raw.architecturePatterns,
    raw.uxPatterns,
    raw.interactionPatterns,
    raw.criticalRules,
    raw.antiPatterns,
  ].flatMap((section) => {
    if (!Array.isArray(section)) {
      return [];
    }

    return section.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      return toDoctrineListItem((entry as Record<string, unknown>).groundingReferences);
    });
  });
  const referenceFallbacks = collectReferenceFallbacks(analysisRun);

  return doctrineDraftSchema.parse({
    summary: normalizeText(raw.summary),
    architecturePatterns: takeBounded(architecturePatterns, 2, 8),
    uxPatterns: takeBounded(uxPatterns, 2, 8),
    interactionPatterns: takeBounded(interactionPatterns, 2, 8),
    criticalRules: takeBounded(criticalRules, 3, 8),
    antiPatterns: takeBounded(antiPatterns, 3, 8),
    groundingReferences: takeBounded(
      [...toDoctrineListItem(raw.groundingReferences), ...nestedReferences],
      4,
      12,
      referenceFallbacks,
    ),
  });
}

function formatArtifactForPrompt(run: AnalysisRunRecord) {
  const artifact = run.repoB;

  return JSON.stringify(
    {
      repository: {
        name: artifact.repositoryName,
        fullName: artifact.fullName,
        defaultBranch: artifact.defaultBranch,
        topLevelEntries: artifact.topLevelEntries,
      },
      importantDirectories: artifact.importantDirectories,
      configFiles: artifact.configFiles,
      routeFiles: artifact.routeFiles,
      componentFiles: artifact.componentFiles,
      modelFiles: artifact.modelFiles,
      aiFiles: artifact.aiFiles,
      workflowFiles: artifact.workflowFiles,
      keyFileExcerpts: artifact.keyFileExcerpts,
      notes: artifact.notes,
    },
    null,
    2,
  );
}

export async function generateDoctrineDraft(input: {
  project: ProjectRecord;
  analysisRun: AnalysisRunRecord;
  operatorFeedback?: string;
}) {
  if (input.analysisRun.status !== "Complete") {
    throw new Error("A complete analysis run is required before doctrine generation can continue.");
  }

  if (input.analysisRun.repoB.error) {
    throw new Error(input.analysisRun.repoB.error);
  }

  const prompt = [
    "You are generating doctrine for ProjectMapper.",
    "The doctrine must be grounded in the target repository findings only.",
    "Do not return generic software best practices.",
    "Infer architectural patterns, UX patterns, interaction patterns, critical rules, and anti-patterns from the repository evidence.",
    "Every item must be specific to the repository artifacts and excerpts below.",
    "Grounding references must cite actual paths or concrete findings from the analysis artifact.",
    `Project mission: ${input.project.mission}`,
    input.operatorFeedback ? `Operator feedback for this generation: ${input.operatorFeedback}` : "",
    "Return valid JSON with these keys only:",
    "summary, architecturePatterns, uxPatterns, interactionPatterns, criticalRules, antiPatterns, groundingReferences",
    "Target repository analysis artifact:",
    formatArtifactForPrompt(input.analysisRun),
  ]
    .filter(Boolean)
    .join("\n\n");

  const rawDoctrineDraft = await generateGeminiJson<z.infer<typeof looseDoctrineDraftSchema>>({
    prompt,
    schema: looseDoctrineDraftSchema,
  });

  return normalizeDoctrineDraft(rawDoctrineDraft, input.analysisRun);
}