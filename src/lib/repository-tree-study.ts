import { z } from "zod";

import type { RepositoryAnalysisArtifact } from "@/domain/intelligence";
import { generateGeminiJson } from "@/lib/gemini";

const treeChunkSchema = z.object({
  summary: z.string().min(1),
  notableAreas: z.array(z.string().min(1)).min(1).max(6),
  workflowSignals: z.array(z.string().min(1)).min(1).max(6),
  architecturalSignals: z.array(z.string().min(1)).min(1).max(6),
  migrationRisks: z.array(z.string().min(1)).min(1).max(6),
  groundingReferences: z.array(z.string().min(1)).min(2).max(12),
});

const looseTreeChunkSchema = z.object({
  summary: z.string().catch(""),
  notableAreas: z.unknown().optional(),
  workflowSignals: z.unknown().optional(),
  architecturalSignals: z.unknown().optional(),
  migrationRisks: z.unknown().optional(),
  groundingReferences: z.unknown().optional(),
});

const treeAggregateSchema = z.object({
  summary: z.string().min(1),
  notableAreas: z.array(z.string().min(1)).min(2).max(12),
  workflowSignals: z.array(z.string().min(1)).min(2).max(12),
  architecturalSignals: z.array(z.string().min(1)).min(2).max(12),
  migrationRisks: z.array(z.string().min(1)).min(2).max(12),
  groundingReferences: z.array(z.string().min(1)).min(4).max(20),
});

const looseTreeAggregateSchema = z.object({
  summary: z.string().catch(""),
  notableAreas: z.unknown().optional(),
  workflowSignals: z.unknown().optional(),
  architecturalSignals: z.unknown().optional(),
  migrationRisks: z.unknown().optional(),
  groundingReferences: z.unknown().optional(),
});

export interface ExhaustiveRepositoryTreeInsights {
  summary: string;
  notableAreas: string[];
  workflowSignals: string[];
  architecturalSignals: string[];
  migrationRisks: string[];
  groundingReferences: string[];
  chunkCount: number;
}

function normalizeText(value: string) {
  return value.replace(/[*_`#]+/g, "").replace(/\s+/g, " ").trim();
}

function dedupe(items: string[], limit: number) {
  return [...new Set(items.map((item) => normalizeText(item)).filter(Boolean))].slice(0, limit);
}

function toListItems(value: unknown): string[] {
  if (typeof value === "string") {
    return [normalizeText(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => toListItems(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const lead = [record.title, record.name, record.pattern, record.area, record.signal, record.risk]
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

function collapsePathGroup(paths: string[], label: string) {
  const sorted = paths.slice().sort();

  if (sorted.length <= 8) {
    return sorted;
  }

  return [
    `${label} (${sorted.length} files)`,
    ...sorted.slice(0, 3).map((path) => `sample: ${path}`),
    ...sorted.slice(-2).map((path) => `sample: ${path}`),
  ];
}

function compressPathsForStudy(paths: string[]) {
  const groups = new Map<string, string[]>();
  const standalone: string[] = [];

  for (const path of paths) {
    let groupKey: string | null = null;

    if (/^app\/data\//i.test(path)) {
      const segments = path.split("/");
      groupKey = `app/data/${segments[2] ?? "misc"}`;
    } else if (/^app\/static\//i.test(path)) {
      const segments = path.split("/");
      groupKey = `app/static/${segments[2] ?? "misc"}`;
    } else if (/^app\/routes\//i.test(path)) {
      groupKey = "app/routes";
    } else if (/^app\/templates\//i.test(path)) {
      groupKey = "app/templates";
    } else if (/^app\/mail\//i.test(path)) {
      groupKey = "app/mail";
    }

    if (!groupKey) {
      standalone.push(path);
      continue;
    }

    const bucket = groups.get(groupKey) ?? [];
    bucket.push(path);
    groups.set(groupKey, bucket);
  }

  const compressed = [...standalone];

  for (const [groupKey, groupedPaths] of groups.entries()) {
    compressed.push(...collapsePathGroup(groupedPaths, groupKey));
  }

  return compressed;
}

function chunkPaths(paths: string[], maxCharacters = 50000) {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const path of paths) {
    const nextLength = currentLength + path.length + 1;

    if (currentChunk.length > 0 && nextLength > maxCharacters) {
      chunks.push(currentChunk);
      currentChunk = [path];
      currentLength = path.length + 1;
      continue;
    }

    currentChunk.push(path);
    currentLength = nextLength;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildTreeFallbacks(artifact: RepositoryAnalysisArtifact, preferredPaths: string[], chunkSummaries?: Array<{
  summary: string;
  notableAreas: string[];
  workflowSignals: string[];
  architecturalSignals: string[];
  migrationRisks: string[];
  groundingReferences: string[];
}>) {
  const topLevelFallbacks = artifact.topLevelEntries.map((entry) => `Top-level area: ${entry}`);
  const directoryFallbacks = artifact.importantDirectories.map((directory) => `${directory.path}: ${directory.note}`);
  const chunkFallbacks = chunkSummaries
    ? {
        summaries: dedupe(chunkSummaries.map((chunk) => chunk.summary), 8),
        notableAreas: dedupe(chunkSummaries.flatMap((chunk) => chunk.notableAreas), 12),
        workflowSignals: dedupe(chunkSummaries.flatMap((chunk) => chunk.workflowSignals), 12),
        architecturalSignals: dedupe(chunkSummaries.flatMap((chunk) => chunk.architecturalSignals), 12),
        migrationRisks: dedupe(chunkSummaries.flatMap((chunk) => chunk.migrationRisks), 12),
        groundingReferences: dedupe(chunkSummaries.flatMap((chunk) => chunk.groundingReferences), 20),
      }
    : null;

  return {
    summary: chunkFallbacks?.summaries[0] ?? `${artifact.fullName} exposes broad repository structure across ${artifact.totalFileCount} files and ${artifact.totalDirectoryCount} directories.`,
    notableAreas: dedupe([
      ...(chunkFallbacks?.notableAreas ?? []),
      ...directoryFallbacks,
      ...topLevelFallbacks,
      ...preferredPaths.slice(0, 6).map((path) => `Representative path: ${path}`),
    ], 12),
    workflowSignals: dedupe([
      ...(chunkFallbacks?.workflowSignals ?? []),
      ...artifact.workflowFiles,
      ...artifact.routeFiles,
      ...artifact.aiFiles,
      ...preferredPaths.slice(0, 6),
    ], 12),
    architecturalSignals: dedupe([
      ...(chunkFallbacks?.architecturalSignals ?? []),
      ...topLevelFallbacks,
      ...directoryFallbacks,
      ...artifact.configFiles,
    ], 12),
    migrationRisks: dedupe([
      ...(chunkFallbacks?.migrationRisks ?? []),
      ...artifact.importantDirectories
        .filter((directory) => /data|static|template|migration|route|model|config/i.test(directory.path))
        .map((directory) => `Migration risk in ${directory.path}: ${directory.note}`),
      "Large repetitive data or static surfaces may hide migration-sensitive assumptions outside the main application flow.",
      "Entrypoints, routes, and domain/data modules need correlation checks so behavior is not lost during migration.",
    ], 12),
    groundingReferences: dedupe([
      ...(chunkFallbacks?.groundingReferences ?? []),
      ...preferredPaths,
      ...artifact.configFiles,
      ...artifact.routeFiles,
      ...artifact.modelFiles,
      ...artifact.workflowFiles,
    ], 20),
  };
}

async function summarizeTreeChunk(input: {
  artifact: RepositoryAnalysisArtifact;
  repoLabel: string;
  chunkIndex: number;
  chunkCount: number;
  paths: string[];
  focus: string;
}) {
  const prompt = [
    `You are studying ${input.repoLabel} for ProjectMapper.`,
    `This is chunk ${input.chunkIndex + 1} of ${input.chunkCount} from an exhaustive repository tree review.`,
    `Use the full list of paths in this chunk as evidence. Do not ignore paths just because they are data files, configs, migrations, workflows, or generated-feeling assets.`,
    input.focus,
    "Infer what these paths say about notable product areas, workflow surfaces, architecture shape, and migration risks.",
    "Do not give generic software advice.",
    "Return valid JSON with these keys only:",
    "summary, notableAreas, workflowSignals, architecturalSignals, migrationRisks, groundingReferences",
    `Repository totals: ${input.artifact.totalFileCount} files, ${input.artifact.totalDirectoryCount} directories.`,
    "Path chunk:",
    input.paths.join("\n"),
  ].join("\n\n");

  const rawChunk = await generateGeminiJson({
    prompt,
    schema: looseTreeChunkSchema,
  });
  const fallback = buildTreeFallbacks(input.artifact, input.paths);

  return treeChunkSchema.parse({
    summary: normalizeText(rawChunk.summary) || fallback.summary,
    notableAreas: dedupe([...toListItems(rawChunk.notableAreas), ...fallback.notableAreas], 6),
    workflowSignals: dedupe([...toListItems(rawChunk.workflowSignals), ...fallback.workflowSignals], 6),
    architecturalSignals: dedupe([...toListItems(rawChunk.architecturalSignals), ...fallback.architecturalSignals], 6),
    migrationRisks: dedupe([...toListItems(rawChunk.migrationRisks), ...fallback.migrationRisks], 6),
    groundingReferences: dedupe([...toListItems(rawChunk.groundingReferences), ...fallback.groundingReferences], 12),
  });
}

export async function generateExhaustiveRepositoryTreeInsights(input: {
  artifact: RepositoryAnalysisArtifact;
  repoLabel: string;
  focus: string;
}): Promise<ExhaustiveRepositoryTreeInsights> {
  const compressedPaths = compressPathsForStudy(input.artifact.allFilePaths);
  const chunks = chunkPaths(compressedPaths);

  if (chunks.length === 0) {
    return {
      summary: `${input.repoLabel} did not expose any file paths for tree-level study.`,
      notableAreas: [],
      workflowSignals: [],
      architecturalSignals: [],
      migrationRisks: [],
      groundingReferences: [],
      chunkCount: 0,
    };
  }

  const chunkSummaries = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunkSummary = await summarizeTreeChunk({
      artifact: input.artifact,
      repoLabel: input.repoLabel,
      chunkIndex: index,
      chunkCount: chunks.length,
      paths: chunks[index],
      focus: input.focus,
    });
    chunkSummaries.push(chunkSummary);
  }

  const aggregatePrompt = [
    `You are consolidating an exhaustive full-tree study for ${input.repoLabel}.`,
    `Every repository file path has already been reviewed across ${chunks.length} chunks.`,
    `The review covered all ${input.artifact.totalFileCount} files. Repetitive path families were compacted into counted groups for efficiency, but the whole tree was still included in the study scope.`,
    input.focus,
    "Synthesize the chunk findings into one coherent view of the whole repository.",
    "Return valid JSON with these keys only:",
    "summary, notableAreas, workflowSignals, architecturalSignals, migrationRisks, groundingReferences",
    "Chunk findings:",
    JSON.stringify(chunkSummaries, null, 2),
  ].join("\n\n");

  const aggregate = await generateGeminiJson({
    prompt: aggregatePrompt,
    schema: looseTreeAggregateSchema,
  });
  const fallback = buildTreeFallbacks(input.artifact, compressedPaths.slice(0, 12), chunkSummaries);

  const normalizedAggregate = treeAggregateSchema.parse({
    summary: normalizeText(aggregate.summary) || fallback.summary,
    notableAreas: dedupe([...toListItems(aggregate.notableAreas), ...fallback.notableAreas], 12),
    workflowSignals: dedupe([...toListItems(aggregate.workflowSignals), ...fallback.workflowSignals], 12),
    architecturalSignals: dedupe([...toListItems(aggregate.architecturalSignals), ...fallback.architecturalSignals], 12),
    migrationRisks: dedupe([...toListItems(aggregate.migrationRisks), ...fallback.migrationRisks], 12),
    groundingReferences: dedupe([...toListItems(aggregate.groundingReferences), ...fallback.groundingReferences], 20),
  });

  return {
    summary: normalizedAggregate.summary,
    notableAreas: normalizedAggregate.notableAreas,
    workflowSignals: normalizedAggregate.workflowSignals,
    architecturalSignals: normalizedAggregate.architecturalSignals,
    migrationRisks: normalizedAggregate.migrationRisks,
    groundingReferences: normalizedAggregate.groundingReferences,
    chunkCount: chunks.length,
  };
}