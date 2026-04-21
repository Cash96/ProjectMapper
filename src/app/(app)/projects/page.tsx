import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, toneFromState } from "@/components/status-badge";
import { getProjects } from "@/lib/project-helpers";

type ProjectsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const query = await searchParams;
  const projects = await getProjects();
  const [currentProject] = projects;
  const bootstrapState = getSearchValue(query.bootstrap);
  const bootstrappedProjectId = getSearchValue(query.projectId);

  if (currentProject) {
    redirect(`/projects/${currentProject.id}`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        description="Persisted project records."
      />

      {bootstrapState === "complete" && bootstrappedProjectId ? (
        <div className="rounded-3xl border border-[rgba(50,95,155,0.18)] bg-[rgba(50,95,155,0.08)] px-5 py-4 text-sm text-[var(--signal-blue)]">
          Project {bootstrappedProjectId} is ready for live analysis.
        </div>
      ) : null}

      {projects.length > 0 ? projects.map((project) => (
        <SectionCard
          key={project.id}
          eyebrow="Project"
          title={project.name}
          action={{ label: "Open", href: `/projects/${project.id}` }}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={project.status} tone={toneFromState(project.status)} />
              <StatusBadge label={`${project.tasks.length} tracked tasks`} tone="info" />
              <StatusBadge
                label={`${project.approvals.filter((approval) => approval.status === "Open").length} pending approvals`}
                tone="warning"
              />
            </div>
            <p>{project.mission}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {project.repositories.map((repository) => (
                <div key={repository.id} className="surface-item p-4">
                  <p className="font-medium text-[var(--ink-950)]">{repository.name}</p>
                  <p className="mt-1 text-sm text-[var(--ink-700)]">{repository.verifiedStatus}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )) : (
        <SectionCard eyebrow="No projects" title="No project records yet">
          <div className="space-y-4">
            <p>
              The seeded demo project has been removed. Initialize the real RevEd V1 {"->"} RevEd V2
              project record to begin the live analysis and doctrine flow.
            </p>
            <form action="/api/projects/bootstrap" method="post">
              <button
                type="submit"
                className="bg-surface-rail rounded-full px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5"
              >
                Initialize RevEd migration project
              </button>
            </form>
          </div>
        </SectionCard>
      )}
    </div>
  );
}