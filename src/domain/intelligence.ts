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
  totalFileCount: number;
  totalDirectoryCount: number;
  topLevelEntries: string[];
  allFilePaths: string[];
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

export interface TargetRepositoryUnderstanding {
  summary: string;
  productGoals: string[];
  existingCapabilities: string[];
  architectureShape: string[];
  interactionModel: string[];
  designPhilosophy: string[];
  extensionGuidance: string[];
  migrationRisks: string[];
  groundingReferences: string[];
}

export type RepoStudyStatus = "Queued" | "Studying" | "Complete" | "Failed";

export interface RepoStudyUnderstanding {
  summary: string;
  purpose: string[];
  capabilities: string[];
  coreWorkflows: string[];
  importantEntities: string[];
  integrations: string[];
  architectureShape: string[];
  interactionAndDesign: string[];
  migrationRisks: string[];
  nextStageGuidance: string[];
  groundingReferences: string[];
  confidenceNotes: string[];
  openQuestions: string[];
}

export interface RepoStudyFocusArea {
  title: string;
  rationale: string;
  priority: "High" | "Medium";
  pathHints: string[];
}

export interface RepoStudyDeepDiveTarget {
  path: string;
  focusArea: string;
  reason: string;
}

export interface RepoStudyDeepDiveFinding {
  focusArea: string;
  summary: string;
  findings: string[];
  evidence: string[];
}

export interface RepoStudyInvestigationRecord {
  broadScanSummary: string;
  broadScanSignals: string[];
  focusAreas: RepoStudyFocusArea[];
  deprioritizedAreas: string[];
  deepDiveTargets: RepoStudyDeepDiveTarget[];
  deepDiveFindings: RepoStudyDeepDiveFinding[];
  openQuestions: string[];
  recommendedFollowUps: string[];
  confidenceNotes: string[];
}

export interface RepoStudyOperatorQuestion {
  id: string;
  question: string;
  rationale: string;
  priority: "High" | "Medium";
  relatedAreas: string[];
}

export interface RepoStudyOperatorGuidanceEntry {
  id: string;
  createdAt: string;
  author: string;
  guidance: string;
}

export interface RepoStudyIterationDelta {
  guidanceApplied: string[];
  changedUnderstanding: string[];
  strengthenedAreas: string[];
  remainingUncertainty: string[];
}

export interface RepoStudyRunRecord {
  id: string;
  projectId: string;
  repositoryId: string;
  repositoryName: string;
  repositoryRole: RepositoryRecord["role"];
  version: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  triggeredBy: string;
  status: RepoStudyStatus;
  parentRunId: string | null;
  snapshotCommitSha: string | null;
  artifact: RepositoryAnalysisArtifact | null;
  investigation: RepoStudyInvestigationRecord | null;
  understanding: RepoStudyUnderstanding | null;
  strategicImportance: string[];
  highConfidenceAreas: string[];
  weakConfidenceAreas: string[];
  operatorQuestions: RepoStudyOperatorQuestion[];
  operatorGuidance: RepoStudyOperatorGuidanceEntry[];
  iterationDelta: RepoStudyIterationDelta | null;
  understandingError?: string;
  failureMessage?: string;
  summary: string[];
}

export type FeatureInventoryStatus =
  | "Discovered"
  | "Studying"
  | "Studied"
  | "Mapped"
  | "Proposed"
  | "Building"
  | "Merged"
  | "Stale";

export type FeatureDiscoverySource = "AI Discovered" | "Manual Suggestion";

export interface FeatureInventoryRecord {
  id: string;
  projectId: string;
  slug: string;
  canonicalName: string;
  summary: string;
  tags: string[];
  sourceEvidence: string[];
  discoverySource: FeatureDiscoverySource;
  suggestedBy?: string;
  status: FeatureInventoryStatus;
  priority: "Low" | "Medium" | "High";
  confidence: "Low" | "Medium" | "High";
  latestSourceStudyRunId: string | null;
  latestTargetStudyRunId: string | null;
  latestMappingSummaryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureStudyUnderstanding {
  summary: string;
  featureDefinition: string[];
  userValue: string[];
  workflows: string[];
  workflowNarrative: string[];
  existingBehavior: string[];
  relevantPaths: string[];
  coreTouchpoints: string[];
  importantData: string[];
  aiInvolvement: string[];
  dependencies: string[];
  distinctiveBehaviors: string[];
  architectureNotes: string[];
  migrationInterpretation: string[];
  rebuildImplications: string[];
  confidenceAssessment: string[];
  confidenceNotes: string[];
  openQuestions: string[];
}

export interface FeatureStudyRunRecord {
  id: string;
  projectId: string;
  featureId: string;
  featureName: string;
  repositoryId: string;
  repositoryRole: RepositoryRecord["role"];
  version: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  triggeredBy: string;
  status: RepoStudyStatus;
  parentRunId: string | null;
  groundingRepoStudyRunId: string | null;
  scopedPaths: string[];
  understanding: FeatureStudyUnderstanding | null;
  strategicImportance: string[];
  highConfidenceAreas: string[];
  weakConfidenceAreas: string[];
  operatorQuestions: RepoStudyOperatorQuestion[];
  operatorGuidance: RepoStudyOperatorGuidanceEntry[];
  iterationDelta: RepoStudyIterationDelta | null;
  understandingError?: string;
  failureMessage?: string;
  summary: string[];
}

export interface FeatureMappingSummaryRecord {
  id: string;
  projectId: string;
  featureId: string;
  sourceStudyRunId: string;
  targetStudyRunId: string;
  status: "Current" | "Stale";
  createdAt: string;
  updatedAt: string;
  summary: string;
  sourceBehavior: string[];
  existingInTarget: string[];
  partialInTarget: string[];
  missingInTarget: string[];
  governingPatterns: string[];
  doctrineConstraints: string[];
  openQuestions: string[];
  recommendedNextSteps: string[];
  confidenceNotes: string[];
}

export type FeatureProposalStatus = "Draft" | "Revision Requested" | "Approved";

export interface FeatureProposalDesignOption {
  title: string;
  posture: "Safe / Minimal" | "Recommended / V2-native" | "More Ambitious";
  description: string;
  pros: string[];
  cons: string[];
  doctrineAlignment: string[];
}

export interface FeatureProposalContent {
  proposalSummary: string;
  sourceBehaviorSummary: string[];
  targetContextSummary: string[];
  gapAssessment: string[];
  designDirectionOptions: FeatureProposalDesignOption[];
  governingV2Patterns: string[];
  recommendedBuildShape: string[];
  operatorDesignQuestions: string[];
  explicitNonGoals: string[];
  risksAndUnknowns: string[];
  questionsForOperator: string[];
  suggestedImplementationScope: string[];
  revisionDelta: string[];
}

export interface FeatureProposalRevisionEntry {
  version: number;
  action: "Generated" | "Edited" | "Revision Requested" | "Approved";
  actor: string;
  createdAt: string;
  note?: string;
}

export interface FeatureProposalRecord {
  id: string;
  projectId: string;
  featureId: string;
  featureName: string;
  sourceStudyRunId: string;
  targetStudyRunId: string;
  mappingSummaryId: string;
  doctrineVersionId: string;
  version: number;
  status: FeatureProposalStatus;
  createdAt: string;
  updatedAt: string;
  generatedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  operatorComments: string;
  operatorResponses: string;
  operatorNotes: string;
  productDirectionDecisions: string;
  constraintsNonNegotiables: string;
  content: FeatureProposalContent;
  revisionHistory: FeatureProposalRevisionEntry[];
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
  targetRepositoryUnderstanding: TargetRepositoryUnderstanding | null;
  targetRepositoryUnderstandingError?: string;
  summary: string[];
}

export type DoctrineVersionStatus = "Draft" | "Awaiting Approval" | "Approved" | "Revision Requested";

export interface DoctrineDraftContent {
  summary: string;
  productDoctrine: string[];
  interactionModel: string[];
  migrationRules: string[];
  featureDesignRules: string[];
  antiPatterns: string[];
  technicalConstraints: string[];
  groundingReferences: string[];
}

export interface DoctrineVersionRecord {
  id: string;
  projectId: string;
  version: number;
  analysisRunId?: string | null;
  studyRunId?: string | null;
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

export type ExecutionRunStatus =
  | "NotStarted"
  | "Running"
  | "Blocked"
  | "AwaitingReview"
  | "Completed"
  | "Aborted";

export type ExecutionOperatorReviewStatus = "Pending" | "Approved" | "Rejected";

export type ExecutionAgentRole =
  | "ProposalCompliance"
  | "Coder"
  | "DesignPhilosophy"
  | "UiUx"
  | "QaRisk";

export type ExecutionAgentReviewStatus = "Pending" | "Approved" | "NeedsOperatorInput";

export type ExecutionInvestigationStatus = "NotStarted" | "InProgress" | "Completed";

export type ExecutionDecisionCategory =
  | "ImplementationDetail"
  | "LowRiskAssumption"
  | "ProductDecision"
  | "AccessIssue"
  | "HighImpactAmbiguity";

export type ExecutionDecisionConfidence = "High" | "Medium" | "Low";

export interface ExecutionProgressLogEntry {
  step: number;
  createdAt: string;
  intent: string;
  filesTouched: string[];
  summary: string;
  risks: string[];
}

export interface ExecutionAgentMessage {
  id: string;
  createdAt: string;
  agentRole: ExecutionAgentRole;
  kind: "Question" | "Note";
  status: "Open" | "Answered";
  message: string;
  investigationSummary?: string[];
  findings?: string[];
  options?: string[];
  recommendedDefault?: string;
  decisionRequired?: string;
  confidence?: ExecutionDecisionConfidence;
  category?: ExecutionDecisionCategory;
  response?: string;
  respondedAt?: string;
}

export interface ExecutionInvestigationAction {
  id: string;
  createdAt: string;
  title: string;
  detail: string;
  status: "Completed" | "Blocked" | "Skipped";
}

export interface ExecutionDecisionRecord {
  id: string;
  createdAt: string;
  agentRole: ExecutionAgentRole;
  issue: string;
  category: ExecutionDecisionCategory;
  confidence: ExecutionDecisionConfidence;
  investigated: string[];
  findings: string[];
  options: string[];
  recommendedDefault: string;
  decisionRequired: string;
  resolvedAutonomously: boolean;
}

export interface ExecutionTestResult {
  title: string;
  status: "NotRun" | "Passed" | "Failed" | "Skipped";
  detail: string;
}

export interface ExecutionFileChangeSummary {
  path: string;
  changeType: "create" | "update" | "delete";
  summary: string;
}

export interface ExecutionCommitSummary {
  sha: string;
  message: string;
  createdAt: string;
}

export interface ExecutionAgentReview {
  agentRole: ExecutionAgentRole;
  status: ExecutionAgentReviewStatus;
  summary: string;
  findings: string[];
  risks: string[];
  blockingQuestions: string[];
  updatedAt: string;
}

export interface ExecutionFinalReport {
  summary: string;
  proposalAlignment: string[];
  filesChanged: string[];
  assumptionsMade: string[];
  risks: string[];
  manualTestRecommendations: string[];
}

export interface ExecutionRun {
  id: string;
  projectId: string;
  featureId: string;
  proposalId: string;
  targetRepositoryId: string;
  branchName: string;
  baseBranch: string;
  status: ExecutionRunStatus;
  investigationStatus: ExecutionInvestigationStatus;
  startedAt: string;
  completedAt?: string;
  progressLog: ExecutionProgressLogEntry[];
  investigationActions: ExecutionInvestigationAction[];
  decisionRecords: ExecutionDecisionRecord[];
  agentMessages: ExecutionAgentMessage[];
  agentReviews: ExecutionAgentReview[];
  changedFilesSummary: ExecutionFileChangeSummary[];
  commitsSummary: ExecutionCommitSummary[];
  testResults: ExecutionTestResult[];
  risksIdentified: string[];
  assumptionsLogged: string[];
  unresolvedQuestions: string[];
  finalReport: ExecutionFinalReport | null;
  operatorReviewStatus: ExecutionOperatorReviewStatus;
}