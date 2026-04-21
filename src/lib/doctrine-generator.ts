import { z } from "zod";

import type { DoctrineDraftContent, RepoStudyRunRecord } from "@/domain/intelligence";
import type { ProjectRecord } from "@/domain/project-mapper";
import { generateGeminiJson } from "@/lib/gemini";

const doctrineDraftSchema = z.object({
  summary: z.string().min(1),
  productDoctrine: z.array(z.string().min(1)).min(4).max(10),
  interactionModel: z.array(z.string().min(1)).min(4).max(10),
  migrationRules: z.array(z.string().min(1)).min(4).max(10),
  featureDesignRules: z.array(z.string().min(1)).min(4).max(10),
  antiPatterns: z.array(z.string().min(1)).min(3).max(8),
  technicalConstraints: z.array(z.string().min(1)).min(3).max(8),
  groundingReferences: z.array(z.string().min(1)).min(4).max(12),
});

const looseDoctrineDraftSchema = z.object({
  summary: z.string().catch(""),
  productDoctrine: z.unknown().optional(),
  interactionModel: z.unknown().optional(),
  migrationRules: z.unknown().optional(),
  featureDesignRules: z.unknown().optional(),
  antiPatterns: z.unknown().optional(),
  technicalConstraints: z.unknown().optional(),
  groundingReferences: z.unknown().optional(),
  architecturePatterns: z.unknown().optional(),
  uxPatterns: z.unknown().optional(),
  interactionPatterns: z.unknown().optional(),
  criticalRules: z.unknown().optional(),
});

const PRODUCT_DOCTRINE_FALLBACK = [
  "RevEd V2 is a chat-native, artifact-driven educational platform where AI is a collaborator in the core workflow, not an optional enhancement layered on later.",
  "The product should feel like guided co-creation: users steer intent, AI helps generate and refine, and durable outputs remain editable after generation.",
  "RevEd V2 should unify work into shared systems instead of spawning isolated product islands for each new feature or migration target.",
  "Product decisions should optimize for reusable V2-native capability, operator control, and educational value rather than reproducing legacy implementation form.",
];

const INTERACTION_MODEL_FALLBACK = [
  "Chat is a primary interface for directing work, generating content, and iterating with AI; it is not a support widget or secondary helper.",
  "Panels are contextual workspaces that support the current task and should extend the main workflow without turning into disconnected mini-products.",
  "Artifacts are persistent, editable outputs of AI plus user collaboration and should anchor any workflow whose result has durable value.",
  "Good V2 interactions move fluidly between chat, panels, and artifacts instead of forcing users through isolated one-off screens.",
];

const MIGRATION_RULES_FALLBACK = [
  "Preserve user outcomes, workflow intent, and differentiating product value from V1 without preserving route trees, page sprawl, or legacy implementation detail.",
  "Every migration decision should ask what the core capability is and how it should exist if RevEd V2 were designed from scratch today.",
  "Prefer reinterpretation, simplification, and unification into V2-native systems over literal feature copying.",
  "When V1 behavior conflicts with the chat, panel, and artifact model, adapt the behavior into the V2 interaction system instead of dragging legacy structure forward.",
];

const FEATURE_DESIGN_RULES_FALLBACK = [
  "Use artifacts for outputs users must revisit, edit, compare, assign, govern, or share over time.",
  "Use panels for contextual editing, inspection, or secondary controls that support a primary chat or artifact workflow.",
  "Use chat workflows when the feature is fundamentally about AI-guided generation, refinement, synthesis, or decision support.",
  "Use backend systems and pipelines when work is operational, asynchronous, or integrative, but surface user-facing value through shared V2 interaction patterns.",
];

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

function collectReferenceFallbacks(run: RepoStudyRunRecord) {
  const artifact = run.artifact;

  if (!artifact) {
    return [];
  }

  return [
    ...artifact.configFiles,
    ...artifact.routeFiles,
    ...artifact.componentFiles,
    ...artifact.modelFiles,
    ...artifact.aiFiles,
    ...artifact.workflowFiles,
    ...artifact.keyFileExcerpts.map((entry) => entry.path),
    ...(run.understanding?.groundingReferences ?? []),
  ];
}

function getLegacyDoctrineItems(raw: z.infer<typeof looseDoctrineDraftSchema>) {
  return {
    architecturePatterns: toDoctrineListItem(raw.architecturePatterns),
    uxPatterns: toDoctrineListItem(raw.uxPatterns),
    interactionPatterns: toDoctrineListItem(raw.interactionPatterns),
    criticalRules: toDoctrineListItem(raw.criticalRules),
  };
}

function normalizeDoctrineDraft(
  raw: z.infer<typeof looseDoctrineDraftSchema>,
  repoStudyRun: RepoStudyRunRecord,
): DoctrineDraftContent {
  const legacy = getLegacyDoctrineItems(raw);
  const productDoctrine = toDoctrineListItem(raw.productDoctrine);
  const interactionModel = toDoctrineListItem(raw.interactionModel);
  const migrationRules = toDoctrineListItem(raw.migrationRules);
  const featureDesignRules = toDoctrineListItem(raw.featureDesignRules);
  const antiPatterns = toDoctrineListItem(raw.antiPatterns);
  const technicalConstraints = toDoctrineListItem(raw.technicalConstraints);
  const nestedReferences = [
    raw.productDoctrine,
    raw.interactionModel,
    raw.migrationRules,
    raw.featureDesignRules,
    raw.antiPatterns,
    raw.technicalConstraints,
    raw.architecturePatterns,
    raw.uxPatterns,
    raw.interactionPatterns,
    raw.criticalRules,
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
  const referenceFallbacks = collectReferenceFallbacks(repoStudyRun);

  return doctrineDraftSchema.parse({
    summary: normalizeText(raw.summary) || "RevEd V2 doctrine governs product identity, interaction model, migration interpretation, feature design, and the technical constraints that future proposals and builds must respect.",
    productDoctrine: takeBounded(productDoctrine, 4, 10, [
      ...legacy.architecturePatterns,
      ...legacy.uxPatterns,
      ...PRODUCT_DOCTRINE_FALLBACK,
    ]),
    interactionModel: takeBounded(interactionModel, 4, 10, [
      ...legacy.uxPatterns,
      ...legacy.interactionPatterns,
      ...INTERACTION_MODEL_FALLBACK,
    ]),
    migrationRules: takeBounded(migrationRules, 4, 10, [
      ...legacy.interactionPatterns,
      ...legacy.criticalRules,
      ...MIGRATION_RULES_FALLBACK,
    ]),
    featureDesignRules: takeBounded(featureDesignRules, 4, 10, [
      ...legacy.criticalRules,
      ...FEATURE_DESIGN_RULES_FALLBACK,
    ]),
    antiPatterns: takeBounded(antiPatterns, 3, 8),
    technicalConstraints: takeBounded(technicalConstraints, 3, 8, [
      ...legacy.architecturePatterns,
      ...legacy.criticalRules,
      "Do not break AI orchestration, async job boundaries, artifact schema integrity, standards ingestion, RBAC, or multi-tenant quota enforcement.",
      "Treat technical systems as constraints that protect V2 product behavior, not as excuses to recreate legacy workflows.",
    ]),
    groundingReferences: takeBounded(
      [...toDoctrineListItem(raw.groundingReferences), ...nestedReferences],
      4,
      12,
      referenceFallbacks,
    ),
  });
}

function formatArtifactForPrompt(run: RepoStudyRunRecord) {
  const artifact = run.artifact;

  if (!artifact) {
    throw new Error("A Repo 2 study artifact is required before doctrine generation can continue.");
  }

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
      repoStudyUnderstanding: run.understanding,
      notes: artifact.notes,
    },
    null,
    2,
  );
}

export async function generateDoctrineDraft(input: {
  project: ProjectRecord;
  repoStudyRun: RepoStudyRunRecord;
  operatorFeedback?: string;
}) {
  if (input.repoStudyRun.status !== "Complete") {
    throw new Error("A complete Repo 2 study is required before doctrine generation can continue.");
  }

  if (input.repoStudyRun.artifact?.error) {
    throw new Error(input.repoStudyRun.artifact.error);
  }

  if (!input.repoStudyRun.understanding) {
    throw new Error("Run a complete and usable Repo 2 study before doctrine generation can continue.");
  }

  const prompt = [
    "You are generating doctrine for ProjectMapper.",
    "The doctrine must be grounded in the Repo 2 study findings only.",
    "Do not return generic software best practices or a repository summary.",
    "The primary output is product doctrine, not architecture explanation.",
    "Write this as the governing decision layer for future feature proposals and builds.",
    "Prioritize product identity, interaction philosophy, migration interpretation, and feature design rules over implementation description.",
    "Be explicit that RevEd V2 is chat-native, panel-based, and artifact-driven, with AI acting as a collaborator in the primary workflow.",
    "Be explicit that migration should preserve outcomes and value, not routes, page structures, or legacy implementation form.",
    "Define what good V2-native features look like and what bad migrations must be rejected.",
    "Compress technical doctrine into strict constraints that must not be broken, not a long system explanation.",
    "Every item must be specific to Repo 2 product behavior and repository evidence below.",
    "Grounding references must cite actual paths or concrete findings from the analysis artifact.",
    `Project mission: ${input.project.mission}`,
    input.operatorFeedback ? `Operator feedback for this generation: ${input.operatorFeedback}` : "",
    "Return valid JSON with these keys only:",
    "summary, productDoctrine, interactionModel, migrationRules, featureDesignRules, antiPatterns, technicalConstraints, groundingReferences",
    "Output requirements:",
    "- summary should be concise, high signal, and decision-oriented",
    "- productDoctrine should define what RevEd V2 fundamentally is and what makes it AI-first in practice",
    "- interactionModel should clearly govern the chat plus panel plus artifact model",
    "- migrationRules should explain how V1 capabilities must be translated into V2-native form",
    "- featureDesignRules should define when to use chat flows, panels, artifacts, or backend systems",
    "- antiPatterns must include product-level bad migrations such as recreating V1 page sprawl or bypassing shared interaction systems",
    "- technicalConstraints should be shorter than product doctrine and phrased as systems that must not break",
    "Repo 2 study artifact:",
    formatArtifactForPrompt(input.repoStudyRun),
  ]
    .filter(Boolean)
    .join("\n\n");

  const rawDoctrineDraft = await generateGeminiJson<z.infer<typeof looseDoctrineDraftSchema>>({
    prompt,
    schema: looseDoctrineDraftSchema,
  });

  return normalizeDoctrineDraft(rawDoctrineDraft, input.repoStudyRun);
}