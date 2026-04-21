import { redirect } from "next/navigation";

type FeatureDetailPageProps = {
  params: Promise<{ projectId: string; featureId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FeatureDetailPage({ params, searchParams }: FeatureDetailPageProps) {
  const { projectId, featureId } = await params;
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

  search.set("feature", featureId);
  redirect(`/projects/${projectId}/features?${search.toString()}`);
}