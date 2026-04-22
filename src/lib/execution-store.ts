import type { ExecutionRun } from "@/domain/intelligence";
import { getMongoClient } from "@/lib/mongodb";

const DB_NAME = "project_mapper";
const EXECUTION_RUN_COLLECTION = "execution_runs";

declare global {
  var __projectMapperExecutionRuns: Map<string, ExecutionRun[]> | undefined;
}

function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

function sanitize<T extends { _id?: unknown }>(value: T) {
  const rest = { ...value };
  delete rest._id;
  return structuredClone(rest);
}

function getExecutionStore() {
  if (!global.__projectMapperExecutionRuns) {
    global.__projectMapperExecutionRuns = new Map();
  }

  return global.__projectMapperExecutionRuns;
}

function getProjectKey(projectId: string) {
  return projectId;
}

async function getExecutionRunCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection<ExecutionRun & { _id?: unknown }>(EXECUTION_RUN_COLLECTION);
}

export async function listExecutionRuns(projectId: string, featureId?: string) {
  if (isMongoConfigured()) {
    const collection = await getExecutionRunCollection();
    const records = await collection
      .find(featureId ? { projectId, featureId } : { projectId })
      .sort({ startedAt: -1 })
      .toArray();

    return records.map(sanitize);
  }

  const records = getExecutionStore().get(getProjectKey(projectId)) ?? [];
  const filtered = featureId ? records.filter((entry) => entry.featureId === featureId) : records;
  return structuredClone(filtered.slice().sort((left, right) => right.startedAt.localeCompare(left.startedAt)));
}

export async function getLatestExecutionRun(projectId: string, featureId: string) {
  const [latest] = await listExecutionRuns(projectId, featureId);
  return latest ?? null;
}

export async function readExecutionRun(executionRunId: string) {
  if (isMongoConfigured()) {
    const collection = await getExecutionRunCollection();
    const record = await collection.findOne({ id: executionRunId });
    return record ? sanitize(record) : null;
  }

  for (const records of getExecutionStore().values()) {
    const record = records.find((entry) => entry.id === executionRunId);

    if (record) {
      return structuredClone(record);
    }
  }

  return null;
}

export async function upsertExecutionRun(record: ExecutionRun) {
  if (isMongoConfigured()) {
    const collection = await getExecutionRunCollection();
    await collection.replaceOne({ id: record.id }, record, { upsert: true });
    return record;
  }

  const key = getProjectKey(record.projectId);
  const records = getExecutionStore().get(key) ?? [];
  const nextRecords = records.some((entry) => entry.id === record.id)
    ? records.map((entry) => (entry.id === record.id ? structuredClone(record) : entry))
    : [structuredClone(record), ...records];

  getExecutionStore().set(key, nextRecords);
  return record;
}

export async function updateExecutionRun(
  executionRunId: string,
  updater: (run: ExecutionRun) => ExecutionRun,
) {
  const existing = await readExecutionRun(executionRunId);

  if (!existing) {
    return null;
  }

  const updated = updater(existing);
  await upsertExecutionRun(updated);
  return updated;
}

export async function deleteProjectExecutionRuns(projectId: string) {
  if (isMongoConfigured()) {
    const collection = await getExecutionRunCollection();
    await collection.deleteMany({ projectId });
    return;
  }

  getExecutionStore().delete(getProjectKey(projectId));
}

export async function deleteFeatureExecutionRuns(projectId: string, featureId: string) {
  if (isMongoConfigured()) {
    const collection = await getExecutionRunCollection();
    await collection.deleteMany({ projectId, featureId });
    return;
  }

  const key = getProjectKey(projectId);
  const records = getExecutionStore().get(key) ?? [];
  getExecutionStore().set(
    key,
    records.filter((entry) => entry.featureId !== featureId),
  );
}