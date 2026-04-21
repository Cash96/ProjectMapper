import type { FeatureProposalRecord } from "@/domain/intelligence";
import { getMongoClient } from "@/lib/mongodb";

const DB_NAME = "project_mapper";
const FEATURE_PROPOSAL_COLLECTION = "feature_proposals";

declare global {
  var __projectMapperFeatureProposals: Map<string, FeatureProposalRecord[]> | undefined;
}

function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

function sanitize<T extends { _id?: unknown }>(value: T) {
  const rest = { ...value };
  delete rest._id;
  return structuredClone(rest);
}

function getProposalStore() {
  if (!global.__projectMapperFeatureProposals) {
    global.__projectMapperFeatureProposals = new Map();
  }

  return global.__projectMapperFeatureProposals;
}

function getProjectKey(projectId: string) {
  return projectId;
}

async function getFeatureProposalCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection<FeatureProposalRecord & { _id?: unknown }>(FEATURE_PROPOSAL_COLLECTION);
}

export async function listFeatureProposals(projectId: string, featureId?: string) {
  if (isMongoConfigured()) {
    const collection = await getFeatureProposalCollection();
    const records = await collection
      .find(featureId ? { projectId, featureId } : { projectId })
      .sort({ version: -1, updatedAt: -1 })
      .toArray();

    return records.map(sanitize);
  }

  const records = getProposalStore().get(getProjectKey(projectId)) ?? [];
  const filtered = featureId ? records.filter((entry) => entry.featureId === featureId) : records;
  return structuredClone(filtered.slice().sort((left, right) => right.version - left.version || right.updatedAt.localeCompare(left.updatedAt)));
}

export async function getLatestFeatureProposal(projectId: string, featureId: string) {
  const [latest] = await listFeatureProposals(projectId, featureId);
  return latest ?? null;
}

export async function readFeatureProposal(proposalId: string) {
  if (isMongoConfigured()) {
    const collection = await getFeatureProposalCollection();
    const record = await collection.findOne({ id: proposalId });
    return record ? sanitize(record) : null;
  }

  for (const records of getProposalStore().values()) {
    const record = records.find((entry) => entry.id === proposalId);

    if (record) {
      return structuredClone(record);
    }
  }

  return null;
}

export async function upsertFeatureProposal(record: FeatureProposalRecord) {
  if (isMongoConfigured()) {
    const collection = await getFeatureProposalCollection();
    await collection.replaceOne({ id: record.id }, record, { upsert: true });
    return record;
  }

  const key = getProjectKey(record.projectId);
  const records = getProposalStore().get(key) ?? [];
  const nextRecords = records.some((entry) => entry.id === record.id)
    ? records.map((entry) => (entry.id === record.id ? structuredClone(record) : entry))
    : [structuredClone(record), ...records];

  getProposalStore().set(key, nextRecords);
  return record;
}

export async function updateFeatureProposal(
  proposalId: string,
  updater: (proposal: FeatureProposalRecord) => FeatureProposalRecord,
) {
  const existing = await readFeatureProposal(proposalId);

  if (!existing) {
    return null;
  }

  const updated = updater(existing);
  await upsertFeatureProposal(updated);
  return updated;
}

export async function deleteProjectFeatureProposals(projectId: string) {
  if (isMongoConfigured()) {
    const collection = await getFeatureProposalCollection();
    await collection.deleteMany({ projectId });
    return;
  }

  getProposalStore().delete(getProjectKey(projectId));
}

export async function deleteFeatureProposals(projectId: string, featureId: string) {
  if (isMongoConfigured()) {
    const collection = await getFeatureProposalCollection();
    await collection.deleteMany({ projectId, featureId });
    return;
  }

  const key = getProjectKey(projectId);
  const records = getProposalStore().get(key) ?? [];
  getProposalStore().set(
    key,
    records.filter((entry) => entry.featureId !== featureId),
  );
}