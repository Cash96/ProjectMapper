import type { RepositoryRecord } from "@/domain/project-mapper";

export type AnalysisRunStatus = "Complete" | "Failed";

export interface AnalysisDirectorySummary {
  path: string;
  note: string;
  samplePaths: string[];
}

export interface AnalysisFileExcerpt {
  path: string;
  reason: string;
  excerpt: string;
}

export interface RepositoryAnalysisArtifact {
  repositoryId: string;
  repositoryName: string;
  role: RepositoryRecord["role"];
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  visibility: string;
  latestCommitSha: string | null;
  analyzedAt: string;
  topLevelEntries: string[];
  importantDirectories: AnalysisDirectorySummary[];
  configFiles: string[];
  routeFiles: string[];
  componentFiles: string[];
  modelFiles: string[];
  aiFiles: string[];
  workflowFiles: string[];
  keyFileExcerpts: AnalysisFileExcerpt[];
  notes: string[];
  error?: string;
}

export interface AnalysisRunRecord {
  id: string;
  projectId: string;
  version: number;
  createdAt: string;
  triggeredBy: string;
  status: AnalysisRunStatus;
  repoA: RepositoryAnalysisArtifact;
  repoB: RepositoryAnalysisArtifact;
  summary: string[];
}

export type DoctrineVersionStatus = "Draft" | "Awaiting Approval" | "Approved" | "Revision Requested";

export interface DoctrineDraftContent {
  summary: string;
  architecturePatterns: string[];
  uxPatterns: string[];
  interactionPatterns: string[];
  criticalRules: string[];
  antiPatterns: string[];
  groundingReferences: string[];
}

export interface DoctrineVersionRecord {
  id: string;
  projectId: string;
  version: number;
  analysisRunId: string | null;
  status: DoctrineVersionStatus;
  createdAt: string;
  updatedAt: string;
  generatedBy: string;
  editedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  revisionFeedback?: string;
  content: DoctrineDraftContent;
}