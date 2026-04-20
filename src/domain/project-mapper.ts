export type TaskStatus =
  | "Drafted"
  | "Analyzing"
  | "Proposed"
  | "Awaiting Review"
  | "Awaiting My Input"
  | "Approved"
  | "Executing"
  | "Under Review"
  | "Needs Revision"
  | "Passed Review"
  | "Complete"
  | "Paused"
  | "Stopped"
  | "Failed"
  | "Retry Requested"
  | "Ready to Merge"
  | "Merged";

export type RiskLevel = "Low" | "Medium" | "High" | "Blocked";

export type ReviewState =
  | "Pending"
  | "Running"
  | "Attention Needed"
  | "Passed"
  | "Blocked";

export type TestState =
  | "Not Started"
  | "Planned"
  | "Running"
  | "Needs Human Review"
  | "Passed"
  | "Failed";

export type ApprovalStatus = "Open" | "Approved" | "Revision Requested";

export interface RepositoryRecord {
  id: string;
  name: string;
  role: "Source" | "Target";
  provider: "GitHub";
  url: string;
  defaultBranch: string;
  verifiedStatus: string;
  lastVerifiedAt: string;
  notes: string;
}

export interface DoctrineRecord {
  version: string;
  approvalState: "Draft" | "Awaiting Approval" | "Approved";
  lastUpdatedAt: string;
  summary: string;
  criticalRules: string[];
  antiPatterns: string[];
}

export interface TaskTodoItem {
  id: string;
  label: string;
  done: boolean;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  actor: string;
  kind: string;
  summary: string;
}

export interface ReviewResult {
  reviewer: string;
  status: ReviewState;
  summary: string;
}

export interface TestRunSummary {
  title: string;
  status: TestState;
  summary: string;
}

export interface ApprovalTarget {
  entity: "doctrine" | "task";
  taskId?: string;
  approveTaskStatus?: TaskStatus;
  revisionTaskStatus?: TaskStatus;
  clearHumanInputOnApprove?: boolean;
  clearOpenQuestionsOnApprove?: boolean;
  humanInputNeededOnRevision?: boolean;
  reviewStateOnApprove?: ReviewState;
  reviewStateOnRevision?: ReviewState;
}

export interface ApprovalDecision {
  status: Exclude<ApprovalStatus, "Open">;
  note?: string;
  decidedBy: string;
  decidedAt: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  status: TaskStatus;
  sourceFeature: string;
  targetArea: string;
  doctrineRisk: RiskLevel;
  confidence: "Low" | "Medium" | "High";
  activeBranch: string;
  activeAgents: string[];
  reviewState: ReviewState;
  testingState: TestState;
  latestActivity: string;
  humanInputNeeded: boolean;
  sourceUnderstanding: string[];
  repoBContext: string[];
  proposal: string[];
  openQuestions: string[];
  todo: TaskTodoItem[];
  timeline: TimelineEvent[];
  reviews: ReviewResult[];
  tests: TestRunSummary[];
}

export interface ApprovalItem {
  id: string;
  kind: string;
  priority: RiskLevel;
  title: string;
  summary: string;
  status: ApprovalStatus;
  approveLabel: string;
  revisionLabel: string;
  target: ApprovalTarget;
  decision?: ApprovalDecision;
}

export interface StrategicNote {
  id: string;
  title: string;
  emphasis: string;
  summary: string;
}

export interface ReportRecord {
  id: string;
  title: string;
  type: string;
  summary: string;
  timestamp: string;
}

export interface TestScenarioRecord {
  id: string;
  name: string;
  role: string;
  purpose: string;
  startPoint: string;
  checkpoints: string[];
}

export interface ProjectRecord {
  id: string;
  name: string;
  mission: string;
  status: string;
  operator: string;
  repositories: RepositoryRecord[];
  doctrine: DoctrineRecord;
  tasks: TaskRecord[];
  approvals: ApprovalItem[];
  strategicNotes: StrategicNote[];
  reports: ReportRecord[];
  testScenarios: TestScenarioRecord[];
}