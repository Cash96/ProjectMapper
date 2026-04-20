import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getLatestAnalysisRun } from "@/lib/analysis-store";
import { generateDoctrineDraft } from "@/lib/doctrine-generator";
import { createDoctrineVersion } from "@/lib/doctrine-store";
import { readProjectRecord } from "@/lib/project-store";
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

  const analysisRun = await getLatestAnalysisRun(projectId);

  if (!analysisRun) {
    const searchParams = new URLSearchParams({
      error: "Run analysis before generating doctrine.",
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/doctrine`, searchParams),
      { status: 303 },
    );
  }

  const formData = await request.formData();
  const feedback = String(formData.get("feedback") ?? "").trim();

  try {
    const content = await generateDoctrineDraft({
      project,
      analysisRun,
      operatorFeedback: feedback || undefined,
    });
    const version = await createDoctrineVersion({
      projectId,
      analysisRunId: analysisRun.id,
      content,
      generatedBy: session.username,
      revisionFeedback: feedback || undefined,
    });
    const searchParams = new URLSearchParams({
      doctrine: "generated",
      version: String(version.version),
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/doctrine`, searchParams),
      { status: 303 },
    );
  } catch (error) {
    const searchParams = new URLSearchParams({
      error: error instanceof Error ? error.message : "Doctrine generation failed.",
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/doctrine`, searchParams),
      { status: 303 },
    );
  }
}