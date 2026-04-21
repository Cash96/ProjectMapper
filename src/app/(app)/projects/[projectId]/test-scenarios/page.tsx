import { redirect } from "next/navigation";

type TestScenariosPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function TestScenariosPage({ params }: TestScenariosPageProps) {
  const { projectId } = await params;

  redirect(`/projects/${projectId}/features`);
}
