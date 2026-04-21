import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { readProjectRecord } from "@/lib/project-store";
import { runRepositoryStudy } from "@/lib/repo-study";
import { getOperatorSession, getRedirectUrl } from "@/lib/request-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; repositoryId: string }> },
) {
  const session = getOperatorSession(request);

  if (!session) {
    return NextResponse.redirect(getRedirectUrl(request, "/login"), { status: 303 });
  }

  const { projectId, repositoryId } = await params;
  const project = await readProjectRecord(projectId);

  if (!project) {
    return NextResponse.redirect(getRedirectUrl(request, "/dashboard"), { status: 303 });
  }

  const repository = project.repositories.find((entry) => entry.id === repositoryId);

  if (!repository) {
    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}`), { status: 303 });
  }

  const formData = await request.formData();
  const continueFromRunId = String(formData.get("continueFromRunId") ?? "").trim();

  try {
    const run = await runRepositoryStudy({
      projectId,
      repository,
      triggeredBy: session.username,
      continueFromRunId: continueFromRunId || undefined,
    });
    const searchParams = new URLSearchParams({
      study: run?.status === "Complete" ? "complete" : "failed",
      version: String(run?.version ?? ""),
      repositoryId,
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/understanding`, searchParams),
      { status: 303 },
    );
  } catch (error) {
    const searchParams = new URLSearchParams({
      error: error instanceof Error ? error.message : "Repo study failed.",
      repositoryId,
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/understanding`, searchParams),
      { status: 303 },
    );
  }
}