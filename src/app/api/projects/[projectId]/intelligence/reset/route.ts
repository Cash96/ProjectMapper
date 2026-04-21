import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { readProjectRecord } from "@/lib/project-store";
import { getOperatorSession, getRedirectUrl } from "@/lib/request-utils";
import { resetProjectIntelligence } from "@/lib/reset-project-intelligence";

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
    return NextResponse.redirect(getRedirectUrl(request, "/projects"), { status: 303 });
  }

  try {
    await resetProjectIntelligence(project);
    const searchParams = new URLSearchParams({ reset: "complete" });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}`, searchParams), { status: 303 });
  } catch (error) {
    const searchParams = new URLSearchParams({
      error: error instanceof Error ? error.message : "Reset failed.",
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}`, searchParams), { status: 303 });
  }
}