import { redirect } from "next/navigation";

type AnalysisPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function AnalysisPage({ params }: AnalysisPageProps) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/understanding`);
}
