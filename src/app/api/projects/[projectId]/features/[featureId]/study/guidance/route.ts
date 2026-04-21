import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { appendOperatorGuidanceToFeatureStudyRun } from "@/lib/feature-intelligence";
import { readFeatureStudyRun } from "@/lib/feature-store";
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
  const runId = String(formData.get("runId") ?? "").trim();
  const guidance = String(formData.get("guidance") ?? "").trim();
  const repositoryRole = String(formData.get("repositoryRole") ?? "").trim();
  const redirectToFeatures = (searchParams: URLSearchParams) =>
    NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });

  if (!runId || !guidance) {
    const searchParams = new URLSearchParams({
      error: "Guidance text is required before saving operator context.",
      feature: featureId,
    });

    return redirectToFeatures(searchParams);
  }

  const run = await readFeatureStudyRun(runId);

  if (!run || run.projectId !== projectId || run.featureId !== featureId) {
    const searchParams = new URLSearchParams({
      error: "The requested feature study run could not be found.",
      feature: featureId,
    });

    return redirectToFeatures(searchParams);
  }

  if (run.status !== "Complete") {
    const searchParams = new URLSearchParams({
      error: "Operator guidance can only be added to a completed feature study run.",
      feature: featureId,
    });

    return redirectToFeatures(searchParams);
  }

  await appendOperatorGuidanceToFeatureStudyRun({
    studyRunId: runId,
    author: session.username,
    guidance,
  });

  const searchParams = new URLSearchParams({
    guidance: "saved",
    role: repositoryRole,
    version: String(run.version),
    feature: featureId,
  });

  return redirectToFeatures(searchParams);
}