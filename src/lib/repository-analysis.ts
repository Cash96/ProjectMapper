import type { RepositoryRecord } from "@/domain/project-mapper";
import type { AnalysisDirectorySummary, RepositoryAnalysisArtifact } from "@/domain/intelligence";
import { createAnalysisRun } from "@/lib/analysis-store";
import { getGitHubRepositoryFileText, getGitHubRepositoryTree, inspectGitHubRepository } from "@/lib/github";
import { generateTargetRepositoryUnderstanding } from "@/lib/target-repository-understanding";

const IMPORTANT_DIRECTORY_HINTS = [
  "src",
  "app",
  "routes",
  "resources",
  "views",
  "controllers",
  "database",
  "migrations",
  "config",
  "public",
  "pages",
  "components",
  "lib",
  "models",
  "entities",
  "schema",
  "prompts",
  "ai",
  "workflows",
  "features",
  "api",
  "server",
];

const WORKFLOW_HINTS = [
  "auth",
  "login",
  "dashboard",
  "student",
  "teacher",
  "admin",
  "classroom",
  "lesson",
  "assignment",
  "assessment",
  "grade",
  "curriculum",
  "plan",
  "onboard",
  "report",
  "task",
  "project",
  "chat",
  "panel",
];

const PREFERRED_KEY_PATHS = [
  "src/app/(app)/AppLayoutClient.tsx",
  "src/components/chat/ChatPanel.tsx",
  "src/components/artifacts/ArtifactRenderer.tsx",
  "src/models/AIJob.ts",
  "Tasks/05_CORE_PLATFORM_FEATURES.md",
  "Tasks/15_ADMIN_AND_UX.md",
];

type TreeEntry = {
  path: string;
  type: "blob" | "tree";
};

function uniqueLimit(items: string[], limit: number) {
  return [...new Set(items)].slice(0, limit);
}

function isConfigFile(path: string) {
  return [
    "package.json",
    "package-lock.json",
    "composer.json",
    "composer.lock",
    "artisan",
    "tsconfig.json",
    "next.config",
    "vite.config",
    "tailwind.config",
    "postcss.config",
    "eslint.config",
    "phpunit.xml",
    "phpunit.xml.dist",
    "README.md",
    "Dockerfile",
    ".env.example",
    "playwright.config",
  ].some((segment) => path.endsWith(segment) || path.includes(`${segment}.`));
}

function isRouteFile(path: string) {
  return (
    /(^|\/)src\/app\/.+\/(page|layout|loading|error)\.(ts|tsx|js|jsx|mdx)$/i.test(path) ||
    /(^|\/)src\/app\/api\/.+\/route\.(ts|tsx|js|jsx)$/i.test(path) ||
    /(^|\/)pages\/.+\.(ts|tsx|js|jsx)$/i.test(path) ||
    /(^|\/)routes\/.+\.php$/i.test(path) ||
    /(^|\/)app\/Http\/Controllers\/.+\.php$/i.test(path) ||
    /(^|\/)resources\/(views|js\/Pages|ts\/Pages)\/.+\.(blade\.php|php|ts|tsx|js|jsx|vue)$/i.test(path) ||
    /(^|\/)app\/routes\/.+\.py$/i.test(path)
  );
}

function isComponentFile(path: string) {
  return (
    /(^|\/)(components|ui)\/.+\.(ts|tsx|js|jsx)$/i.test(path) ||
    /(^|\/)resources\/(js|ts)\/(components|widgets)\/.+\.(ts|tsx|js|jsx|vue)$/i.test(path) ||
    /(^|\/)resources\/views\/.+\.(blade\.php|php)$/i.test(path) ||
    /(^|\/)app\/(Livewire|View\/Components)\/.+\.php$/i.test(path) ||
    /(^|\/)app\/(templates|static\/js)\/.+/i.test(path)
  );
}

function isModelFile(path: string) {
  return (
    /(^|\/)(models?|entities|schema|schemas|types|domain)\/.+\.(ts|tsx|js|jsx|prisma)$/i.test(path) ||
    /(^|\/)app\/Models\/.+\.php$/i.test(path) ||
    /(^|\/)database\/migrations\/.+\.php$/i.test(path) ||
    /(^|\/)app\/(Enums|Data|Domain)\/.+\.php$/i.test(path) ||
    /(^|\/)app\/data\/.+\.py$/i.test(path)
  );
}

function isAiFile(path: string) {
  return /(^|\/)(ai|prompt|prompts|llm|agent|agents|assistant|chat|ai_training)\/.+/i.test(path) || /ai_|chat|prompt/i.test(path);
}

function isWorkflowFile(path: string) {
  return WORKFLOW_HINTS.some((hint) => path.toLowerCase().includes(hint));
}

function summarizeExcerpt(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, 18);

  return lines.join("\n").slice(0, 1600);
}

function buildImportantDirectories(tree: TreeEntry[]) {
  const directories = tree.filter((entry) => entry.type === "tree").map((entry) => entry.path);
  const matched = directories.filter((path) => {
    const firstSegment = path.split("/")[0]?.toLowerCase() ?? "";
    return IMPORTANT_DIRECTORY_HINTS.includes(firstSegment) || IMPORTANT_DIRECTORY_HINTS.some((hint) => path.toLowerCase().includes(`/${hint}`));
  });

  return uniqueLimit(matched, 8).map<AnalysisDirectorySummary>((path) => {
    const samplePaths = tree
      .filter((entry) => entry.path.startsWith(`${path}/`) && entry.type === "blob")
      .map((entry) => entry.path)
      .slice(0, 4);

    return {
      path,
      note: `${samplePaths.length > 0 ? "Contains" : "References"} high-signal implementation files.`,
      samplePaths,
    };
  });
}

function collectPreferredKeyPaths(filePaths: string[]) {
  return PREFERRED_KEY_PATHS.filter((path) => filePaths.includes(path));
}

export async function buildRepositoryArtifact(repository: RepositoryRecord): Promise<RepositoryAnalysisArtifact> {
  const inspection = await inspectGitHubRepository(repository.url);
  const analyzedAt = new Date().toISOString();

  if (!inspection.reachable) {
    return {
      repositoryId: repository.id,
      repositoryName: repository.name,
      role: repository.role,
      fullName: inspection.fullName,
      htmlUrl: inspection.htmlUrl,
      defaultBranch: inspection.defaultBranch,
      visibility: inspection.visibility,
      latestCommitSha: inspection.latestCommitSha,
      analyzedAt,
      totalFileCount: 0,
      totalDirectoryCount: 0,
      topLevelEntries: [],
      allFilePaths: [],
      importantDirectories: [],
      configFiles: [],
      routeFiles: [],
      componentFiles: [],
      modelFiles: [],
      aiFiles: [],
      workflowFiles: [],
      keyFileExcerpts: [],
      notes: ["Repository analysis could not continue because GitHub inspection failed."],
      error: inspection.error,
    };
  }

  const tree = await getGitHubRepositoryTree(
    repository.url,
    inspection.latestCommitSha || inspection.defaultBranch,
  );
  const filePaths = tree.filter((entry) => entry.type === "blob").map((entry) => entry.path);
  const totalDirectoryCount = tree.filter((entry) => entry.type === "tree").length;
  const topLevelEntries = uniqueLimit(tree.map((entry) => entry.path.split("/")[0] ?? entry.path), 20);
  const configFiles = uniqueLimit(filePaths.filter(isConfigFile), 12);
  const routeFiles = uniqueLimit(filePaths.filter(isRouteFile), 18);
  const componentFiles = uniqueLimit(filePaths.filter(isComponentFile), 18);
  const modelFiles = uniqueLimit(filePaths.filter(isModelFile), 18);
  const aiFiles = uniqueLimit(filePaths.filter(isAiFile), 18);
  const workflowFiles = uniqueLimit(filePaths.filter(isWorkflowFile), 18);
  const keyFilePaths = uniqueLimit(
    [
      ...collectPreferredKeyPaths(filePaths),
      ...configFiles.slice(0, 3),
      ...routeFiles.slice(0, 3),
      ...componentFiles.slice(0, 2),
      ...modelFiles.slice(0, 2),
      ...aiFiles.slice(0, 2),
      ...workflowFiles.slice(0, 3),
    ].filter(Boolean),
    12,
  );

  const keyFileExcerpts = await Promise.all(
    keyFilePaths.map(async (path) => {
      const content = await getGitHubRepositoryFileText(repository.url, path, inspection.defaultBranch);

      if (!content) {
        return null;
      }

      let reason = "High-signal workflow file";

      if (configFiles.includes(path)) {
        reason = "Configuration entry point";
      } else if (routeFiles.includes(path)) {
        reason = "Route or layout surface";
      } else if (componentFiles.includes(path)) {
        reason = "Component or view surface";
      } else if (modelFiles.includes(path)) {
        reason = "Model or entity surface";
      } else if (aiFiles.includes(path)) {
        reason = "AI or prompt-related implementation";
      }

      return {
        path,
        reason,
        excerpt: summarizeExcerpt(content),
      };
    }),
  );

  return {
    repositoryId: repository.id,
    repositoryName: repository.name,
    role: repository.role,
    fullName: inspection.fullName,
    htmlUrl: inspection.htmlUrl,
    defaultBranch: inspection.defaultBranch,
    visibility: inspection.visibility,
    latestCommitSha: inspection.latestCommitSha,
    analyzedAt,
    totalFileCount: filePaths.length,
    totalDirectoryCount,
    topLevelEntries,
    allFilePaths: filePaths,
    importantDirectories: buildImportantDirectories(tree),
    configFiles,
    routeFiles,
    componentFiles,
    modelFiles,
    aiFiles,
    workflowFiles,
    keyFileExcerpts: keyFileExcerpts.filter((entry) => entry !== null),
    notes: [
      `${routeFiles.length} route and layout files matched high-signal patterns.`,
      `${componentFiles.length} component files and ${modelFiles.length} model/entity files were identified.`,
      `${aiFiles.length} AI or prompt-related files were identified through path-based extraction.`,
    ],
  };
}

function summarizeRun(run: {
  repoA: RepositoryAnalysisArtifact;
  repoB: RepositoryAnalysisArtifact;
  targetUnderstandingReady: boolean;
}) {
  return [
    `${run.repoA.repositoryName}: ${run.repoA.routeFiles.length} route files, ${run.repoA.workflowFiles.length} workflow files, ${run.repoA.aiFiles.length} AI-related files.`,
    `${run.repoB.repositoryName}: ${run.repoB.routeFiles.length} route files, ${run.repoB.componentFiles.length} components, ${run.repoB.modelFiles.length} model/entity files.`,
    run.targetUnderstandingReady
      ? `${run.repoB.repositoryName}: deep repository understanding completed for migration grounding.`
      : `${run.repoB.repositoryName}: deep repository understanding did not complete.`,
  ];
}

export async function runProjectAnalysis(input: {
  projectId: string;
  repositories: RepositoryRecord[];
  triggeredBy: string;
}) {
  const repoA = input.repositories.find((repository) => repository.role === "Source");
  const repoB = input.repositories.find((repository) => repository.role === "Target");

  if (!repoA || !repoB) {
    throw new Error("Both source and target repositories are required for analysis.");
  }

  const [sourceArtifact, targetArtifact] = await Promise.all([
    buildRepositoryArtifact(repoA),
    buildRepositoryArtifact(repoB),
  ]);

  let targetRepositoryUnderstanding = null;
  let targetRepositoryUnderstandingError: string | undefined;

  if (!targetArtifact.error) {
    try {
      targetRepositoryUnderstanding = await generateTargetRepositoryUnderstanding(targetArtifact);
    } catch (error) {
      targetRepositoryUnderstandingError = error instanceof Error
        ? error.message
        : "RevEd V2 understanding generation failed.";
    }
  }

  const status = sourceArtifact.error || targetArtifact.error || targetRepositoryUnderstandingError ? "Failed" : "Complete";

  return createAnalysisRun({
    projectId: input.projectId,
    triggeredBy: input.triggeredBy,
    status,
    repoA: sourceArtifact,
    repoB: targetArtifact,
    targetRepositoryUnderstanding,
    targetRepositoryUnderstandingError,
    summary: summarizeRun({
      repoA: sourceArtifact,
      repoB: targetArtifact,
      targetUnderstandingReady: Boolean(targetRepositoryUnderstanding),
    }),
  });
}