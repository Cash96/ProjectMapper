import { redirect } from "next/navigation";

type StrategicNotesPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function StrategicNotesPage({ params }: StrategicNotesPageProps) {
  const { projectId } = await params;

  redirect(`/projects/${projectId}/understanding`);
}
