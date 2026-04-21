import { redirect } from "next/navigation";

type ApprovalsPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ApprovalsPage({ params }: ApprovalsPageProps) {
  const { projectId } = await params;

  redirect(`/projects/${projectId}/understanding`);
}
