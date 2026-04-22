import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { approveFeatureProposal } from "@/lib/feature-proposals";
import { readFeatureProposal } from "@/lib/proposal-store";
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
    const searchParams = new URLSearchParams({
      feature: featureId,
      error: "A proposal must exist before it can be approved.",
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features/${featureId}`, searchParams), {
      status: 303,
    });
  }

  const proposal = await readFeatureProposal(proposalId);

  if (!proposal || proposal.projectId !== projectId || proposal.featureId !== featureId) {
    const searchParams = new URLSearchParams({
      feature: featureId,
      error: "The requested proposal could not be found.",
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features/${featureId}`, searchParams), {
      status: 303,
    });
  }

  await approveFeatureProposal({
    proposalId,
    approvedBy: session.username,
  });

  const searchParams = new URLSearchParams({
    feature: featureId,
    proposal: "approved",
    proposalVersion: String(proposal.version),
  });

  return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features/${featureId}`, searchParams), {
    status: 303,
  });
}