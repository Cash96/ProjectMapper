import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { startExecutionRun } from "@/lib/execution-engine";
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
  const proposalId = String(formData.get("proposalId") ?? "").trim();

  if (!proposalId) {
    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features`, new URLSearchParams({
        feature: featureId,
        error: "An approved proposal is required before execution can start.",
      })),
      { status: 303 },
    );
  }

  try {
    const run = await startExecutionRun({
      projectId,
      featureId,
      proposalId,
      operator: session.username,
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features`, new URLSearchParams({
        feature: featureId,
        execution: run.status === "Blocked" ? "blocked" : "started",
        executionRunId: run.id,
      })),
      { status: 303 },
    );
  } catch (error) {
    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features`, new URLSearchParams({
        feature: featureId,
        error: error instanceof Error ? error.message : "Execution could not start.",
      })),
      { status: 303 },
    );
  }
}