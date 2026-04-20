import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, toneFromRisk, toneFromState } from "@/components/status-badge";
import { getTask } from "@/lib/project-helpers";

type TaskDetailPageProps = {
  params: Promise<{ projectId: string; taskId: string }>;
};

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { projectId, taskId } = await params;
  const task = await getTask(projectId, taskId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Task detail"
        title={task.title}
        description="Plan, status, and review signal."
        status={task.status}
        actions={[
          { label: "Approve", href: "#controls" },
          { label: "Request revision", href: "#controls" },
        ]}
      />

      <section className="surface-card rounded-[2rem] p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="section-label text-[var(--ink-500)]">Source feature</p>
            <p className="mt-2 font-medium">{task.sourceFeature}</p>
          </div>
          <div>
            <p className="section-label text-[var(--ink-500)]">Target area</p>
            <p className="mt-2 font-medium">{task.targetArea}</p>
          </div>
          <div>
            <p className="section-label text-[var(--ink-500)]">Doctrine risk</p>
            <div className="mt-2">
              <StatusBadge label={task.doctrineRisk} tone={toneFromRisk(task.doctrineRisk)} />
            </div>
          </div>
          <div>
            <p className="section-label text-[var(--ink-500)]">Confidence</p>
            <div className="mt-2">
              <StatusBadge label={task.confidence} tone="neutral" />
            </div>
          </div>
          <div>
            <p className="section-label text-[var(--ink-500)]">Current branch</p>
            <p className="mt-2 font-medium">{task.activeBranch}</p>
          </div>
          <div>
            <p className="section-label text-[var(--ink-500)]">Review state</p>
            <div className="mt-2">
              <StatusBadge label={task.reviewState} tone={toneFromState(task.reviewState)} />
            </div>
          </div>
          <div>
            <p className="section-label text-[var(--ink-500)]">Testing state</p>
            <div className="mt-2">
              <StatusBadge label={task.testingState} tone={toneFromState(task.testingState)} />
            </div>
          </div>
          <div>
            <p className="section-label text-[var(--ink-500)]">Active agents</p>
            <p className="mt-2 font-medium">{task.activeAgents.join(", ")}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SectionCard eyebrow="Source understanding" title="What the system found in Repo A">
          <ul className="space-y-3">
            {task.sourceUnderstanding.map((line) => (
              <li key={line} className="surface-item p-4">
                {line}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard eyebrow="Repo B context" title="What already exists in RevEd V2">
          <ul className="space-y-3">
            {task.repoBContext.map((line) => (
              <li key={line} className="surface-item p-4">
                {line}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard eyebrow="Proposal layer" title="Plain-English mapping plan">
          <ul className="space-y-3">
            {task.proposal.map((line) => (
              <li key={line} className="surface-item p-4">
                {line}
              </li>
            ))}
          </ul>
          {task.openQuestions.length > 0 ? (
            <div className="mt-5">
              <p className="section-label text-[var(--ink-500)]">Open questions</p>
              <ul className="mt-3 space-y-3">
                {task.openQuestions.map((question) => (
                  <li key={question} className="rounded-3xl border border-[rgba(183,113,25,0.18)] bg-[rgba(183,113,25,0.08)] p-4 text-[var(--signal-amber)]">
                    {question}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard eyebrow="Todo breakdown" title="Structured work list">
          <ul className="space-y-3">
            {task.todo.map((item) => (
              <li key={item.id} className="surface-item p-4">
                <div className="flex items-center justify-between gap-3">
                  <span>{item.label}</span>
                  <StatusBadge label={item.done ? "Done" : "Open"} tone={item.done ? "success" : "warning"} />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SectionCard eyebrow="Thread and history" title="Activity timeline">
          <ul className="space-y-3">
            {task.timeline.map((event) => (
              <li key={event.id} className="surface-item p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--ink-950)]">{event.kind}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--ink-700)]">{event.summary}</p>
                  </div>
                  <p className="text-sm text-[var(--ink-500)]">{event.actor} · {event.timestamp}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard eyebrow="Review and testing" title="What the agents are saying">
          <div className="space-y-5">
            <div>
              <p className="section-label text-[var(--ink-500)]">Reviews</p>
              <div className="mt-3 space-y-3">
                {task.reviews.map((review) => (
                  <article key={review.reviewer} className="surface-item p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-[var(--ink-950)]">{review.reviewer}</p>
                      <StatusBadge label={review.status} tone={toneFromState(review.status)} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{review.summary}</p>
                  </article>
                ))}
              </div>
            </div>

            <div>
              <p className="section-label text-[var(--ink-500)]">Tests</p>
              <div className="mt-3 space-y-3">
                {task.tests.map((testRun) => (
                  <article key={testRun.title} className="surface-item p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-[var(--ink-950)]">{testRun.title}</p>
                      <StatusBadge label={testRun.status} tone={toneFromState(testRun.status)} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{testRun.summary}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard eyebrow="Controls" title="Operator actions">
        <div id="controls" className="flex flex-wrap gap-3">
          {[
            "Approve",
            "Request revision",
            "Pause",
            "Retry",
          ].map((action) => (
            <button
              key={action}
              type="button"
              className="rounded-full border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink-950)]"
            >
              {action}
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}