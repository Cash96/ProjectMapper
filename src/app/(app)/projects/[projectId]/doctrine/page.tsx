import { redirect } from "next/navigation";

type DoctrinePageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function DoctrinePage({ params }: DoctrinePageProps) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/understanding`);
}
