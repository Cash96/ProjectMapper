import { redirect } from "next/navigation";

type RepoStudyPageProps = {
  params: Promise<{ projectId: string; repositoryId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RepoStudyPage({ params, searchParams }: RepoStudyPageProps) {
  const { projectId, repositoryId } = await params;
  const query = await searchParams;
  const search = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(query)) {
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        if (value) {
          search.append(key, value);
        }
      }
    } else if (rawValue) {
      search.set(key, rawValue);
    }
  }

  search.set("repositoryId", repositoryId);
  redirect(`/projects/${projectId}/understanding?${search.toString()}`);
}
