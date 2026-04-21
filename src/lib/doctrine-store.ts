import type { DoctrineDraftContent, DoctrineVersionRecord, DoctrineVersionStatus } from "@/domain/intelligence";
import { getMongoClient } from "@/lib/mongodb";
import { updateProjectRecord } from "@/lib/project-store";

const DB_NAME = "project_mapper";
const COLLECTION_NAME = "doctrine_versions";

declare global {
  var __projectMapperDoctrineVersions: Map<string, DoctrineVersionRecord[]> | undefined;
}

function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

function sanitizeDoctrineVersion(version: DoctrineVersionRecord & { _id?: unknown }) {
  const rest = { ...version };
  delete rest._id;
  return structuredClone(rest);
}

function getFallbackStore() {
  if (!global.__projectMapperDoctrineVersions) {
    global.__projectMapperDoctrineVersions = new Map();
  }

  return global.__projectMapperDoctrineVersions;
}

async function getDoctrineVersionsCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection<DoctrineVersionRecord & { _id?: unknown }>(COLLECTION_NAME);
}

function mapDoctrineStatus(status: DoctrineVersionStatus) {
  if (status === "Approved") {
    return "Approved" as const;
  }

  if (status === "Revision Requested") {
    return "Draft" as const;
  }

  return "Awaiting Approval" as const;
}

function formatDoctrineVersionLabel(version: number, status: DoctrineVersionStatus) {
  if (status === "Approved") {
    return `v${version} approved`;
  }

  if (status === "Revision Requested") {
    return `v${version} revision requested`;
  }

  return `v${version} draft`;
}

function getDoctrineContentList(
  content: DoctrineVersionRecord["content"],
  key: keyof DoctrineVersionRecord["content"],
  fallbackKeys: string[] = [],
) {
  const record = content as unknown as Record<string, unknown>;
  const direct = record[key];

  if (Array.isArray(direct)) {
    return direct.filter((entry): entry is string => typeof entry === "string");
  }

  for (const fallbackKey of fallbackKeys) {
    const fallback = record[fallbackKey];

    if (Array.isArray(fallback)) {
      return fallback.filter((entry): entry is string => typeof entry === "string");
    }
  }

  return [];
}

async function syncProjectDoctrineSnapshot(projectId: string, doctrineVersion: DoctrineVersionRecord) {
  await updateProjectRecord(projectId, (project) => {
    project.doctrine.version = formatDoctrineVersionLabel(doctrineVersion.version, doctrineVersion.status);
    project.doctrine.approvalState = mapDoctrineStatus(doctrineVersion.status);
    project.doctrine.lastUpdatedAt = new Date(doctrineVersion.updatedAt).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    project.doctrine.summary = doctrineVersion.content.summary;
    project.doctrine.criticalRules = getDoctrineContentList(doctrineVersion.content, "technicalConstraints", ["featureDesignRules", "criticalRules"]);
    project.doctrine.antiPatterns = doctrineVersion.content.antiPatterns;

    const approval = project.approvals.find((entry) => entry.target.entity === "doctrine");

    if (!approval) {
      return;
    }

    approval.title = `Approve RevEd V2 doctrine ${formatDoctrineVersionLabel(doctrineVersion.version, doctrineVersion.status)}`;
    approval.summary = doctrineVersion.status === "Revision Requested" && doctrineVersion.revisionFeedback
      ? `Doctrine revision requested: ${doctrineVersion.revisionFeedback}`
      : `Review the latest grounded doctrine draft generated from the latest usable Repo 2 study before task planning proceeds.`;

    if (doctrineVersion.status === "Awaiting Approval" || doctrineVersion.status === "Draft") {
      approval.status = "Open";
      delete approval.decision;
    }
  });
}

export async function getRecentDoctrineVersions(projectId: string, limit = 5) {
  if (isMongoConfigured()) {
    const collection = await getDoctrineVersionsCollection();
    const versions = await collection
      .find({ projectId })
      .sort({ version: -1 })
      .limit(limit)
      .toArray();

    return versions.map(sanitizeDoctrineVersion);
  }

  const versions = getFallbackStore().get(projectId) ?? [];
  return structuredClone(versions.slice().sort((left, right) => right.version - left.version).slice(0, limit));
}

export async function getLatestDoctrineVersion(projectId: string) {
  const [latestVersion] = await getRecentDoctrineVersions(projectId, 1);
  return latestVersion ?? null;
}

async function getNextDoctrineVersion(projectId: string) {
  const latestVersion = await getLatestDoctrineVersion(projectId);
  return latestVersion ? latestVersion.version + 1 : 1;
}

export async function createDoctrineVersion(input: {
  projectId: string;
  analysisRunId?: string | null;
  studyRunId?: string | null;
  content: DoctrineDraftContent;
  generatedBy: string;
  status?: DoctrineVersionStatus;
  revisionFeedback?: string;
}) {
  const version = await getNextDoctrineVersion(input.projectId);
  const doctrineVersion: DoctrineVersionRecord = {
    id: `doctrine-${input.projectId}-v${version}`,
    projectId: input.projectId,
    version,
    analysisRunId: input.analysisRunId,
    studyRunId: input.studyRunId,
    status: input.status ?? "Awaiting Approval",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy,
    revisionFeedback: input.revisionFeedback,
    content: input.content,
  };

  if (isMongoConfigured()) {
    const collection = await getDoctrineVersionsCollection();
    await collection.insertOne(doctrineVersion);
  } else {
    const store = getFallbackStore();
    const versions = store.get(input.projectId) ?? [];
    versions.unshift(structuredClone(doctrineVersion));
    store.set(input.projectId, versions);
  }

  await syncProjectDoctrineSnapshot(input.projectId, doctrineVersion);
  return doctrineVersion;
}

export async function updateDoctrineVersion(input: {
  projectId: string;
  doctrineId: string;
  content: DoctrineDraftContent;
  editedBy: string;
}) {
  const latestVersions = await getRecentDoctrineVersions(input.projectId, 20);
  const existingVersion = latestVersions.find((entry) => entry.id === input.doctrineId);

  if (!existingVersion) {
    return null;
  }

  const updatedVersion: DoctrineVersionRecord = {
    ...existingVersion,
    status: "Awaiting Approval",
    updatedAt: new Date().toISOString(),
    editedBy: input.editedBy,
    content: input.content,
  };

  if (isMongoConfigured()) {
    const collection = await getDoctrineVersionsCollection();
    await collection.replaceOne({ id: input.doctrineId }, updatedVersion, { upsert: true });
  } else {
    const store = getFallbackStore();
    const versions = (store.get(input.projectId) ?? []).map((entry) =>
      entry.id === input.doctrineId ? structuredClone(updatedVersion) : entry,
    );
    store.set(input.projectId, versions);
  }

  await syncProjectDoctrineSnapshot(input.projectId, updatedVersion);
  return updatedVersion;
}

export async function recordDoctrineDecision(input: {
  projectId: string;
  status: Extract<DoctrineVersionStatus, "Approved" | "Revision Requested">;
  note?: string;
  decidedBy: string;
}) {
  const latestVersion = await getLatestDoctrineVersion(input.projectId);

  if (!latestVersion) {
    return null;
  }

  const updatedVersion: DoctrineVersionRecord = {
    ...latestVersion,
    status: input.status,
    updatedAt: new Date().toISOString(),
    approvedBy: input.decidedBy,
    approvedAt: new Date().toISOString(),
    revisionFeedback: input.status === "Revision Requested" ? input.note?.trim() || undefined : latestVersion.revisionFeedback,
  };

  if (isMongoConfigured()) {
    const collection = await getDoctrineVersionsCollection();
    await collection.replaceOne({ id: latestVersion.id }, updatedVersion, { upsert: true });
  } else {
    const store = getFallbackStore();
    const versions = (store.get(input.projectId) ?? []).map((entry) =>
      entry.id === latestVersion.id ? structuredClone(updatedVersion) : entry,
    );
    store.set(input.projectId, versions);
  }

  await syncProjectDoctrineSnapshot(input.projectId, updatedVersion);
  return updatedVersion;
}

export async function deleteDoctrineVersions(projectId: string) {
  if (isMongoConfigured()) {
    const collection = await getDoctrineVersionsCollection();
    await collection.deleteMany({ projectId });
    return;
  }

  getFallbackStore().delete(projectId);
}