import type {
  FeatureInventoryRecord,
  FeatureMappingSummaryRecord,
  FeatureStudyRunRecord,
} from "@/domain/intelligence";
import { getMongoClient } from "@/lib/mongodb";

const DB_NAME = "project_mapper";
const FEATURE_COLLECTION = "feature_inventory";
const FEATURE_STUDY_COLLECTION = "feature_study_runs";
const FEATURE_MAPPING_COLLECTION = "feature_mapping_summaries";

declare global {
  var __projectMapperFeatureInventory: Map<string, FeatureInventoryRecord[]> | undefined;
  var __projectMapperFeatureStudyRuns: Map<string, FeatureStudyRunRecord[]> | undefined;
  var __projectMapperFeatureMappings: Map<string, FeatureMappingSummaryRecord[]> | undefined;
}

function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

function sanitize<T extends { _id?: unknown }>(value: T) {
  const rest = { ...value };
  delete rest._id;
  return structuredClone(rest);
}

function getFeatureStore() {
  if (!global.__projectMapperFeatureInventory) {
    global.__projectMapperFeatureInventory = new Map();
  }

  return global.__projectMapperFeatureInventory;
}

function getFeatureStudyStore() {
  if (!global.__projectMapperFeatureStudyRuns) {
    global.__projectMapperFeatureStudyRuns = new Map();
  }

  return global.__projectMapperFeatureStudyRuns;
}

function getFeatureMappingStore() {
  if (!global.__projectMapperFeatureMappings) {
    global.__projectMapperFeatureMappings = new Map();
  }

  return global.__projectMapperFeatureMappings;
}

function getProjectKey(projectId: string) {
  return projectId;
}

function getFeatureStudyKey(projectId: string, featureId: string, repositoryRole: FeatureStudyRunRecord["repositoryRole"]) {
  return `${projectId}:${featureId}:${repositoryRole}`;
}

async function getFeatureCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection<FeatureInventoryRecord & { _id?: unknown }>(FEATURE_COLLECTION);
}

async function getFeatureStudyCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection<FeatureStudyRunRecord & { _id?: unknown }>(FEATURE_STUDY_COLLECTION);
}

async function getFeatureMappingCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection<FeatureMappingSummaryRecord & { _id?: unknown }>(FEATURE_MAPPING_COLLECTION);
}

export async function listFeatureInventory(projectId: string) {
  if (isMongoConfigured()) {
    const collection = await getFeatureCollection();
    const records = await collection.find({ projectId }).sort({ updatedAt: -1, canonicalName: 1 }).toArray();
    return records.map(sanitize);
  }

  const records = getFeatureStore().get(getProjectKey(projectId)) ?? [];
  return structuredClone(records.slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
}

export async function readFeatureInventoryRecord(projectId: string, featureId: string) {
  if (isMongoConfigured()) {
    const collection = await getFeatureCollection();
    const record = await collection.findOne({ projectId, id: featureId });
    return record ? sanitize(record) : null;
  }

  const records = getFeatureStore().get(getProjectKey(projectId)) ?? [];
  const record = records.find((entry) => entry.id === featureId);
  return record ? structuredClone(record) : null;
}

export async function upsertFeatureInventoryRecord(record: FeatureInventoryRecord) {
  if (isMongoConfigured()) {
    const collection = await getFeatureCollection();
    await collection.replaceOne({ id: record.id }, record, { upsert: true });
    return record;
  }

  const key = getProjectKey(record.projectId);
  const records = getFeatureStore().get(key) ?? [];
  const nextRecords = records.some((entry) => entry.id === record.id)
    ? records.map((entry) => (entry.id === record.id ? structuredClone(record) : entry))
    : [structuredClone(record), ...records];

  getFeatureStore().set(key, nextRecords);
  return record;
}

export async function updateFeatureInventoryRecord(
  projectId: string,
  featureId: string,
  updater: (record: FeatureInventoryRecord) => FeatureInventoryRecord,
) {
  const existing = await readFeatureInventoryRecord(projectId, featureId);

  if (!existing) {
    return null;
  }

  const updated = updater(existing);
  await upsertFeatureInventoryRecord(updated);
  return updated;
}

export async function getRecentFeatureStudyRuns(
  projectId: string,
  featureId: string,
  repositoryRole: FeatureStudyRunRecord["repositoryRole"],
  limit = 5,
) {
  if (isMongoConfigured()) {
    const collection = await getFeatureStudyCollection();
    const runs = await collection
      .find({ projectId, featureId, repositoryRole })
      .sort({ version: -1 })
      .limit(limit)
      .toArray();

    return runs.map(sanitize);
  }

  const runs = getFeatureStudyStore().get(getFeatureStudyKey(projectId, featureId, repositoryRole)) ?? [];
  return structuredClone(runs.slice().sort((left, right) => right.version - left.version).slice(0, limit));
}

export async function getLatestFeatureStudyRun(
  projectId: string,
  featureId: string,
  repositoryRole: FeatureStudyRunRecord["repositoryRole"],
) {
  const [latest] = await getRecentFeatureStudyRuns(projectId, featureId, repositoryRole, 1);
  return latest ?? null;
}

export async function readFeatureStudyRun(runId: string) {
  if (isMongoConfigured()) {
    const collection = await getFeatureStudyCollection();
    const run = await collection.findOne({ id: runId });
    return run ? sanitize(run) : null;
  }

  for (const runs of getFeatureStudyStore().values()) {
    const run = runs.find((entry) => entry.id === runId);

    if (run) {
      return structuredClone(run);
    }
  }

  return null;
}

async function getNextFeatureStudyVersion(
  projectId: string,
  featureId: string,
  repositoryRole: FeatureStudyRunRecord["repositoryRole"],
) {
  const latest = await getLatestFeatureStudyRun(projectId, featureId, repositoryRole);
  return latest ? latest.version + 1 : 1;
}

async function writeFeatureStudyRun(run: FeatureStudyRunRecord) {
  if (isMongoConfigured()) {
    const collection = await getFeatureStudyCollection();
    await collection.replaceOne({ id: run.id }, run, { upsert: true });
    return run;
  }

  const key = getFeatureStudyKey(run.projectId, run.featureId, run.repositoryRole);
  const runs = getFeatureStudyStore().get(key) ?? [];
  const nextRuns = runs.some((entry) => entry.id === run.id)
    ? runs.map((entry) => (entry.id === run.id ? structuredClone(run) : entry))
    : [structuredClone(run), ...runs];

  getFeatureStudyStore().set(key, nextRuns);
  return run;
}

export async function createFeatureStudyRun(
  input: Omit<FeatureStudyRunRecord, "id" | "version" | "createdAt">,
) {
  const version = await getNextFeatureStudyVersion(input.projectId, input.featureId, input.repositoryRole);
  const run: FeatureStudyRunRecord = {
    ...input,
    id: `feature-study-${input.projectId}-${input.featureId}-${input.repositoryRole.toLowerCase()}-v${version}`,
    version,
    createdAt: new Date().toISOString(),
  };

  await writeFeatureStudyRun(run);
  return run;
}

export async function updateFeatureStudyRun(
  runId: string,
  updater: (run: FeatureStudyRunRecord) => FeatureStudyRunRecord,
) {
  const existing = await readFeatureStudyRun(runId);

  if (!existing) {
    return null;
  }

  const updated = updater(existing);
  await writeFeatureStudyRun(updated);
  return updated;
}

export async function listFeatureMappingSummaries(projectId: string, featureId?: string) {
  if (isMongoConfigured()) {
    const collection = await getFeatureMappingCollection();
    const summaries = await collection
      .find(featureId ? { projectId, featureId } : { projectId })
      .sort({ updatedAt: -1 })
      .toArray();

    return summaries.map(sanitize);
  }

  const summaries = getFeatureMappingStore().get(getProjectKey(projectId)) ?? [];
  const filtered = featureId ? summaries.filter((entry) => entry.featureId === featureId) : summaries;
  return structuredClone(filtered.slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
}

export async function getLatestFeatureMappingSummary(projectId: string, featureId: string) {
  const [latest] = await listFeatureMappingSummaries(projectId, featureId);
  return latest ?? null;
}

export async function upsertFeatureMappingSummary(record: FeatureMappingSummaryRecord) {
  if (isMongoConfigured()) {
    const collection = await getFeatureMappingCollection();
    await collection.replaceOne({ id: record.id }, record, { upsert: true });
    return record;
  }

  const key = getProjectKey(record.projectId);
  const records = getFeatureMappingStore().get(key) ?? [];
  const nextRecords = records.some((entry) => entry.id === record.id)
    ? records.map((entry) => (entry.id === record.id ? structuredClone(record) : entry))
    : [structuredClone(record), ...records];
  getFeatureMappingStore().set(key, nextRecords);
  return record;
}

export async function deleteProjectFeatureIntelligence(projectId: string) {
  if (isMongoConfigured()) {
    const [featureCollection, featureStudyCollection, featureMappingCollection] = await Promise.all([
      getFeatureCollection(),
      getFeatureStudyCollection(),
      getFeatureMappingCollection(),
    ]);

    await Promise.all([
      featureCollection.deleteMany({ projectId }),
      featureStudyCollection.deleteMany({ projectId }),
      featureMappingCollection.deleteMany({ projectId }),
    ]);
    return;
  }

  getFeatureStore().delete(getProjectKey(projectId));
  getFeatureMappingStore().delete(getProjectKey(projectId));

  for (const key of [...getFeatureStudyStore().keys()]) {
    if (key.startsWith(`${projectId}:`)) {
      getFeatureStudyStore().delete(key);
    }
  }
}

export async function deleteFeatureIntelligence(projectId: string, featureId: string) {
  if (isMongoConfigured()) {
    const [featureCollection, featureStudyCollection, featureMappingCollection] = await Promise.all([
      getFeatureCollection(),
      getFeatureStudyCollection(),
      getFeatureMappingCollection(),
    ]);

    await Promise.all([
      featureCollection.deleteOne({ projectId, id: featureId }),
      featureStudyCollection.deleteMany({ projectId, featureId }),
      featureMappingCollection.deleteMany({ projectId, featureId }),
    ]);
    return;
  }

  const inventoryKey = getProjectKey(projectId);
  const inventoryRecords = getFeatureStore().get(inventoryKey) ?? [];
  getFeatureStore().set(
    inventoryKey,
    inventoryRecords.filter((entry) => entry.id !== featureId),
  );

  const mappingRecords = getFeatureMappingStore().get(inventoryKey) ?? [];
  getFeatureMappingStore().set(
    inventoryKey,
    mappingRecords.filter((entry) => entry.featureId !== featureId),
  );

  for (const key of [...getFeatureStudyStore().keys()]) {
    if (key.startsWith(`${projectId}:${featureId}:`)) {
      getFeatureStudyStore().delete(key);
    }
  }
}