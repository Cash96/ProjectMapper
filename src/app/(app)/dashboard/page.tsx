import { redirect } from "next/navigation";

import { getCurrentProject } from "@/lib/project-helpers";

export default async function DashboardPage() {
  const project = await getCurrentProject();

  redirect(project ? `/projects/${project.id}` : "/projects");
}