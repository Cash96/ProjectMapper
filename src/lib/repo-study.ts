import type {
  RepositoryAnalysisArtifact,
  RepoStudyOperatorGuidanceEntry,
  RepoStudyRunRecord,
} from "@/domain/intelligence";
import type { RepositoryRecord } from "@/domain/project-mapper";
import { generateAgenticRepoStudy } from "@/lib/agentic-repo-study";
import { inspectGitHubRepository } from "@/lib/github";
import { buildRepositoryArtifact } from "@/lib/repository-analysis";
import { createRepoStudyRun, getLatestRepoStudyRun, readRepoStudyRun, updateRepoStudyRun } from "@/lib/repo-study-store";

function humanizePathName(path: string) {
  const fileName = path.split("/").pop() ?? path;
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
}

function collectImportantEntities(artifact: RepositoryAnalysisArtifact) {
  const modelDerived = artifact.modelFiles.slice(0, 6).map((path) => {
    const entity = humanizePathName(path);
    return `${entity} appears as a named domain concept in ${path}.`;
  });

  if (modelDerived.length > 0) {
    return modelDerived;
  }

  return artifact.keyFileExcerpts.slice(0, 4).map((entry) => {
    const concept = humanizePathName(entry.path);
    return `${concept} appears to be a meaningful implementation concept in ${entry.path}.`;
  });
}

function collectIntegrations(artifact: RepositoryAnalysisArtifact) {
  const combined = [
    ...artifact.configFiles,
    ...artifact.routeFiles,
    ...artifact.componentFiles,
    ...artifact.modelFiles,
    ...artifact.aiFiles,
    ...artifact.workflowFiles,
    ...artifact.keyFileExcerpts.map((entry) => entry.path),
  ].join("\n").toLowerCase();
  const integrationNotes = [
    combined.includes("auth") || combined.includes("login") ? "Authentication and access control are part of the repository surface." : null,
    combined.includes("mongo") || combined.includes("prisma") || combined.includes("postgres") || combined.includes("firebase")
      ? "The repository shows explicit persistence or database integration signals."
      : null,
    combined.includes("chat") || combined.includes("gemini") || combined.includes("ai")
      ? "The repository includes AI-related or conversational integration signals."
      : null,
    combined.includes("import") || combined.includes("integration") || combined.includes("sync")
      ? "The repository includes import or external integration workflow signals."
      : null,
  ].filter((item): item is string => Boolean(item));

  return integrationNotes.length > 0
    ? integrationNotes
    : ["The repository appears to depend on internal service and API boundaries that should be preserved during migration planning."];
}

function summarizeStudyRun(run: {
  repository: RepositoryRecord;
  artifact: RepositoryAnalysisArtifact;
  understandingReady: boolean;
  parentRun?: RepoStudyRunRecord | null;
}) {
  return [
    `${run.repository.name}: ${run.artifact.routeFiles.length} route files, ${run.artifact.componentFiles.length} component files, ${run.artifact.modelFiles.length} model/entity files were captured.`,
    `${run.repository.name}: ${run.artifact.workflowFiles.length} workflow-oriented files and ${run.artifact.aiFiles.length} AI-related files contributed to the study.`,
    run.parentRun
      ? `${run.repository.name}: this pass continued guided study from v${run.parentRun.version} using operator context and previous findings.`
      : `${run.repository.name}: this was a fresh study pass without prior guided context.`,
    run.understandingReady
      ? `${run.repository.name}: deep study understanding completed and is ready for operator review.`
      : `${run.repository.name}: deep study understanding did not complete.`,
  ];
}

async function getStudyLineage(run: RepoStudyRunRecord | null) {
  const lineage: RepoStudyRunRecord[] = [];
  let current = run;
  let guard = 0;

  while (current && guard < 6) {
    lineage.unshift(current);
    current = current.parentRunId ? await readRepoStudyRun(current.parentRunId) : null;
    guard += 1;
  }

  return lineage;
}

export async function appendOperatorGuidanceToStudyRun(input: {
  studyRunId: string;
  author: string;
  guidance: string;
}) {
  const entry: RepoStudyOperatorGuidanceEntry = {
    id: `guidance-${Date.now()}`,
    createdAt: new Date().toISOString(),
    author: input.author,
    guidance: input.guidance.trim(),
  };

  return updateRepoStudyRun(input.studyRunId, (run) => ({
    ...run,
    operatorGuidance: [...run.operatorGuidance, entry],
  }));
}

export async function runRepositoryStudy(input: {
  projectId: string;
  repository: RepositoryRecord;
  triggeredBy: string;
  continueFromRunId?: string;
}) {
  const parentRun = input.continueFromRunId ? await readRepoStudyRun(input.continueFromRunId) : null;

  if (parentRun && (parentRun.projectId !== input.projectId || parentRun.repositoryId !== input.repository.id)) {
    throw new Error("The requested study continuation does not belong to this repository.");
  }

  if (parentRun && parentRun.status !== "Complete") {
    throw new Error("Only a completed study run can be continued.");
  }

  const initialRun = await createRepoStudyRun({
    projectId: input.projectId,
    repositoryId: input.repository.id,
    repositoryName: input.repository.name,
    repositoryRole: input.repository.role,
    triggeredBy: input.triggeredBy,
    status: "Studying",
    startedAt: new Date().toISOString(),
    parentRunId: parentRun?.id ?? null,
    snapshotCommitSha: null,
    artifact: null,
    investigation: null,
    understanding: null,
    strategicImportance: [],
    highConfidenceAreas: [],
    weakConfidenceAreas: [],
    operatorQuestions: [],
    operatorGuidance: [],
    iterationDelta: null,
    summary: [`${input.repository.name}: study started.`],
  });

  const priorRuns = await getStudyLineage(parentRun);

  try {
    const artifact = await buildRepositoryArtifact(input.repository);

    if (artifact.error) {
      return updateRepoStudyRun(initialRun.id, (run) => ({
        ...run,
        status: "Failed",
        completedAt: new Date().toISOString(),
        snapshotCommitSha: artifact.latestCommitSha,
        artifact,
        investigation: null,
        understanding: null,
        strategicImportance: [],
        highConfidenceAreas: [],
        weakConfidenceAreas: [],
        operatorQuestions: [],
        iterationDelta: null,
        understandingError: artifact.error,
        failureMessage: artifact.error,
        summary: summarizeStudyRun({
          repository: input.repository,
          artifact,
          understandingReady: false,
          parentRun,
        }),
      }));
    }

    try {
      const result = await generateAgenticRepoStudy({ repository: input.repository, artifact, priorRuns });

      return updateRepoStudyRun(initialRun.id, (run) => ({
        ...run,
        status: "Complete",
        completedAt: new Date().toISOString(),
        snapshotCommitSha: artifact.latestCommitSha,
        artifact,
        investigation: result.investigation,
        understanding: {
          ...result.understanding,
          importantEntities: result.understanding.importantEntities.length > 0
            ? result.understanding.importantEntities
            : collectImportantEntities(artifact),
          integrations: result.understanding.integrations.length > 0
            ? result.understanding.integrations
            : collectIntegrations(artifact),
        },
        strategicImportance: result.strategicImportance,
        highConfidenceAreas: result.highConfidenceAreas,
        weakConfidenceAreas: result.weakConfidenceAreas,
        operatorQuestions: result.operatorQuestions,
        iterationDelta: result.iterationDelta,
        understandingError: undefined,
        failureMessage: undefined,
        summary: summarizeStudyRun({
          repository: input.repository,
          artifact,
          understandingReady: true,
          parentRun,
        }),
      }));
    } catch (error) {
      return updateRepoStudyRun(initialRun.id, (run) => ({
        ...run,
        status: "Failed",
        completedAt: new Date().toISOString(),
        snapshotCommitSha: artifact.latestCommitSha,
        artifact,
        investigation: null,
        understanding: null,
        strategicImportance: [],
        highConfidenceAreas: [],
        weakConfidenceAreas: [],
        operatorQuestions: [],
        iterationDelta: null,
        understandingError: error instanceof Error ? error.message : "Repo study failed.",
        failureMessage: error instanceof Error ? error.message : "Repo study failed.",
        summary: summarizeStudyRun({
          repository: input.repository,
          artifact,
          understandingReady: false,
          parentRun,
        }),
      }));
    }
  } catch (error) {
    return updateRepoStudyRun(initialRun.id, (run) => ({
      ...run,
      status: "Failed",
      completedAt: new Date().toISOString(),
      investigation: null,
      strategicImportance: [],
      highConfidenceAreas: [],
      weakConfidenceAreas: [],
      operatorQuestions: [],
      iterationDelta: null,
      understandingError: error instanceof Error ? error.message : "Repo study failed.",
      failureMessage: error instanceof Error ? error.message : "Repo study failed.",
      summary: [
        `${input.repository.name}: study failed before a usable understanding artifact was produced.`,
      ],
    }));
  }
}

export function getRepositoryStudyLabel(repository: RepositoryRecord) {
  return repository.role === "Source" ? "Study Repo 1" : "Study Repo 2";
}

export function getRepositoryStudyOrdinal(repository: RepositoryRecord) {
  return repository.role === "Source" ? "Repo 1" : "Repo 2";
}

export async function getRepositoryStudySnapshot(projectId: string, repository: RepositoryRecord) {
  const [latestRun, inspection] = await Promise.all([
    getLatestRepoStudyRun(projectId, repository.id),
    inspectGitHubRepository(repository.url),
  ]);

  const stale = Boolean(
    latestRun &&
      latestRun.status === "Complete" &&
      latestRun.snapshotCommitSha &&
      inspection.latestCommitSha &&
      latestRun.snapshotCommitSha !== inspection.latestCommitSha,
  );
  const usable = Boolean(latestRun?.status === "Complete" && latestRun.understanding && !stale);

  let statusLabel = "Not studied";
  let statusTone: "neutral" | "info" | "success" | "warning" | "danger" = "neutral";
  let statusDetail = `No study run exists yet for ${repository.name}.`;

  if (latestRun?.status === "Studying") {
    statusLabel = "Studying";
    statusTone = "info";
    statusDetail = `${repository.name} is currently being studied.`;
  } else if (latestRun?.status === "Queued") {
    statusLabel = "Queued";
    statusTone = "warning";
    statusDetail = `${repository.name} is queued for study.`;
  } else if (latestRun?.status === "Failed") {
    statusLabel = "Study failed";
    statusTone = "danger";
    statusDetail = latestRun.failureMessage ?? latestRun.understandingError ?? `${repository.name} study failed.`;
  } else if (stale) {
    statusLabel = "Study stale";
    statusTone = "warning";
    statusDetail = `${repository.name} has moved to a newer commit than the latest completed study snapshot.`;
  } else if (latestRun?.status === "Complete") {
    statusLabel = "Study complete";
    statusTone = "success";
    statusDetail = `${repository.name} has a usable completed study artifact.`;
  }

  return {
    latestRun,
    inspection,
    stale,
    usable,
    statusLabel,
    statusTone,
    statusDetail,
    latestVersionLabel: latestRun ? `v${latestRun.version}` : "None",
    lastStudiedAt: latestRun?.completedAt ?? latestRun?.startedAt ?? latestRun?.createdAt ?? null,
  };
}