import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { inspectGitHubRepository } from "@/lib/github";
import { getProject } from "@/lib/project-helpers";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type RepositoriesPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function RepositoriesPage({ params }: RepositoriesPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const inspections = await Promise.all(
    project.repositories.map((repository) => inspectGitHubRepository(repository.url)),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Repositories"
        title="Repositories"
        description="Live source and target repo state."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {project.repositories.map((repository, index) => {
          const inspection = inspections[index];

          return (
            <SectionCard key={repository.id} eyebrow={repository.role} title={repository.name}>
            <div className="space-y-3">
              <p>{repository.notes}</p>
              <div className="surface-item p-4">
                <p className="font-medium text-[var(--ink-950)]">{inspection.fullName}</p>
                <p className="mt-1 text-sm text-[var(--ink-700)]">{inspection.htmlUrl}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="section-label text-[var(--ink-500)]">Default branch</p>
                    <p className="mt-1 text-sm text-[var(--ink-700)]">{inspection.defaultBranch}</p>
                  </div>
                  <div>
                    <p className="section-label text-[var(--ink-500)]">Visibility</p>
                    <p className="mt-1 text-sm text-[var(--ink-700)]">{inspection.visibility}</p>
                  </div>
                  <div>
                    <p className="section-label text-[var(--ink-500)]">Latest commit</p>
                    <p className="mt-1 text-sm text-[var(--ink-700)]">
                      {inspection.latestCommitSha ? inspection.latestCommitSha.slice(0, 12) : "Unavailable"}
                    </p>
                  </div>
                  <div>
                    <p className="section-label text-[var(--ink-500)]">Last push</p>
                    <p className="mt-1 text-sm text-[var(--ink-700)]">{formatTimestamp(inspection.pushedAt)}</p>
                  </div>
                  <div>
                    <p className="section-label text-[var(--ink-500)]">Open issues</p>
                    <p className="mt-1 text-sm text-[var(--ink-700)]">{inspection.openIssuesCount}</p>
                  </div>
                  <div>
                    <p className="section-label text-[var(--ink-500)]">Archived</p>
                    <p className="mt-1 text-sm text-[var(--ink-700)]">{inspection.archived ? "Yes" : "No"}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge
                    label={inspection.reachable ? "Live GitHub inspection passed" : "Live GitHub inspection failed"}
                    tone={inspection.reachable ? "success" : "danger"}
                  />
                  <StatusBadge
                    label={inspection.tokenConfigured ? "GitHub token configured" : "GitHub token missing"}
                    tone={inspection.tokenConfigured ? "info" : "warning"}
                  />
                  <StatusBadge label={`Verified ${inspection.verifiedAt}`} tone="info" />
                </div>
                {inspection.error ? (
                  <p className="mt-3 text-sm leading-6 text-[var(--signal-red)]">{inspection.error}</p>
                ) : null}
              </div>
            </div>
          </SectionCard>
          );
        })}
      </div>
    </div>
  );
}