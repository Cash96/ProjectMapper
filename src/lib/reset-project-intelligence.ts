import type { ProjectRecord } from "@/domain/project-mapper";
import { deleteAnalysisRuns } from "@/lib/analysis-store";
import { deleteDoctrineVersions } from "@/lib/doctrine-store";
import { deleteProjectFeatureIntelligence } from "@/lib/feature-store";
import { deleteProjectFeatureProposals } from "@/lib/proposal-store";
import { updateProjectRecord } from "@/lib/project-store";
import { deleteRepoStudyRuns } from "@/lib/repo-study-store";

function formatNow() {
  return new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function buildResetProjectSnapshot(project: ProjectRecord) {
  const timestamp = formatNow();

  return {
    status: "Repo studies required",
    doctrine: {
      version: "Not generated",
      approvalState: "Draft" as const,
      lastUpdatedAt: timestamp,
      summary: "Doctrine has not been generated yet. Complete a usable Repo 2 study first.",
      criticalRules: [],
      antiPatterns: [],
    },
    tasks: [],
    approvals: [
      {
        id: "doctrine-approval",
        kind: "Doctrine Approval",
        priority: "High" as const,
        title: "Approve RevEd V2 doctrine draft",
        summary: "Doctrine approval remains blocked until a grounded draft is generated from Repo 2 understanding.",
        status: "Open" as const,
        approveLabel: "Approve doctrine",
        revisionLabel: "Request revision",
        target: {
          entity: "doctrine" as const,
        },
      },
    ],
    strategicNotes: [],
    reports: [],
    testScenarios: [],
    repositories: project.repositories.map((repository) => ({ ...repository })),
  };
}

export async function resetProjectIntelligence(project: ProjectRecord) {
  await Promise.all([
    deleteRepoStudyRuns(project.id),
    deleteProjectFeatureIntelligence(project.id),
    deleteProjectFeatureProposals(project.id),
    deleteDoctrineVersions(project.id),
    deleteAnalysisRuns(project.id),
  ]);

  await updateProjectRecord(project.id, (record) => {
    const reset = buildResetProjectSnapshot(project);
    record.status = reset.status;
    record.repositories = reset.repositories;
    record.doctrine = reset.doctrine;
    record.tasks = reset.tasks;
    record.approvals = reset.approvals;
    record.strategicNotes = reset.strategicNotes;
    record.reports = reset.reports;
    record.testScenarios = reset.testScenarios;
  });
}