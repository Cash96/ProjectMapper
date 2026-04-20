import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { getProject } from "@/lib/project-helpers";

type StrategicNotesPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function StrategicNotesPage({ params }: StrategicNotesPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Strategic notes"
        title="Strategic notes"
        description="Project-level guidance."
      />

      <SectionCard eyebrow="Guidance layer" title="Current strategic notes">
        <div className="space-y-3">
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
  );
}