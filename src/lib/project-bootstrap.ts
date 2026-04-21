import type { ProjectRecord } from "@/domain/project-mapper";
import { appConfig } from "@/lib/config";

function formatNow() {
  return new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function buildRevEdProjectRecord(): ProjectRecord {
  const timestamp = formatNow();

  return {
    id: "reved-v1-to-v2",
    name: "RevEd V1 -> RevEd V2",
    mission:
      "Map RevEd V1 features into RevEd V2 without breaking V2 patterns, interaction philosophy, or operator control.",
    status: "Repo studies required",
    operator: appConfig.auth.username,
    repositories: [
      {
        id: "repo-a",
        name: "RevEd V1",
        role: "Source",
        provider: "GitHub",
        url: appConfig.repositories.repoA,
        defaultBranch: "main",
        verifiedStatus: "Awaiting verification",
        lastVerifiedAt: timestamp,
        notes: "Source repository for feature extraction and behavior mapping.",
      },
      {
        id: "repo-b",
        name: "RevEd V2",
        role: "Target",
        provider: "GitHub",
        url: appConfig.repositories.repoB,
        defaultBranch: "main",
        verifiedStatus: "Awaiting deep review",
        lastVerifiedAt: timestamp,
        notes: "Destination repository whose architecture and design philosophy must govern migration decisions.",
      },
    ],
    doctrine: {
      version: "Not generated",
      approvalState: "Draft",
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
        priority: "High",
        title: "Approve RevEd V2 doctrine draft",
        summary: "Doctrine approval remains blocked until a grounded draft is generated from Repo B understanding.",
        status: "Open",
        approveLabel: "Approve doctrine",
        revisionLabel: "Request revision",
        target: {
          entity: "doctrine",
        },
      },
    ],
    strategicNotes: [
      {
        id: "protect-v2-identity",
        title: "Protect RevEd V2 identity",
        emphasis: "Foundational",
        summary: "Do not let V1 page-first patterns overwrite RevEd V2's chat-native and panel-native interaction model.",
      },
    ],
    reports: [],
    testScenarios: [],
  };
}