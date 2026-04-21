import { redirect } from "next/navigation";

type TasksPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function TasksPage({ params }: TasksPageProps) {
  const { projectId } = await params;

  redirect(`/projects/${projectId}/features`);
}
