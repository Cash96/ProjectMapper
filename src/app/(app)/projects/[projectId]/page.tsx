import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, toneFromRisk, toneFromState } from "@/components/status-badge";
import { getProject } from "@/lib/project-helpers";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const workspaceLinks = [
    { label: "Tasks", href: `/projects/${project.id}/tasks` },
    { label: "Approvals", href: `/projects/${project.id}/approvals` },
    { label: "Doctrine", href: `/projects/${project.id}/doctrine` },
    { label: "Analysis", href: `/projects/${project.id}/analysis` },
    { label: "Repositories", href: `/projects/${project.id}/repositories` },
    { label: "Reports", href: `/projects/${project.id}/reports` },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Project detail"
        title={project.name}
        description="Project snapshot and core workspace links."
        status={project.status}
        actions={[
          { label: "Tasks", href: `/projects/${project.id}/tasks` },
          { label: "Doctrine", href: `/projects/${project.id}/doctrine` },
        ]}
      />

      <SectionCard eyebrow="Workspace" title="Core areas">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {workspaceLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="surface-item block p-4 text-sm font-medium text-[var(--ink-950)] transition hover:-translate-y-0.5"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SectionCard eyebrow="Mission" title="Focus">
          <p>{project.mission}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <StatusBadge label={`Operator: ${project.operator}`} tone="info" />
            <StatusBadge
              label={`${project.approvals.filter((approval) => approval.status === "Open").length} open approvals`}
              tone="warning"
            />
            <StatusBadge label={`${project.tasks.length} tracked tasks`} tone="neutral" />
          </div>
        </SectionCard>

        <SectionCard eyebrow="Doctrine" title="Current status">
          <p>{project.doctrine.summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <StatusBadge label={project.doctrine.approvalState} tone={toneFromState(project.doctrine.approvalState)} />
            <StatusBadge label={project.doctrine.version} tone="info" />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          eyebrow="Tasks"
          title="Current work"
          action={{ label: "Open all", href: `/projects/${project.id}/tasks` }}
        >
          <div className="space-y-3">
            {project.tasks.slice(0, 2).map((task) => (
              <Link
                key={task.id}
                href={`/projects/${project.id}/tasks/${task.id}`}
                className="surface-item block p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--ink-950)]">{task.title}</p>
                    <p className="mt-1 text-sm text-[var(--ink-700)]">
                      {task.sourceFeature}{" -> "}{task.targetArea}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={task.status} tone={toneFromState(task.status)} />
                    <StatusBadge label={`${task.doctrineRisk} risk`} tone={toneFromRisk(task.doctrineRisk)} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Notes"
          title="Guidance"
          action={{ label: "Open", href: `/projects/${project.id}/strategic-notes` }}
        >
          <div className="space-y-4">
            {project.strategicNotes.map((note) => (
              <article key={note.id} className="surface-item p-4">
                <p className="font-medium text-[var(--ink-950)]">{note.title}</p>
                <p className="mt-1 text-sm text-[var(--ink-500)]">{note.emphasis}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{note.summary}</p>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}