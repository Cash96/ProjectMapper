import type { RepoStudyRunRecord } from "@/domain/intelligence";
import { getMongoClient } from "@/lib/mongodb";

const DB_NAME = "project_mapper";
const COLLECTION_NAME = "repo_study_runs";

declare global {
  var __projectMapperRepoStudyRuns: Map<string, RepoStudyRunRecord[]> | undefined;
}

function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

function withRepoStudyDefaults(run: Partial<RepoStudyRunRecord>): RepoStudyRunRecord {
  return {
    id: run.id ?? "unknown-study-run",
    projectId: run.projectId ?? "unknown-project",
    repositoryId: run.repositoryId ?? "unknown-repository",
    repositoryName: run.repositoryName ?? "Unknown repository",
    repositoryRole: run.repositoryRole ?? "Source",
    version: run.version ?? 0,
    createdAt: run.createdAt ?? new Date(0).toISOString(),
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    triggeredBy: run.triggeredBy ?? "unknown",
    status: run.status ?? "Failed",
    parentRunId: run.parentRunId ?? null,
    snapshotCommitSha: run.snapshotCommitSha ?? null,
    artifact: run.artifact ?? null,
    investigation: run.investigation ?? null,
    understanding: run.understanding ?? null,
    strategicImportance: run.strategicImportance ?? [],
    highConfidenceAreas: run.highConfidenceAreas ?? [],
    weakConfidenceAreas: run.weakConfidenceAreas ?? [],
    operatorQuestions: run.operatorQuestions ?? [],
    operatorGuidance: run.operatorGuidance ?? [],
    iterationDelta: run.iterationDelta ?? null,
    understandingError: run.understandingError,
    failureMessage: run.failureMessage,
    summary: run.summary ?? [],
  };
}

function sanitizeRepoStudyRun(run: RepoStudyRunRecord & { _id?: unknown }) {
  const rest = { ...run };
  delete rest._id;
  return structuredClone(withRepoStudyDefaults(rest));
}

function getFallbackStore() {
  if (!global.__projectMapperRepoStudyRuns) {
    global.__projectMapperRepoStudyRuns = new Map();
  }

  return global.__projectMapperRepoStudyRuns;
}

function getStudyKey(projectId: string, repositoryId: string) {
  return `${projectId}:${repositoryId}`;
}

async function getRepoStudyRunsCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection<RepoStudyRunRecord & { _id?: unknown }>(COLLECTION_NAME);
}

export async function readRepoStudyRun(studyId: string) {
  if (isMongoConfigured()) {
    const collection = await getRepoStudyRunsCollection();
    const run = await collection.findOne({ id: studyId });
    return run ? sanitizeRepoStudyRun(run) : null;
  }

  for (const runs of getFallbackStore().values()) {
    const run = runs.find((entry) => entry.id === studyId);

    if (run) {
      return structuredClone(withRepoStudyDefaults(run));
    }
  }

  return null;
}

export async function getRecentRepoStudyRuns(projectId: string, repositoryId: string, limit = 5) {
  if (isMongoConfigured()) {
    const collection = await getRepoStudyRunsCollection();
    const runs = await collection
      .find({ projectId, repositoryId })
      .sort({ version: -1 })
      .limit(limit)
      .toArray();

    return runs.map(sanitizeRepoStudyRun);
  }

  const runs = getFallbackStore().get(getStudyKey(projectId, repositoryId)) ?? [];
  return structuredClone(runs.slice().sort((left, right) => right.version - left.version).slice(0, limit).map(withRepoStudyDefaults));
}

export async function getLatestRepoStudyRun(projectId: string, repositoryId: string) {
  const [latestRun] = await getRecentRepoStudyRuns(projectId, repositoryId, 1);
  return latestRun ?? null;
}

async function getNextRepoStudyVersion(projectId: string, repositoryId: string) {
  const latestRun = await getLatestRepoStudyRun(projectId, repositoryId);
  return latestRun ? latestRun.version + 1 : 1;
}

async function writeRepoStudyRun(run: RepoStudyRunRecord) {
  if (isMongoConfigured()) {
    const collection = await getRepoStudyRunsCollection();
    await collection.replaceOne({ id: run.id }, run, { upsert: true });
    return run;
  }

  const key = getStudyKey(run.projectId, run.repositoryId);
  const runs = getFallbackStore().get(key) ?? [];
  const nextRuns = runs.some((entry) => entry.id === run.id)
    ? runs.map((entry) => (entry.id === run.id ? structuredClone(withRepoStudyDefaults(run)) : entry))
    : [structuredClone(withRepoStudyDefaults(run)), ...runs];

  getFallbackStore().set(key, nextRuns);
  return run;
}

export async function createRepoStudyRun(
  input: Omit<RepoStudyRunRecord, "id" | "version" | "createdAt">,
) {
  const version = await getNextRepoStudyVersion(input.projectId, input.repositoryId);
  const run: RepoStudyRunRecord = {
    ...input,
    id: `repo-study-${input.projectId}-${input.repositoryId}-v${version}`,
    version,
    createdAt: new Date().toISOString(),
  };

  await writeRepoStudyRun(run);
  return run;
}

export async function updateRepoStudyRun(
  studyId: string,
  updater: (run: RepoStudyRunRecord) => RepoStudyRunRecord,
) {
  const run = await readRepoStudyRun(studyId);

  if (!run) {
    return null;
  }

  const updatedRun = updater(run);
  await writeRepoStudyRun(updatedRun);
  return updatedRun;
}

export async function deleteRepoStudyRuns(projectId: string) {
  if (isMongoConfigured()) {
    const collection = await getRepoStudyRunsCollection();
    await collection.deleteMany({ projectId });
    return;
  }

  for (const key of [...getFallbackStore().keys()]) {
    if (key.startsWith(`${projectId}:`)) {
      getFallbackStore().delete(key);
    }
  }
}