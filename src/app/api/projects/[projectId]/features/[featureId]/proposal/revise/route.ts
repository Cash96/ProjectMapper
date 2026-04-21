import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { generateFeatureProposal } from "@/lib/feature-proposals";
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
  const revisionNote = String(formData.get("revisionNote") ?? "").trim();

  try {
    const proposal = await generateFeatureProposal({
      project,
      featureId,
      generatedBy: session.username,
      revisionNote: revisionNote || undefined,
    });
    const searchParams = new URLSearchParams({
      feature: featureId,
      proposal: "revised",
      proposalVersion: String(proposal.version),
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  } catch (error) {
    const searchParams = new URLSearchParams({
      feature: featureId,
      error: error instanceof Error ? error.message : "Proposal revision failed.",
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  }
}