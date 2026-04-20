import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, toneFromState } from "@/components/status-badge";
import { getProject } from "@/lib/project-helpers";
import { defaultProjectId } from "@/lib/project-store";

export default async function ProjectsPage() {
  const project = await getProject(defaultProjectId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        description="Current workspace."
      />

      <SectionCard eyebrow="Active" title={project.name} action={{ label: "Open", href: `/projects/${project.id}` }}>
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
    </div>
  );
}