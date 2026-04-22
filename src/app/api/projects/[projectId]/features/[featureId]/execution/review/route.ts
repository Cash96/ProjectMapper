import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { reviewExecutionRun } from "@/lib/execution-engine";
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
  const formData = await request.formData();
  const executionRunId = String(formData.get("executionRunId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();

  if (!executionRunId || (decision !== "Approved" && decision !== "Rejected")) {
    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features`, new URLSearchParams({
        feature: featureId,
        error: "A valid execution review decision is required.",
      })),
      { status: 303 },
    );
  }

  try {
    await reviewExecutionRun({ executionRunId, decision });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features`, new URLSearchParams({
        feature: featureId,
        execution: decision === "Approved" ? "approved" : "rejected",
      })),
      { status: 303 },
    );
  } catch (error) {
    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features`, new URLSearchParams({
        feature: featureId,
        error: error instanceof Error ? error.message : "Execution review could not be saved.",
      })),
      { status: 303 },
    );
  }
}