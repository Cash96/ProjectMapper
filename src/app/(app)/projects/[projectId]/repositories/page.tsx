import { redirect } from "next/navigation";

type RepositoriesPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function RepositoriesPage({ params }: RepositoriesPageProps) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}`);
}