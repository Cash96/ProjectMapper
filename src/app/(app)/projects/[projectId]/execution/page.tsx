import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, toneFromState } from "@/components/status-badge";
import { getProject } from "@/lib/project-helpers";

type ExecutionPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ExecutionPage({ params }: ExecutionPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Execution"
        title="Execution"
        description="Branches, workers, and current activity."
      />

      <SectionCard eyebrow="Task -> branch" title="Current branch records">
        <div className="space-y-3">
          {project.tasks.map((task) => (
            <article key={task.id} className="surface-item p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-medium text-[var(--ink-950)]">{task.title}</p>
                  <p className="mt-1 text-sm text-[var(--ink-700)]">{task.activeBranch}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">
                    Agents: {task.activeAgents.join(", ")} · Latest activity: {task.latestActivity}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={task.status} tone={toneFromState(task.status)} />
                  <StatusBadge label={task.reviewState} tone={toneFromState(task.reviewState)} />
                  <StatusBadge label={task.testingState} tone={toneFromState(task.testingState)} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}