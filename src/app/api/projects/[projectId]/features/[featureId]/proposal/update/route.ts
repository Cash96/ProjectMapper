import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { parseTextareaList, updateFeatureProposalDraft } from "@/lib/feature-proposals";
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
      error: "A proposal must exist before it can be updated.",
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  }

  const proposal = await readFeatureProposal(proposalId);

  if (!proposal || proposal.projectId !== projectId || proposal.featureId !== featureId) {
    const searchParams = new URLSearchParams({
      feature: featureId,
      error: "The requested proposal could not be found.",
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  }

  await updateFeatureProposalDraft({
    proposalId,
    editedBy: session.username,
    operatorComments: String(formData.get("operatorComments") ?? "").trim(),
    operatorResponses: String(formData.get("operatorResponses") ?? "").trim(),
    operatorNotes: String(formData.get("operatorNotes") ?? "").trim(),
    productDirectionDecisions: String(formData.get("productDirectionDecisions") ?? "").trim(),
    constraintsNonNegotiables: String(formData.get("constraintsNonNegotiables") ?? "").trim(),
    content: {
      proposalSummary: String(formData.get("proposalSummary") ?? proposal.content.proposalSummary).trim(),
      sourceBehaviorSummary: parseTextareaList(formData.get("sourceBehaviorSummary"), proposal.content.sourceBehaviorSummary),
      targetContextSummary: parseTextareaList(formData.get("targetContextSummary"), proposal.content.targetContextSummary),
      gapAssessment: parseTextareaList(formData.get("gapAssessment"), proposal.content.gapAssessment),
      designDirectionOptions: proposal.content.designDirectionOptions,
      governingV2Patterns: parseTextareaList(formData.get("governingV2Patterns"), proposal.content.governingV2Patterns),
      recommendedBuildShape: parseTextareaList(formData.get("recommendedBuildShape"), proposal.content.recommendedBuildShape),
      operatorDesignQuestions: parseTextareaList(formData.get("operatorDesignQuestions"), proposal.content.operatorDesignQuestions),
      explicitNonGoals: parseTextareaList(formData.get("explicitNonGoals"), proposal.content.explicitNonGoals),
      risksAndUnknowns: parseTextareaList(formData.get("risksAndUnknowns"), proposal.content.risksAndUnknowns),
      questionsForOperator: parseTextareaList(formData.get("questionsForOperator"), proposal.content.questionsForOperator),
      suggestedImplementationScope: parseTextareaList(formData.get("suggestedImplementationScope"), proposal.content.suggestedImplementationScope),
      revisionDelta: proposal.content.revisionDelta,
    },
  });

  const searchParams = new URLSearchParams({
    feature: featureId,
    proposal: "saved",
    proposalVersion: String(proposal.version),
  });

  return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
    status: 303,
  });
}