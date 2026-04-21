import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { readProjectRecord } from "@/lib/project-store";
import { runProjectAnalysis } from "@/lib/repository-analysis";
import { getOperatorSession, getRedirectUrl } from "@/lib/request-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = getOperatorSession(request);

  if (!session) {
    return NextResponse.redirect(getRedirectUrl(request, "/login"), { status: 303 });
  }

  const { projectId } = await params;
  const project = await readProjectRecord(projectId);

  if (!project) {
    return NextResponse.redirect(getRedirectUrl(request, "/dashboard"), { status: 303 });
  }

  try {
    const run = await runProjectAnalysis({
      projectId,
      repositories: project.repositories,
      triggeredBy: session.username,
    });
    const searchParams = new URLSearchParams({
      analysis: run.status === "Complete" ? "complete" : "failed",
      version: String(run.version),
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/understanding`, searchParams),
      { status: 303 },
    );
  } catch (error) {
    const searchParams = new URLSearchParams({
      error: error instanceof Error ? error.message : "Analysis run failed.",
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/understanding`, searchParams),
      { status: 303 },
    );
  }
}