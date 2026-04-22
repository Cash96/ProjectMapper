import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { answerExecutionQuestions } from "@/lib/execution-engine";
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

  const responses = [...formData.entries()]
    .filter(([key, value]) => key.startsWith("response-") && typeof value === "string" && value.trim().length > 0)
    .map(([key, value]) => ({
      messageId: key.replace("response-", ""),
      response: String(value),
    }));

  if (!executionRunId || responses.length === 0) {
    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features`, new URLSearchParams({
        feature: featureId,
        error: "At least one execution question response is required before continuing.",
      })),
      { status: 303 },
    );
  }

  try {
    const run = await answerExecutionQuestions({
      executionRunId,
      responses,
      operator: session.username,
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features`, new URLSearchParams({
        feature: featureId,
        execution: run.status === "Blocked" ? "blocked" : run.status === "AwaitingReview" ? "awaiting-review" : "continued",
        executionRunId: run.id,
      })),
      { status: 303 },
    );
  } catch (error) {
    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/features`, new URLSearchParams({
        feature: featureId,
        error: error instanceof Error ? error.message : "Execution could not continue.",
      })),
      { status: 303 },
    );
  }
}