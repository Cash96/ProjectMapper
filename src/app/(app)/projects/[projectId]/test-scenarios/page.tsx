import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { getProject } from "@/lib/project-helpers";

type TestScenariosPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function TestScenariosPage({ params }: TestScenariosPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Test scenarios"
        title="Test scenarios"
        description="Reusable validation flows."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {project.testScenarios.map((scenario) => (
          <SectionCard key={scenario.id} eyebrow={scenario.role} title={scenario.name}>
            <p>{scenario.purpose}</p>
            <div className="mt-4 surface-item p-4">
              <p className="font-medium text-[var(--ink-950)]">Start at {scenario.startPoint}</p>
              <ul className="mt-3 space-y-2">
                {scenario.checkpoints.map((checkpoint) => (
                  <li key={checkpoint}>{checkpoint}</li>
                ))}
              </ul>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}