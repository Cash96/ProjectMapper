import { redirect } from "next/navigation";

type ReportsPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ReportsPage({ params }: ReportsPageProps) {
  const { projectId } = await params;

  redirect(`/projects/${projectId}/understanding`);
}
