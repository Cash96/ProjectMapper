import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { runFeatureStudy } from "@/lib/feature-intelligence";
import { readProjectRecord } from "@/lib/project-store";
import { getOperatorSession, getRedirectUrl } from "@/lib/request-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; featureId: string }> },
) {
  const session = getOperatorSession(request);

  if (!session) {
    return NextResponse.redirect(getRedirectUrl(request, "/login"), { status: 303 });
  }

  const { projectId, featureId } = await params;
  const project = await readProjectRecord(projectId);

  if (!project) {
    return NextResponse.redirect(getRedirectUrl(request, "/projects"), { status: 303 });
  }

  const formData = await request.formData();
  const repositoryRole = String(formData.get("repositoryRole") ?? "").trim();
  const continueFromRunId = String(formData.get("continueFromRunId") ?? "").trim();
  const guidance = String(formData.get("guidance") ?? "").trim();

  if (repositoryRole !== "Source" && repositoryRole !== "Target") {
    const searchParams = new URLSearchParams({
      error: "A valid repository role is required for feature study.",
      feature: featureId,
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  }

  try {
    const run = await runFeatureStudy({
      project,
      featureId,
      repositoryRole,
      triggeredBy: session.username,
      continueFromRunId: continueFromRunId || undefined,
      initialGuidance: guidance || undefined,
    });
    const searchParams = new URLSearchParams({
      study: run?.status === "Complete" ? "complete" : "failed",
      role: repositoryRole,
      version: String(run?.version ?? ""),
      feature: featureId,
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  } catch (error) {
    const searchParams = new URLSearchParams({
      error: error instanceof Error ? error.message : "Feature study failed.",
      feature: featureId,
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  }
}