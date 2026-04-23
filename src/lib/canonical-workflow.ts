import type { Tone } from "@/components/status-badge";
import type { WorkflowState } from "@/components/workflow-primitives";

export type CanonicalWorkflowStepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const CANONICAL_WORKFLOW_STEPS: Array<{
  number: CanonicalWorkflowStepNumber;
  title: string;
  description: string;
}> = [
  {
    number: 1,
    title: "Study Repo",
    description: "Ground the migration in both repositories before making downstream decisions.",
  },
  {
    number: 2,
    title: "Questions + Answers",
    description: "Resolve understanding gaps and lock in the rules the later build must obey.",
  },
  {
    number: 3,
    title: "Feature / Topic Generation",
    description: "Turn repository understanding into a migration-sized working inventory.",
  },
  {
    number: 4,
    title: "Feature Selection",
    description: "Choose the single feature flow that should move next.",
  },
  {
    number: 5,
    title: "Build Proposal",
    description: "Define the implementation direction before any execution starts.",
  },
  {
    number: 6,
    title: "Proposal Questions",
    description: "Resolve the proposal uncertainties that materially change what gets built.",
  },
  {
    number: 7,
    title: "Proposal Agreement",
    description: "Approve or reject the proposal boundary before coding begins.",
  },
  {
    number: 8,
    title: "Execution",
    description: "Run the approved plan in a controlled, branch-based execution workspace.",
  },
  {
    number: 9,
    title: "Deep / Philosophical Execution Questions",
    description: "Answer only the high-impact decisions the agent could not safely close itself.",
  },
  {
    number: 10,
    title: "Review Complete",
    description: "Review the outcome and close the feature only after human approval.",
  },
];

export function getCanonicalWorkflowStep(stepNumber: CanonicalWorkflowStepNumber) {
  return CANONICAL_WORKFLOW_STEPS.find((step) => step.number === stepNumber) ?? CANONICAL_WORKFLOW_STEPS[0];
}

export function buildCanonicalWorkflowSteps(input: {
  activeStep: CanonicalWorkflowStepNumber;
  stateByStep: Partial<Record<CanonicalWorkflowStepNumber, WorkflowState>>;
  descriptionByStep?: Partial<Record<CanonicalWorkflowStepNumber, string>>;
  badgesByStep?: Partial<Record<CanonicalWorkflowStepNumber, Array<{ label: string; tone?: Tone }>>>;
  hrefByStep?: Partial<Record<CanonicalWorkflowStepNumber, string>>;
}) {
  return CANONICAL_WORKFLOW_STEPS.map((step) => ({
    number: step.number,
    title: step.title,
    description: input.descriptionByStep?.[step.number] ?? step.description,
    state: input.stateByStep[step.number] ?? "not-started",
    active: step.number === input.activeStep,
    badges: input.badgesByStep?.[step.number],
    href: input.hrefByStep?.[step.number],
  }));
}

export function getCanonicalWorkflowHref(projectId: string, stepNumber: CanonicalWorkflowStepNumber) {
  if (stepNumber === 1 || stepNumber === 2) {
    return `/projects/${projectId}/understanding`;
  }

  if (stepNumber >= 3 && stepNumber <= 7) {
    return `/projects/${projectId}/features`;
  }

  if (stepNumber === 8 || stepNumber === 9) {
    return `/projects/${projectId}/execution`;
  }

  return `/projects/${projectId}/reports`;
}

export function countCompletedWorkflowSteps(
  steps: Array<{ state: WorkflowState }>,
) {
  return steps.filter((step) => step.state === "complete").length;
}