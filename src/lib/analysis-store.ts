import type { AnalysisRunRecord } from "@/domain/intelligence";
import { getMongoClient } from "@/lib/mongodb";

const DB_NAME = "project_mapper";
const COLLECTION_NAME = "analysis_runs";

declare global {
  var __projectMapperAnalysisRuns: Map<string, AnalysisRunRecord[]> | undefined;
}

function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

function sanitizeAnalysisRun(run: AnalysisRunRecord & { _id?: unknown }) {
  const { _id: _unused, ...rest } = run;
  return structuredClone(rest);
}

function getFallbackStore() {
  if (!global.__projectMapperAnalysisRuns) {
    global.__projectMapperAnalysisRuns = new Map();
  }

  return global.__projectMapperAnalysisRuns;
}

async function getAnalysisRunsCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection<AnalysisRunRecord & { _id?: unknown }>(COLLECTION_NAME);
}

export async function getRecentAnalysisRuns(projectId: string, limit = 5) {
  if (isMongoConfigured()) {
    const collection = await getAnalysisRunsCollection();
    const runs = await collection
      .find({ projectId })
      .sort({ version: -1 })
      .limit(limit)
      .toArray();

    return runs.map(sanitizeAnalysisRun);
  }

  const runs = getFallbackStore().get(projectId) ?? [];
  return structuredClone(runs.slice().sort((left, right) => right.version - left.version).slice(0, limit));
}

export async function getLatestAnalysisRun(projectId: string) {
  const [latestRun] = await getRecentAnalysisRuns(projectId, 1);
  return latestRun ?? null;
}

async function getNextAnalysisVersion(projectId: string) {
  const latestRun = await getLatestAnalysisRun(projectId);
  return latestRun ? latestRun.version + 1 : 1;
}

export async function createAnalysisRun(
  input: Omit<AnalysisRunRecord, "id" | "version" | "createdAt">,
) {
  const version = await getNextAnalysisVersion(input.projectId);
  const run: AnalysisRunRecord = {
    ...input,
    id: `analysis-${input.projectId}-v${version}`,
    version,
    createdAt: new Date().toISOString(),
  };

  if (isMongoConfigured()) {
    const collection = await getAnalysisRunsCollection();
    await collection.insertOne(run);
    return run;
  }

  const store = getFallbackStore();
  const runs = store.get(input.projectId) ?? [];
  runs.unshift(structuredClone(run));
  store.set(input.projectId, runs);
  return run;
}