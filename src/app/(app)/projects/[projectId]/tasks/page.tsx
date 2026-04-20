import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { StatusBadge, toneFromRisk, toneFromState } from "@/components/status-badge";
import { getProject } from "@/lib/project-helpers";

type TasksBoardPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function TasksBoardPage({ params }: TasksBoardPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Tasks board"
        title="Tasks"
        description="Tracked work units and current state."
      />

      <div className="grid gap-4">
        {project.tasks.map((task) => (
          <Link
            key={task.id}
            href={`/projects/${project.id}/tasks/${task.id}`}
            className="surface-card rounded-[2rem] p-6 transition hover:-translate-y-0.5"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={task.status} tone={toneFromState(task.status)} />
                  <StatusBadge label={`${task.doctrineRisk} doctrine risk`} tone={toneFromRisk(task.doctrineRisk)} />
                </div>
                <h2 className="mt-4 text-xl font-semibold tracking-tight">{task.title}</h2>
                <p className="mt-2 text-sm leading-7 text-[var(--ink-700)]">
                  {task.sourceFeature}{" -> "}{task.targetArea}
                </p>
              </div>
              <dl className="grid gap-3 text-sm text-[var(--ink-700)] sm:grid-cols-2 xl:min-w-[360px]">
                <div className="surface-item p-4">
                  <dt className="section-label text-[var(--ink-500)]">Branch</dt>
                  <dd className="mt-2 font-medium text-[var(--ink-950)]">{task.activeBranch}</dd>
                </div>
                <div className="surface-item p-4">
                  <dt className="section-label text-[var(--ink-500)]">Agents</dt>
                  <dd className="mt-2 font-medium text-[var(--ink-950)]">{task.activeAgents.join(", ")}</dd>
                </div>
                <div className="surface-item p-4">
                  <dt className="section-label text-[var(--ink-500)]">Review</dt>
                  <dd className="mt-2 font-medium text-[var(--ink-950)]">{task.reviewState}</dd>
                </div>
                <div className="surface-item p-4">
                  <dt className="section-label text-[var(--ink-500)]">Testing</dt>
                  <dd className="mt-2 font-medium text-[var(--ink-950)]">{task.testingState}</dd>
                </div>
              </dl>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}