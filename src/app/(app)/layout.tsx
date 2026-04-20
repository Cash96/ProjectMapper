import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { verifySessionToken } from "@/lib/auth/session";
import { appConfig } from "@/lib/config";
import { getProject } from "@/lib/project-helpers";
import { defaultProjectId } from "@/lib/project-store";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(appConfig.auth.cookieName)?.value;
  const session = sessionToken ? verifySessionToken(sessionToken) : null;

  if (!session) {
    redirect("/login");
  }

  const project = await getProject(defaultProjectId);

  return (
    <AppShell username={session.username} project={project}>
      {children}
    </AppShell>
  );
}