import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { deleteFeatureExecutionRuns } from "@/lib/execution-store";
import { deleteFeatureIntelligence, readFeatureInventoryRecord } from "@/lib/feature-store";
import { deleteFeatureProposals } from "@/lib/proposal-store";
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
  const feature = await readFeatureInventoryRecord(projectId, featureId);

  if (!feature) {
    const searchParams = new URLSearchParams({
      error: "The requested feature topic could not be found.",
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  }

  await deleteFeatureIntelligence(projectId, featureId);
  await deleteFeatureProposals(projectId, featureId);
  await deleteFeatureExecutionRuns(projectId, featureId);

  const searchParams = new URLSearchParams({
    deleted: "true",
    deletedName: feature.canonicalName,
  });

  return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
    status: 303,
  });
}