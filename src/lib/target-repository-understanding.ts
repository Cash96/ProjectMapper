import { z } from "zod";

import type { RepositoryAnalysisArtifact, TargetRepositoryUnderstanding } from "@/domain/intelligence";
import { generateGeminiJson } from "@/lib/gemini";

const targetRepositoryUnderstandingSchema = z.object({
  summary: z.string().min(1),
  productGoals: z.array(z.string().min(1)).min(2).max(6),
  existingCapabilities: z.array(z.string().min(1)).min(4).max(10),
  architectureShape: z.array(z.string().min(1)).min(3).max(8),
  interactionModel: z.array(z.string().min(1)).min(3).max(8),
  designPhilosophy: z.array(z.string().min(1)).min(3).max(8),
  extensionGuidance: z.array(z.string().min(1)).min(3).max(8),
  migrationRisks: z.array(z.string().min(1)).min(3).max(8),
  groundingReferences: z.array(z.string().min(1)).min(4).max(12),
});

const looseTargetRepositoryUnderstandingSchema = z.object({
  summary: z.string().catch(""),
  productGoals: z.unknown().optional(),
  existingCapabilities: z.unknown().optional(),
  architectureShape: z.unknown().optional(),
  interactionModel: z.unknown().optional(),
  designPhilosophy: z.unknown().optional(),
  extensionGuidance: z.unknown().optional(),
  migrationRisks: z.unknown().optional(),
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
    const lead = [record.title, record.name, record.pattern, record.goal, record.risk]
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

function takeBounded(items: unknown, minimum: number, maximum: number, fallback: string[] = []) {
  const normalized = [...toListItems(items), ...fallback].map((item) => normalizeText(item));
  const unique = [...new Set(normalized.filter(Boolean))].slice(0, maximum);

  if (unique.length < minimum) {
    throw new Error(`RevEd V2 understanding generation returned too few items for a required section (needed ${minimum}).`);
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

function collectHeuristicFallbacks(artifact: RepositoryAnalysisArtifact) {
  const routeFiles = artifact.routeFiles;
  const componentFiles = artifact.componentFiles;
  const modelFiles = artifact.modelFiles;
  const aiFiles = artifact.aiFiles;
  const workflowFiles = artifact.workflowFiles;

  const productGoals = [
    pathIncludes(aiFiles, /chat|onboarding\/chat/i)
      ? "Keep AI assistance as a persistent part of the product workspace instead of an isolated add-on."
      : null,
    pathIncludes(routeFiles, /classrooms|students|assessments/i)
      ? "Support real classroom, student, and assessment operations inside one platform rather than as separate tools."
      : null,
    pathIncludes(componentFiles, /Artifact|Lesson|Slide|Worksheet|Quiz/i)
      ? "Create, edit, and deliver learning artifacts directly inside the product."
      : null,
    pathIncludes(modelFiles, /OrgUnit|DistrictProfile|ConsentRecord|Integration/i)
      ? "Operate with district and school governance concerns, not just consumer-style content generation."
      : null,
    pathIncludes(workflowFiles, /Tasks\//i)
      ? "Drive implementation through documented platform domains and explicit operational planning."
      : null,
    pathIncludes(aiFiles, /pinned\/\[domain\]|ChatPanel/i)
      ? "Keep AI conversations tied to ongoing product context instead of treating chat as a disposable one-off tool."
      : null,
  ].filter((item): item is string => Boolean(item));

  const existingCapabilities = [
    pathIncludes(aiFiles, /src\/app\/api\/chat|ChatPanel|useChat/i)
      ? "Repo B already contains a chat API and chat UI surface for AI-assisted workflows."
      : null,
    pathIncludes(componentFiles, /LessonPlanEditor|LessonTemplateEditor|WorksheetEditor|QuizEditor|SlideEditor/i)
      ? "Repo B already supports multiple interactive artifact editing flows."
      : null,
    pathIncludes(componentFiles, /ArtifactRenderer|InteractiveArtifactViewer|SlidePresenter/i)
      ? "Repo B already has a shared artifact rendering system that routes different content types through one product shell."
      : null,
    pathIncludes(routeFiles, /classrooms/i)
      ? "Repo B already has classroom routes and related workflow surfaces."
      : null,
    pathIncludes(routeFiles, /assessments/i)
      ? "Repo B already has assessment-oriented routes and result views."
      : null,
    pathIncludes(routeFiles, /admin\/students|admin\/org-tree|admin\/usage|admin\/import/i)
      ? "Repo B already includes administrative workflows for org structure, student records, usage, and imports."
      : null,
    pathIncludes(modelFiles, /ChatSession|Artifact|ArtifactVersion|AIJob|AIFund|Classroom/i)
      ? "Repo B already has persistent domain models for chat, artifacts, classrooms, and AI-related jobs or funding."
      : null,
  ].filter((item): item is string => Boolean(item));

  const architectureShape = [
    "Repo B is organized as a Next.js App Router application with route clusters under src/app.",
    pathIncludes(componentFiles, /src\/components\//i)
      ? "Behavior is split into reusable UI components rather than living only inside page files."
      : null,
    pathIncludes(modelFiles, /src\/models\//i)
      ? "Persistent domain state is modeled explicitly through dedicated model files."
      : null,
    pathIncludes(aiFiles, /src\/services\/|src\/app\/api\//i)
      ? "AI behavior is represented through both API routes and service-layer code, not just front-end prompts."
      : null,
    pathIncludes(componentFiles, /ArtifactRenderer/i)
      ? "Artifact experiences are intentionally funneled through a generic shell that delegates to type-specific renderers."
      : null,
    pathIncludes(workflowFiles, /Tasks\//i)
      ? "The repository carries a parallel task-documentation layer that describes system domains and implementation areas."
      : null,
  ].filter((item): item is string => Boolean(item));

  const interactionModel = [
    pathIncludes(aiFiles, /ChatPanel|ChatMessage|ChatInput|useChat/i)
      ? "The product favors a chat-native interaction loop with dedicated chat components and APIs."
      : null,
    pathIncludes(aiFiles, /pinned\/\[domain\]/i)
      ? "Chat history is designed to persist across domain contexts, which suggests AI should remain attached to ongoing workspace state."
      : null,
    pathIncludes(componentFiles, /InteractiveArtifactViewer|ArtifactRenderer|SlidePresenter/i)
      ? "Users appear to move between authoring, viewing, and presenting artifacts inside the same product surface."
      : null,
    pathIncludes(componentFiles, /OrgTreeViz/i)
      ? "At least some workflows use interactive panels or detail surfaces instead of static tables alone, such as the org-tree detail interaction."
      : null,
    pathIncludes(routeFiles, /admin|classrooms|assessments|learn/i)
      ? "The route structure suggests contextual work areas for different roles and domains rather than one flat page list."
      : null,
    pathIncludes(routeFiles, /layout\.tsx/i)
      ? "Shared layouts indicate the interface is meant to maintain ongoing workspace context across flows."
      : null,
  ].filter((item): item is string => Boolean(item));

  const designPhilosophy = [
    pathIncludes(aiFiles, /chat|gemini/i)
      ? "AI is treated as a native platform capability, not a bolt-on marketing feature."
      : null,
    pathIncludes(componentFiles, /Editor|Viewer|Renderer/i)
      ? "The design favors rich in-product tools over static content pages."
      : null,
    pathIncludes(componentFiles, /ArtifactRenderer|OrgTreeViz/i)
      ? "The UI appears to prefer reusable shells, contextual detail views, and dynamic renderers over one-off bespoke pages."
      : null,
    pathIncludes(modelFiles, /AuditLog|ConsentRecord|FeatureFlag|Integration/i)
      ? "The platform is designed with governance, traceability, and operational controls in mind."
      : null,
    pathIncludes(workflowFiles, /AUTH_AND_RBAC|COMPLIANCE|OBSERVABILITY|AI_ORCHESTRATION/i)
      ? "The repository prioritizes platform discipline such as RBAC, compliance, observability, and AI orchestration."
      : null,
  ].filter((item): item is string => Boolean(item));

  const extensionGuidance = [
    "New migration work should attach to an existing Repo B workflow instead of creating a standalone V1-shaped area by default.",
    pathIncludes(aiFiles, /chat/i)
      ? "If a migrated feature needs AI support, extend the existing chat and AI service surfaces instead of inventing a separate assistant path."
      : null,
    pathIncludes(aiFiles, /pinned\/\[domain\]/i)
      ? "If a migrated feature needs ongoing AI context, connect it to the existing pinned-domain chat pattern rather than creating a disconnected conversation surface."
      : null,
    pathIncludes(componentFiles, /Artifact|Editor|Viewer/i)
      ? "If the migrated feature produces or edits learning content, use the existing artifact and editor system as the integration point."
      : null,
    pathIncludes(componentFiles, /ArtifactRenderer/i)
      ? "Prefer extending the existing artifact renderer and panel shell patterns before introducing a feature-specific rendering framework."
      : null,
    pathIncludes(modelFiles, /Classroom|ChatSession|ArtifactVersion|Integration/i)
      ? "Map new capabilities onto existing models and service concepts before introducing new domain objects."
      : null,
  ].filter((item): item is string => Boolean(item));

  const migrationRisks = [
    pathIncludes(routeFiles, /admin\/|classrooms\/|assessments\//i)
      ? "A literal V1 port could create duplicate route trees that compete with already-existing domain areas in Repo B."
      : null,
    pathIncludes(aiFiles, /chat/i)
      ? "A migration that ignores the existing chat-native layer would likely break Repo B's intended interaction model."
      : null,
    pathIncludes(aiFiles, /pinned\/\[domain\]/i)
      ? "A migration that creates feature-specific chat silos would likely fight Repo B's persistent domain-aware conversation pattern."
      : null,
    pathIncludes(componentFiles, /Artifact|Editor|Viewer/i)
      ? "Rebuilding content workflows outside the existing artifact/editor stack would create structural drift."
      : null,
    pathIncludes(componentFiles, /OrgTreeViz|ArtifactRenderer/i)
      ? "Copying V1 page flows too literally could bypass Repo B's reusable panel and renderer patterns, leading to UX drift."
      : null,
    pathIncludes(modelFiles, /AuditLog|ConsentRecord|FeatureFlag|Integration/i)
      ? "Porting features without respecting Repo B's governance and integration models could bypass important operational constraints."
      : null,
  ].filter((item): item is string => Boolean(item));

  const groundingReferences = [
    ...artifact.routeFiles.slice(0, 4),
    ...artifact.componentFiles.slice(0, 4),
    ...artifact.aiFiles.slice(0, 2),
    ...artifact.modelFiles.slice(0, 2),
  ];

  return {
    productGoals,
    existingCapabilities,
    architectureShape,
    interactionModel,
    designPhilosophy,
    extensionGuidance,
    migrationRisks,
    groundingReferences,
  };
}

function buildSummaryFallback(fallbacks: ReturnType<typeof collectHeuristicFallbacks>) {
  const goal = fallbacks.productGoals[0] ?? "Repo B appears to be a substantial destination system.";
  const capability = fallbacks.existingCapabilities[0] ?? "It already contains meaningful product workflows.";
  const philosophy = fallbacks.designPhilosophy[0] ?? "Migration work should preserve its existing product identity.";

  return `${goal} ${capability} ${philosophy}`;
}

export async function generateTargetRepositoryUnderstanding(
  artifact: RepositoryAnalysisArtifact,
): Promise<TargetRepositoryUnderstanding> {
  if (artifact.error) {
    throw new Error(artifact.error);
  }

  const prompt = [
    "You are generating a deep target-repository understanding artifact for ProjectMapper.",
    "The repository under analysis is Repo B, the destination system that must be protected during migration.",
    "Infer the repository's goals, existing capabilities, architecture shape, interaction model, design philosophy, extension guidance, and migration risks.",
    "Be specific to the repository evidence below. Do not return generic software advice.",
    "Write in plain English with no markdown emphasis markers, no headings inside list items, and no generic web-app boilerplate.",
    "If the evidence indicates persistent chat, contextual panels, shared artifact shells, or admin governance flows, call those out explicitly.",
    "Focus on what would matter for migrating features into this repository without causing product drift.",
    "Assume future AI work must use this understanding before proposing or executing any migration work from Repo A.",
    "Grounding references must cite actual paths or concrete repository findings from the artifact.",
    "Return valid JSON with these keys only:",
    "summary, productGoals, existingCapabilities, architectureShape, interactionModel, designPhilosophy, extensionGuidance, migrationRisks, groundingReferences",
    "Target repository analysis artifact:",
    buildPromptArtifact(artifact),
  ].join("\n\n");

  const raw = await generateGeminiJson<z.infer<typeof looseTargetRepositoryUnderstandingSchema>>({
    prompt,
    schema: looseTargetRepositoryUnderstandingSchema,
  });

  const fallbacks = collectHeuristicFallbacks(artifact);

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

  return targetRepositoryUnderstandingSchema.parse({
    summary: normalizeText(raw.summary) || buildSummaryFallback(fallbacks),
    productGoals: takeBounded(raw.productGoals, 2, 6, fallbacks.productGoals),
    existingCapabilities: takeBounded(raw.existingCapabilities, 4, 10, fallbacks.existingCapabilities),
    architectureShape: takeBounded(raw.architectureShape, 3, 8, fallbacks.architectureShape),
    interactionModel: takeBounded(raw.interactionModel, 3, 8, fallbacks.interactionModel),
    designPhilosophy: takeBounded(raw.designPhilosophy, 3, 8, fallbacks.designPhilosophy),
    extensionGuidance: takeBounded(raw.extensionGuidance, 3, 8, fallbacks.extensionGuidance),
    migrationRisks: takeBounded(raw.migrationRisks, 3, 8, fallbacks.migrationRisks),
    groundingReferences: takeBounded(raw.groundingReferences, 4, 12, fallbackReferences),
  });
}