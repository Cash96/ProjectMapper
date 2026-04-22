import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { abortExecutionRun } from "@/lib/execution-engine";
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

  if (!executionRunId) {
    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features/${featureId}`, new URLSearchParams({
        feature: featureId,
        error: "Execution run not found.",
      })),
      { status: 303 },
    );
  }

  try {
    await abortExecutionRun(executionRunId);

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features/${featureId}`, new URLSearchParams({
        feature: featureId,
        execution: "aborted",
      })),
      { status: 303 },
    );
  } catch (error) {
    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features/${featureId}`, new URLSearchParams({
        feature: featureId,
        error: error instanceof Error ? error.message : "Execution could not be aborted.",
      })),
      { status: 303 },
    );
  }
}