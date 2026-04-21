import type { ApprovalItem, ApprovalStatus, ProjectRecord, TaskRecord } from "@/domain/project-mapper";
import { getMongoClient } from "@/lib/mongodb";

const DB_NAME = "project_mapper";
const COLLECTION_NAME = "projects";

type ProjectDocument = ProjectRecord & {
  _id?: unknown;
};

declare global {
  var __projectMapperProjects: Map<string, ProjectRecord> | undefined;
}

function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

function sanitizeProjectDocument(project: ProjectDocument) {
  const rest = { ...project };
  delete rest._id;
  return structuredClone(rest);
}

function getFallbackStore() {
  if (!global.__projectMapperProjects) {
    global.__projectMapperProjects = new Map();
  }

  return global.__projectMapperProjects;
}

async function getProjectsCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection<ProjectDocument>(COLLECTION_NAME);
}

export async function listProjectRecords() {
  if (isMongoConfigured()) {
    const collection = await getProjectsCollection();
    const projects = await collection.find({}).sort({ name: 1 }).toArray();
    return projects.map(sanitizeProjectDocument);
  }

  return [...getFallbackStore().values()].map((project) => structuredClone(project));
}

export async function upsertProjectRecord(project: ProjectRecord) {
  await writeProjectRecord(project);
  return project;
}

export async function getCurrentProjectRecord() {
  const [project] = await listProjectRecords();
  return project ?? null;
}

async function writeProjectRecord(project: ProjectRecord) {
  if (isMongoConfigured()) {
    const collection = await getProjectsCollection();
    await collection.replaceOne({ id: project.id }, project, { upsert: true });
    return;
  }

  getFallbackStore().set(project.id, structuredClone(project));
}

export async function updateProjectRecord(
  projectId: string,
  updater: (project: ProjectRecord) => void,
) {
  const project = await readProjectRecord(projectId);

  if (!project) {
    return null;
  }

  updater(project);
  await writeProjectRecord(project);
  return project;
}

function formatDecisionTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function appendTimelineEntry(
  task: TaskRecord,
  decision: {
    status: Exclude<ApprovalStatus, "Open">;
    note?: string;
    decidedBy: string;
    decidedAt: string;
  },
  approval: ApprovalItem,
) {
  task.timeline.unshift({
    id: `approval-${approval.id}-${Date.parse(decision.decidedAt)}`,
    timestamp: formatDecisionTimestamp(decision.decidedAt),
    actor: decision.decidedBy,
    kind: "Approval",
    summary: decision.note
      ? `${approval.title}: ${decision.status}. Note: ${decision.note}`
      : `${approval.title}: ${decision.status}.`,
  });
}

function applyDecisionToTask(
  task: TaskRecord,
  approval: ApprovalItem,
  decision: {
    status: Exclude<ApprovalStatus, "Open">;
    note?: string;
    decidedBy: string;
    decidedAt: string;
  },
) {
  const isApproved = decision.status === "Approved";
  const target = approval.target;

  if (isApproved && target.approveTaskStatus) {
    task.status = target.approveTaskStatus;
  }

  if (!isApproved && target.revisionTaskStatus) {
    task.status = target.revisionTaskStatus;
  }

  if (isApproved && target.reviewStateOnApprove) {
    task.reviewState = target.reviewStateOnApprove;
  }

  if (!isApproved && target.reviewStateOnRevision) {
    task.reviewState = target.reviewStateOnRevision;
  }

  if (isApproved && target.clearHumanInputOnApprove) {
    task.humanInputNeeded = false;
  }

  if (!isApproved && typeof target.humanInputNeededOnRevision === "boolean") {
    task.humanInputNeeded = target.humanInputNeededOnRevision;
  }

  if (isApproved && target.clearOpenQuestionsOnApprove) {
    task.openQuestions = [];
  }

  task.latestActivity = `${decision.status} by ${decision.decidedBy}`;
  appendTimelineEntry(task, decision, approval);
}

function applyStoredDecision(
  project: ProjectRecord,
  approval: ApprovalItem,
  decision: {
    status: Exclude<ApprovalStatus, "Open">;
    note?: string;
    decidedBy: string;
    decidedAt: string;
  },
) {
  approval.status = decision.status as ApprovalStatus;
  approval.decision = {
    status: decision.status,
    note: decision.note,
    decidedBy: decision.decidedBy,
    decidedAt: decision.decidedAt,
  };

  if (approval.target.entity === "doctrine") {
    project.doctrine.approvalState =
      decision.status === "Approved" ? "Approved" : "Draft";
    project.doctrine.lastUpdatedAt = formatDecisionTimestamp(decision.decidedAt);
    return;
  }

  const task = project.tasks.find((entry) => entry.id === approval.target.taskId);

  if (!task) {
    return;
  }

  applyDecisionToTask(task, approval, decision);
}

export async function readProjectRecord(projectId: string) {
  if (isMongoConfigured()) {
    const collection = await getProjectsCollection();
    const project = await collection.findOne({ id: projectId });
    return project ? sanitizeProjectDocument(project) : null;
  }

  const project = getFallbackStore().get(projectId);
  return project ? structuredClone(project) : null;
}

export async function saveApprovalDecision(input: {
  projectId: string;
  approvalId: string;
  status: Exclude<ApprovalStatus, "Open">;
  note?: string;
  decidedBy: string;
}) {
  const project = await readProjectRecord(input.projectId);

  if (!project) {
    return null;
  }

  const approval = project.approvals.find((entry) => entry.id === input.approvalId);

  if (!approval) {
    return project;
  }

  const decision = {
    status: input.status,
    note: input.note?.trim() || undefined,
    decidedBy: input.decidedBy,
    decidedAt: new Date().toISOString(),
  };

  applyStoredDecision(project, approval, decision);
  await writeProjectRecord(project);
  return project;
}