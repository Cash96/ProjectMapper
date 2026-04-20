import type { RepositoryRecord } from "@/domain/project-mapper";
import type { AnalysisDirectorySummary, AnalysisRunRecord, RepositoryAnalysisArtifact } from "@/domain/intelligence";
import { createAnalysisRun } from "@/lib/analysis-store";
import { getGitHubRepositoryFileText, getGitHubRepositoryTree, inspectGitHubRepository } from "@/lib/github";

const IMPORTANT_DIRECTORY_HINTS = [
  "src",
  "app",
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
  "classroom",
  "lesson",
  "curriculum",
  "plan",
  "onboard",
  "report",
  "task",
  "project",
  "chat",
  "panel",
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
    "tsconfig.json",
    "next.config",
    "tailwind.config",
    "postcss.config",
    "eslint.config",
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
    /(^|\/)pages\/.+\.(ts|tsx|js|jsx)$/i.test(path)
  );
}

function isComponentFile(path: string) {
  return /(^|\/)(components|ui)\/.+\.(ts|tsx|js|jsx)$/i.test(path);
}

function isModelFile(path: string) {
  return /(^|\/)(models?|entities|schema|schemas|types|domain)\/.+\.(ts|tsx|js|jsx|prisma)$/i.test(path);
}

function isAiFile(path: string) {
  return /(^|\/)(ai|prompt|prompts|llm|agent|agents|assistant|chat)\/.+/i.test(path);
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

async function buildRepositoryArtifact(repository: RepositoryRecord): Promise<RepositoryAnalysisArtifact> {
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
      topLevelEntries: [],
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
  const topLevelEntries = uniqueLimit(tree.map((entry) => entry.path.split("/")[0] ?? entry.path), 20);
  const configFiles = uniqueLimit(filePaths.filter(isConfigFile), 12);
  const routeFiles = uniqueLimit(filePaths.filter(isRouteFile), 18);
  const componentFiles = uniqueLimit(filePaths.filter(isComponentFile), 18);
  const modelFiles = uniqueLimit(filePaths.filter(isModelFile), 18);
  const aiFiles = uniqueLimit(filePaths.filter(isAiFile), 18);
  const workflowFiles = uniqueLimit(filePaths.filter(isWorkflowFile), 18);
  const keyFilePaths = uniqueLimit(
    [
      ...configFiles.slice(0, 3),
      ...routeFiles.slice(0, 3),
      ...workflowFiles.slice(0, 3),
    ].filter(Boolean),
    8,
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
    topLevelEntries,
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

function summarizeRun(run: { repoA: RepositoryAnalysisArtifact; repoB: RepositoryAnalysisArtifact }) {
  return [
    `${run.repoA.repositoryName}: ${run.repoA.routeFiles.length} route files, ${run.repoA.workflowFiles.length} workflow files, ${run.repoA.aiFiles.length} AI-related files.`,
    `${run.repoB.repositoryName}: ${run.repoB.routeFiles.length} route files, ${run.repoB.componentFiles.length} components, ${run.repoB.modelFiles.length} model/entity files.`,
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

  const status = sourceArtifact.error || targetArtifact.error ? "Failed" : "Complete";

  return createAnalysisRun({
    projectId: input.projectId,
    triggeredBy: input.triggeredBy,
    status,
    repoA: sourceArtifact,
    repoB: targetArtifact,
    summary: summarizeRun({ repoA: sourceArtifact, repoB: targetArtifact }),
  });
}