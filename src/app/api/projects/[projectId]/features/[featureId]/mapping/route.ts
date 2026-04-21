import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { refreshFeatureMappingSummary } from "@/lib/feature-intelligence";
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

  try {
    await refreshFeatureMappingSummary({ project, featureId });
    const searchParams = new URLSearchParams({
      mapping: "refreshed",
      feature: featureId,
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  } catch (error) {
    const searchParams = new URLSearchParams({
      error: error instanceof Error ? error.message : "Feature mapping refresh failed.",
      feature: featureId,
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  }
}