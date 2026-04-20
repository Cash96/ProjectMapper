import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, toneFromRisk, toneFromState } from "@/components/status-badge";
import { getProject } from "@/lib/project-helpers";

type ApprovalsPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function ApprovalsPage({ params, searchParams }: ApprovalsPageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  const project = await getProject(projectId);
  const updatedId = getSearchValue(query.updated);
  const status = getSearchValue(query.status);
  const error = getSearchValue(query.error);
  const feedbackMessage =
    error === "invalid-decision"
      ? "The requested approval action was invalid and nothing changed."
      : updatedId && status
        ? `Approval ${updatedId} recorded as ${status === "approved" ? "approved" : "revision requested"}.`
        : undefined;
  const openApprovals = project.approvals.filter((approval) => approval.status === "Open");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Approvals"
        title="Approvals"
        description="Open decisions and recent outcomes."
      />

      {feedbackMessage ? (
        <div className="rounded-3xl border border-[rgba(50,95,155,0.18)] bg-[rgba(50,95,155,0.08)] px-5 py-4 text-sm text-[var(--signal-blue)]">
          {feedbackMessage}
        </div>
      ) : null}

      <SectionCard eyebrow="Needs operator attention" title="Open items">
        {openApprovals.length > 0 ? (
          <div className="space-y-3">
            {openApprovals.map((approval) => (
            <article key={approval.id} className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4">
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

              <form action={`/api/approvals/${approval.id}/decide`} method="post" className="mt-4 space-y-3">
                <input type="hidden" name="projectId" value={project.id} />
                <div>
                  <label htmlFor={`note-${approval.id}`} className="mb-2 block text-sm font-medium text-[var(--ink-950)]">
                    Operator note
                  </label>
                  <textarea
                    id={`note-${approval.id}`}
                    name="note"
                    rows={3}
                    className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--signal-blue)]"
                    placeholder="Optional note"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    name="decision"
                    value="approved"
                    className="bg-surface-rail rounded-full px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5"
                  >
                    {approval.approveLabel}
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="revision-requested"
                    className="rounded-full border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink-950)]"
                  >
                    {approval.revisionLabel}
                  </button>
                </div>
              </form>
            </article>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-7 text-[var(--ink-700)]">
            No open approvals are waiting right now. Resolved items move into the decision history below.
          </p>
        )}
      </SectionCard>

      <SectionCard eyebrow="Decision history" title="Resolved items">
        <div className="space-y-3">
          {project.approvals.filter((approval) => approval.status !== "Open").map((approval) => (
            <article key={approval.id} className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--ink-950)]">{approval.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--ink-700)]">{approval.summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={approval.kind} tone="info" />
                  <StatusBadge label={approval.status} tone={toneFromState(approval.status)} />
                </div>
              </div>
              {approval.decision ? (
                <div className="mt-4 rounded-2xl border border-[var(--line-soft)] bg-white/70 p-4 text-sm leading-6 text-[var(--ink-700)]">
                  <p>
                    Recorded by {approval.decision.decidedBy} on {approval.decision.decidedAt}.
                  </p>
                  {approval.decision.note ? <p className="mt-2">{approval.decision.note}</p> : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}