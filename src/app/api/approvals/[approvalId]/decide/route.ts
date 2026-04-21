import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { recordDoctrineDecision } from "@/lib/doctrine-store";
import { readProjectRecord, saveApprovalDecision } from "@/lib/project-store";
import { getOperatorSession, getRedirectUrl } from "@/lib/request-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  const session = getOperatorSession(request);

  if (!session) {
    return NextResponse.redirect(getRedirectUrl(request, "/login"), { status: 303 });
  }

  const { approvalId } = await params;
  const formData = await request.formData();
  const projectId = String(formData.get("projectId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "");

  const project = await readProjectRecord(projectId);

  if (!project) {
    return NextResponse.redirect(getRedirectUrl(request, "/projects"), { status: 303 });
  }

  if (decision !== "approved" && decision !== "revision-requested") {
    const searchParams = new URLSearchParams({
      error: "invalid-decision",
    });
    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/understanding`, searchParams),
      { status: 303 },
    );
  }

  const updatedProject = await saveApprovalDecision({
    projectId,
    approvalId,
    status: decision === "approved" ? "Approved" : "Revision Requested",
    note,
    decidedBy: session.username,
  });

  const updatedApproval = updatedProject?.approvals.find((entry) => entry.id === approvalId);

  if (updatedApproval?.target.entity === "doctrine") {
    await recordDoctrineDecision({
      projectId,
      status: decision === "approved" ? "Approved" : "Revision Requested",
      note,
      decidedBy: session.username,
    });
  }

  const searchParams = new URLSearchParams({
    updated: approvalId,
    status: decision,
  });

  return NextResponse.redirect(
    getRedirectUrl(request, `/projects/${projectId}/understanding`, searchParams),
    { status: 303 },
  );
}