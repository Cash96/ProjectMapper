import { redirect } from "next/navigation";

type ExecutionPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ExecutionPage({ params }: ExecutionPageProps) {
  const { projectId } = await params;

  redirect(`/projects/${projectId}/features`);
}
