import { redirect } from "next/navigation";

type TaskDetailPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { projectId } = await params;

  redirect(`/projects/${projectId}/features`);
}
