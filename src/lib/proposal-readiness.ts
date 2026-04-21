import type { DoctrineVersionRecord, RepoStudyRunRecord } from "@/domain/intelligence";
import { getLatestDoctrineVersion } from "@/lib/doctrine-store";
import { getRepositoryStudySnapshot } from "@/lib/repo-study";
import { readProjectRecord } from "@/lib/project-store";

export interface ProposalGenerationReadinessCheck {
  label: string;
  satisfied: boolean;
  detail: string;
}

export interface ProposalGenerationReadiness {
  ready: boolean;
  latestSourceStudy: RepoStudyRunRecord | null;
  latestTargetStudy: RepoStudyRunRecord | null;
  latestDoctrineVersion: DoctrineVersionRecord | null;
  checks: ProposalGenerationReadinessCheck[];
  blockingReasons: string[];
}

export async function getProposalGenerationReadiness(projectId: string): Promise<ProposalGenerationReadiness> {
  const project = await readProjectRecord(projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  const sourceRepository = project.repositories.find((repository) => repository.role === "Source") ?? null;
  const targetRepository = project.repositories.find((repository) => repository.role === "Target") ?? null;
  const latestDoctrineVersion = await getLatestDoctrineVersion(projectId);

  const [sourceStudySnapshot, targetStudySnapshot] = await Promise.all([
    sourceRepository ? getRepositoryStudySnapshot(projectId, sourceRepository) : null,
    targetRepository ? getRepositoryStudySnapshot(projectId, targetRepository) : null,
  ]);

  const latestSourceStudy = sourceStudySnapshot?.latestRun ?? null;
  const latestTargetStudy = targetStudySnapshot?.latestRun ?? null;

  const checks: ProposalGenerationReadinessCheck[] = [
    {
      label: "Repo 1 study",
      satisfied: Boolean(sourceStudySnapshot?.usable),
      detail: sourceStudySnapshot?.usable
        ? `Repo 1 study ${sourceStudySnapshot.latestVersionLabel} is complete and usable for future proposal generation.`
        : sourceStudySnapshot?.statusDetail ?? "Study Repo 1 before generating task proposals.",
    },
    {
      label: "RevEd V2 understanding",
      satisfied: Boolean(targetStudySnapshot?.usable),
      detail: targetStudySnapshot?.usable
        ? `Repo 2 study ${targetStudySnapshot.latestVersionLabel} is complete and usable for doctrine and planning.`
        : targetStudySnapshot?.statusDetail ?? "Study Repo 2 before proposal generation.",
    },
    {
      label: "Approved doctrine",
      satisfied: latestDoctrineVersion?.status === "Approved",
      detail: latestDoctrineVersion
        ? latestDoctrineVersion.status === "Approved"
          ? `Doctrine v${latestDoctrineVersion.version} is approved and available for planning.`
          : `Doctrine v${latestDoctrineVersion.version} is ${latestDoctrineVersion.status.toLowerCase()} and cannot ground proposal generation yet.`
        : "Generate and approve a doctrine draft before proposal generation.",
    },
  ];

  return {
    ready: checks.every((check) => check.satisfied),
    latestSourceStudy,
    latestTargetStudy,
    latestDoctrineVersion,
    blockingReasons: checks.filter((check) => !check.satisfied).map((check) => check.detail),
    checks,
  };
}

export async function assertProposalGenerationReady(projectId: string) {
  const readiness = await getProposalGenerationReadiness(projectId);

  if (!readiness.ready) {
    throw new Error(readiness.blockingReasons.join(" "));
  }

  return readiness;
}