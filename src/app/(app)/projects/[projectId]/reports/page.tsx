import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { getProject } from "@/lib/project-helpers";

type ReportsPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ReportsPage({ params }: ReportsPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Reports"
        title="Reports"
        description="Saved summaries."
      />

      <SectionCard eyebrow="Current reports" title="Generated summaries">
        <div className="space-y-3">
          {project.reports.map((report) => (
            <article key={report.id} className="surface-item p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--ink-950)]">{report.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--ink-700)]">{report.summary}</p>
                </div>
                <div className="text-right text-sm text-[var(--ink-500)]">
                  <p>{report.type}</p>
                  <p>{report.timestamp}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}