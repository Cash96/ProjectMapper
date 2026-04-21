import { z } from "zod";

import type { RepoStudyUnderstanding, RepositoryAnalysisArtifact } from "@/domain/intelligence";
import { generateGeminiJson } from "@/lib/gemini";
import { generateExhaustiveRepositoryTreeInsights } from "@/lib/repository-tree-study";

const sourceRepositoryStudySchema = z.object({
  summary: z.string().min(1),
  purpose: z.array(z.string().min(1)).min(2).max(6),
  capabilities: z.array(z.string().min(1)).min(4).max(10),
  coreWorkflows: z.array(z.string().min(1)).min(3).max(8),
  importantEntities: z.array(z.string().min(1)).min(3).max(8),
  integrations: z.array(z.string().min(1)).min(2).max(8),
  architectureShape: z.array(z.string().min(1)).min(3).max(8),
  interactionAndDesign: z.array(z.string().min(1)).min(3).max(8),
  migrationRisks: z.array(z.string().min(1)).min(3).max(8),
  nextStageGuidance: z.array(z.string().min(1)).min(3).max(8),
  groundingReferences: z.array(z.string().min(1)).min(4).max(12),
  confidenceNotes: z.array(z.string().min(1)).min(1).max(8),
  openQuestions: z.array(z.string().min(1)).max(8),
});

const looseSourceRepositoryStudySchema = z.object({
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
});

function normalizeText(value: string) {
  return value
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    const lead = [record.title, record.name, record.pattern, record.goal, record.risk, record.entity]
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

function takeBounded(section: string, items: unknown, minimum: number, maximum: number, fallback: string[] = []) {
  const normalized = [...toListItems(items), ...fallback].map((item) => normalizeText(item));
  const unique = [...new Set(normalized.filter(Boolean))].slice(0, maximum);

  if (unique.length < minimum) {
    throw new Error(`Repo 1 study generation returned too few items for ${section} (needed ${minimum}).`);
  }

  return unique;
}

function buildPromptArtifact(artifact: RepositoryAnalysisArtifact) {
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

function pathIncludes(paths: string[], matcher: RegExp) {
  return paths.some((path) => matcher.test(path));
}

function humanizePathName(path: string) {
  const fileName = path.split("/").pop() ?? path;
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
}

function collectSourceFallbacks(artifact: RepositoryAnalysisArtifact) {
  const importantDirectoryPaths = artifact.importantDirectories.map((directory) => directory.path);
  const topLevelEntries = artifact.topLevelEntries;
  const routeFiles = artifact.routeFiles;
  const componentFiles = artifact.componentFiles;
  const modelFiles = artifact.modelFiles;
  const aiFiles = artifact.aiFiles;
  const workflowFiles = artifact.workflowFiles;
  const allFiles = [
    ...artifact.configFiles,
    ...routeFiles,
    ...componentFiles,
    ...modelFiles,
    ...aiFiles,
    ...workflowFiles,
  ];

  const entityHints = modelFiles.slice(0, 8).map((path) => {
    const entity = humanizePathName(path);
    return `${entity} appears to be a meaningful legacy domain entity in Repo 1.`;
  });

  const fallbackEntityHints = importantDirectoryPaths.slice(0, 5).map((path) => {
    const area = humanizePathName(path);
    return `${area} appears to be a meaningful legacy domain area that should be mapped carefully.`;
  });

  const purpose = [
    topLevelEntries.includes("app") || topLevelEntries.includes("resources")
      ? "Repo 1 appears to be a full product application rather than a narrow utility repo, so migration work must preserve system-level value." 
      : null,
    pathIncludes(routeFiles, /student|teacher|class|course|lesson/i)
      ? "Repo 1 appears to support core learning and classroom workflows that still matter to the product's educational value."
      : null,
    pathIncludes(routeFiles, /admin|dashboard|report/i)
      ? "Repo 1 appears to include operational and reporting surfaces that shape how staff understand and manage activity."
      : null,
    pathIncludes(workflowFiles, /curriculum|assessment|plan|grade/i)
      ? "Repo 1 appears to encode domain workflows around planning, curriculum, and assessment rather than a single isolated feature."
      : null,
    pathIncludes(aiFiles, /ai|prompt|chat|agent/i)
      ? "Repo 1 appears to include AI-related behavior or prompts that may have user-facing workflow implications worth preserving selectively."
      : null,
    importantDirectoryPaths.length > 0
      ? `${humanizePathName(importantDirectoryPaths[0])} and related directories suggest the repo contains multiple legacy workflow areas that need structured migration study.`
      : null,
  ].filter((item): item is string => Boolean(item));

  const capabilities = [
    ...routeFiles.slice(0, 4).map((path) => `${path} suggests a distinct legacy workflow surface that may need migration mapping.`),
    ...componentFiles.slice(0, 3).map((path) => `${path} suggests a reusable UI behavior in the legacy system.`),
    ...importantDirectoryPaths.slice(0, 4).map((path) => `${path} appears to hold a significant area of legacy functionality.`),
    pathIncludes(routeFiles, /auth|login/i)
      ? "Repo 1 contains authentication or access-entry flows that may affect migration sequencing."
      : null,
    pathIncludes(routeFiles, /report|analytics/i)
      ? "Repo 1 contains reporting or analytics surfaces that likely reflect real operator expectations."
      : null,
    topLevelEntries.includes("database")
      ? "Repo 1 includes explicit database or migration structure that may encode business-critical behavior."
      : null,
  ].filter((item): item is string => Boolean(item));

  const coreWorkflows = [
    ...workflowFiles.slice(0, 4).map((path) => `${path} appears to represent a legacy workflow area that should be studied as a migration candidate.`),
    ...importantDirectoryPaths
      .filter((path) => /routes|resources|views|controllers|livewire|pages/i.test(path))
      .slice(0, 4)
      .map((path) => `${path} appears to contain a user-facing workflow surface in the legacy system.`),
    pathIncludes(routeFiles, /student|classroom|teacher/i)
      ? "The route structure suggests real user flows around students, teachers, or classrooms rather than only internal tooling."
      : null,
    pathIncludes(routeFiles, /lesson|assessment|assignment|quiz/i)
      ? "Repo 1 likely supports content-delivery or evaluation flows that may need decomposition into smaller migration proposals."
      : null,
    routeFiles.length === 0 && importantDirectoryPaths.length > 0
      ? "Repo 1 does not expose modern route patterns strongly, so migration should infer workflows from legacy directory structure, views, and controllers."
      : null,
  ].filter((item): item is string => Boolean(item));

  const integrations = [
    pathIncludes(allFiles, /auth|oauth|sso|clerk|nextauth|session/i)
      ? "Repo 1 shows signs of authentication or identity integration concerns."
      : null,
    pathIncludes(allFiles, /email|mail|notification|sms/i)
      ? "Repo 1 shows signs of notification or outbound communication behavior."
      : null,
    pathIncludes(allFiles, /api|client|service|fetch|axios/i)
      ? "Repo 1 appears to depend on service or API integration boundaries that may affect how features can be migrated safely."
      : null,
    pathIncludes(allFiles, /mongo|postgres|prisma|supabase|firebase/i)
      ? "Repo 1 shows signs of explicit persistence-layer or data-service dependencies."
      : null,
    topLevelEntries.includes("database")
      ? "Repo 1 has database-level structure that should be treated as a source of domain and workflow truth."
      : null,
    artifact.configFiles.some((path) => /composer\.json|package\.json|vite\.config/i.test(path))
      ? "Repo 1 uses explicit application configuration and dependency manifests that can reveal framework and integration choices."
      : null,
  ].filter((item): item is string => Boolean(item));

  const architectureShape = [
    artifact.topLevelEntries.includes("src")
      ? "Repo 1 is organized around a src-based application structure rather than a flat script layout."
      : null,
    artifact.topLevelEntries.includes("app")
      ? "Repo 1 is organized around an app directory that likely concentrates domain logic and framework conventions."
      : null,
    artifact.topLevelEntries.includes("resources")
      ? "Repo 1 separates rendered UI resources from backend application logic, which suggests a server-rendered or mixed-stack architecture."
      : null,
    routeFiles.length > 0
      ? "Repo 1 exposes a page or route-driven application surface that can be studied by workflow area."
      : null,
    componentFiles.length > 0
      ? "Repo 1 has reusable component or module structure that may reveal cross-cutting UI behaviors."
      : null,
    modelFiles.length > 0
      ? "Repo 1 has explicit model or schema files, which means migration should preserve domain semantics instead of only copying screens."
      : null,
    artifact.keyFileExcerpts.length > 0
      ? "Repo 1 includes concentrated high-signal files whose excerpts should anchor future proposal generation."
      : null,
    artifact.configFiles.some((path) => /composer\.json|artisan/i.test(path))
      ? "Repo 1 appears to use a PHP application framework with conventions outside the current V2 stack, so migration must preserve behavior rather than framework shape."
      : null,
  ].filter((item): item is string => Boolean(item));

  const interactionAndDesign = [
    routeFiles.length > componentFiles.length
      ? "Repo 1 appears relatively page-centric, which increases the risk of migrating UI shape too literally instead of extracting intent."
      : null,
    pathIncludes(componentFiles, /Table|Dashboard|Form|Modal|Wizard/i)
      ? "Repo 1 likely uses dashboard, table, form, or wizard patterns that should be translated into V2-native interactions rather than copied wholesale."
      : null,
    pathIncludes(componentFiles, /Chat|Editor|Viewer|Panel/i)
      ? "Repo 1 includes richer interactive surfaces whose underlying user goals should be preserved even if the UI shell changes in V2."
      : null,
    importantDirectoryPaths.some((path) => /views|livewire|pages/i.test(path))
      ? "Repo 1 likely mixes rendered views and framework-driven interaction patterns, so user experience should be translated into V2-native shells instead of copied directly."
      : null,
  ].filter((item): item is string => Boolean(item));

  const migrationRisks = [
    routeFiles.length >= 12
      ? "Repo 1 has enough route surface that a page-by-page migration would likely become sprawling and hard to govern."
      : null,
    pathIncludes(routeFiles, /admin|report/i)
      ? "Operational and reporting flows in Repo 1 may hide business-critical value that is easy to miss if migration focuses only on headline features."
      : null,
    pathIncludes(componentFiles, /Modal|Wizard|Table/i)
      ? "Legacy UI patterns may encode important decision points, but copying them literally into V2 would risk product drift."
      : null,
    modelFiles.length === 0
      ? "Weak explicit model structure would make it easier to lose domain intent during migration unless workflows are studied carefully."
      : null,
    artifact.configFiles.some((path) => /composer\.json|artisan/i.test(path))
      ? "Repo 1 appears to be implemented in a framework that differs significantly from Repo 2, so direct structural porting would be especially risky."
      : null,
  ].filter((item): item is string => Boolean(item));

  const nextStageGuidance = [
    "Use this study to break Repo 1 into migration candidates by workflow rather than by page count.",
    pathIncludes(routeFiles, /student|classroom|lesson|assessment/i)
      ? "Prioritize proposal generation around classroom, lesson, and assessment jobs because those likely represent user-visible value clusters."
      : null,
    pathIncludes(routeFiles, /admin|report|dashboard/i)
      ? "Treat admin and reporting surfaces as separate migration candidates so operator value is not lost behind feature headlines."
      : null,
    modelFiles.length > 0
      ? "Use the identified entities and models to anchor proposal generation around domain semantics instead of screen mimicry."
      : null,
    modelFiles.length === 0 && importantDirectoryPaths.length > 0
      ? "Where explicit model files are weak, use directories, controllers, views, and migrations to define proposal boundaries." 
      : null,
  ].filter((item): item is string => Boolean(item));

  const groundingReferences = [
    ...artifact.routeFiles.slice(0, 4),
    ...artifact.componentFiles.slice(0, 3),
    ...artifact.modelFiles.slice(0, 3),
    ...artifact.workflowFiles.slice(0, 2),
    ...artifact.keyFileExcerpts.map((entry) => entry.path).slice(0, 4),
  ];

  return {
    purpose,
    capabilities,
    coreWorkflows,
    importantEntities: entityHints.length > 0 ? entityHints : fallbackEntityHints,
    integrations,
    architectureShape,
    interactionAndDesign,
    migrationRisks,
    nextStageGuidance,
    groundingReferences,
  };
}

function buildSummaryFallback(fallbacks: ReturnType<typeof collectSourceFallbacks>) {
  const purpose = fallbacks.purpose[0] ?? "Repo 1 contains legacy product value that still needs to be understood carefully.";
  const workflow = fallbacks.coreWorkflows[0] ?? "Its workflow surface should be decomposed before proposing migrations.";
  const risk = fallbacks.migrationRisks[0] ?? "Direct UI copying would be risky.";

  return `${purpose} ${workflow} ${risk}`;
}

export async function generateSourceRepositoryStudy(
  artifact: RepositoryAnalysisArtifact,
): Promise<RepoStudyUnderstanding> {
  if (artifact.error) {
    throw new Error(artifact.error);
  }

  const exhaustiveTreeInsights = await generateExhaustiveRepositoryTreeInsights({
    artifact,
    repoLabel: "Repo 1 (RevEd V1)",
    focus: "This is the legacy migration source repository. Pay attention to legacy feature surface, workflows, data-bearing areas, operational areas, and any signs of tangled or sprawling implementation.",
  });

  const prompt = [
    "You are generating a deep source-repository study artifact for ProjectMapper.",
    "The repository under analysis is Repo 1, the legacy system whose value, workflows, and risks must be understood before migration planning.",
    `The full repository tree has already been reviewed exhaustively across ${exhaustiveTreeInsights.chunkCount} chunks covering ${artifact.totalFileCount} files and ${artifact.totalDirectoryCount} directories.`,
    "Be specific to the repository evidence below. Do not return generic software advice.",
    "Explain what the repo is, what it does, which workflows matter, which entities and integrations appear important, how the architecture is shaped, what the user experiences appear to be, and where migration risks or proposal candidates live.",
    "Optimize for future proposal generation. Call out value that should not be lost, tangled or sprawling areas, and natural sub-features that could become proposal candidates.",
    "Write in plain English with no markdown emphasis markers.",
    "Grounding references must cite actual paths or concrete repository findings from the artifact.",
    "Return valid JSON with these keys only:",
    "summary, purpose, capabilities, coreWorkflows, importantEntities, integrations, architectureShape, interactionAndDesign, migrationRisks, nextStageGuidance, groundingReferences",
    "Exhaustive repository tree digest based on every file path in the repo:",
    JSON.stringify(exhaustiveTreeInsights, null, 2),
    "Source repository analysis artifact:",
    buildPromptArtifact(artifact),
  ].join("\n\n");

  const raw = await generateGeminiJson<z.infer<typeof looseSourceRepositoryStudySchema>>({
    prompt,
    schema: looseSourceRepositoryStudySchema,
  });

  const fallbacks = collectSourceFallbacks(artifact);
  const fallbackReferences = [
    ...artifact.configFiles,
    ...artifact.routeFiles,
    ...artifact.componentFiles,
    ...artifact.modelFiles,
    ...artifact.aiFiles,
    ...artifact.workflowFiles,
    ...artifact.keyFileExcerpts.map((entry) => entry.path),
    ...fallbacks.groundingReferences,
  ];

  return sourceRepositoryStudySchema.parse({
    summary: normalizeText(raw.summary) || exhaustiveTreeInsights.summary || buildSummaryFallback(fallbacks),
    purpose: takeBounded("purpose", raw.purpose, 2, 6, [...exhaustiveTreeInsights.notableAreas, ...fallbacks.purpose]),
    capabilities: takeBounded("capabilities", raw.capabilities, 4, 10, [...exhaustiveTreeInsights.notableAreas, ...fallbacks.capabilities]),
    coreWorkflows: takeBounded("core workflows", raw.coreWorkflows, 3, 8, [...exhaustiveTreeInsights.workflowSignals, ...fallbacks.coreWorkflows]),
    importantEntities: takeBounded("important entities", raw.importantEntities, 3, 8, [...exhaustiveTreeInsights.notableAreas, ...fallbacks.importantEntities]),
    integrations: takeBounded("integrations", raw.integrations, 2, 8, fallbacks.integrations),
    architectureShape: takeBounded("architecture shape", raw.architectureShape, 3, 8, [...exhaustiveTreeInsights.architecturalSignals, ...fallbacks.architectureShape]),
    interactionAndDesign: takeBounded("interaction and design", raw.interactionAndDesign, 3, 8, [...exhaustiveTreeInsights.workflowSignals, ...fallbacks.interactionAndDesign]),
    migrationRisks: takeBounded("migration risks", raw.migrationRisks, 3, 8, [...exhaustiveTreeInsights.migrationRisks, ...fallbacks.migrationRisks]),
    nextStageGuidance: takeBounded("next-stage guidance", raw.nextStageGuidance, 3, 8, [...exhaustiveTreeInsights.workflowSignals, ...fallbacks.nextStageGuidance]),
    groundingReferences: takeBounded("grounding references", raw.groundingReferences, 4, 12, [...exhaustiveTreeInsights.groundingReferences, ...fallbackReferences]),
    confidenceNotes: [
      `Study incorporated exhaustive tree coverage across ${artifact.totalFileCount} files and ${artifact.totalDirectoryCount} directories.`,
      "This legacy study generator is retained for compatibility; the primary study path now uses the agentic multi-pass investigation loop.",
    ],
    openQuestions: [],
  });
}