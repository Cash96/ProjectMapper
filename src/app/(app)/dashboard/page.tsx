import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, toneFromRisk, toneFromState } from "@/components/status-badge";
import { getDashboardCounts, getProject } from "@/lib/project-helpers";
import { defaultProjectId } from "@/lib/project-store";

export default async function DashboardPage() {
  const project = await getProject(defaultProjectId);
  const counts = getDashboardCounts(project);
  const overnightSummary = project.reports[0];
  const openApprovals = project.approvals.filter((approval) => approval.status === "Open").slice(0, 2);
  const visibleTasks = project.tasks.slice(0, 3);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Dashboard"
        title="ProjectMapper Overview"
        description="Pending decisions, active work, and latest movement."
        actions={[
          { label: "Tasks", href: `/projects/${project.id}/tasks` },
          { label: "Approvals", href: `/projects/${project.id}/approvals` },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pending approvals"
          value={String(counts.pendingApprovals)}
          detail="Need decision"
        />
        <MetricCard
          label="Executing tasks"
          value={String(counts.executing)}
          detail="In flight"
        />
        <MetricCard
          label="Awaiting input"
          value={String(counts.awaitingInput)}
          detail="Blocked on input"
        />
        <MetricCard
          label="Ready to merge"
          value={String(counts.readyToMerge)}
          detail="Awaiting merge"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          eyebrow="Overnight summary"
          title={overnightSummary.title}
          action={{ label: "Reports", href: `/projects/${project.id}/reports` }}
        >
          <p>{overnightSummary.summary}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--ink-500)]">
            {overnightSummary.timestamp}
          </p>
        </SectionCard>

        <SectionCard
          eyebrow="Repos"
          title="Connected repositories"
          action={{ label: "Open", href: `/projects/${project.id}/repositories` }}
        >
          <div className="space-y-4">
            {project.repositories.map((repository) => (
              <div key={repository.id} className="surface-item p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--ink-950)]">{repository.name}</p>
                    <p className="text-sm text-[var(--ink-700)]">{repository.url}</p>
                  </div>
                  <StatusBadge label={repository.verifiedStatus} tone="success" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          eyebrow="Needs attention"
          title="Open approvals"
          action={{ label: "View all", href: `/projects/${project.id}/approvals` }}
        >
          <div className="space-y-3">
            {openApprovals.length > 0 ? openApprovals.map((approval) => (
              <article
                key={approval.id}
                className="surface-item p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--ink-950)]">{approval.title}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--ink-700)]">{approval.summary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={approval.kind} tone="info" />
                    <StatusBadge label={approval.priority} tone={toneFromRisk(approval.priority)} />
                  </div>
                </div>
              </article>
            )) : <p>No open approvals.</p>}
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Task pulse"
          title="Current tasks"
          action={{ label: "View all", href: `/projects/${project.id}/tasks` }}
        >
          <div className="space-y-3">
            {visibleTasks.map((task) => (
              <Link
                key={task.id}
                href={`/projects/${project.id}/tasks/${task.id}`}
                className="surface-item block p-4 transition hover:-translate-y-0.5"
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
                    <StatusBadge label={`${task.doctrineRisk} doctrine risk`} tone={toneFromRisk(task.doctrineRisk)} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}