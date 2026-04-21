import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createManualFeature } from "@/lib/feature-intelligence";
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
    return NextResponse.redirect(getRedirectUrl(request, "/projects"), { status: 303 });
  }

  const formData = await request.formData();
  const canonicalName = String(formData.get("canonicalName") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!canonicalName || !summary) {
    const searchParams = new URLSearchParams({
      error: "Feature name and summary are required for a manual topic suggestion.",
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  }

  try {
    const record = await createManualFeature({
      projectId,
      canonicalName,
      summary,
      tags,
      suggestedBy: session.username,
    });
    const searchParams = new URLSearchParams({
      created: "manual",
      feature: record.id,
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  } catch (error) {
    const searchParams = new URLSearchParams({
      error: error instanceof Error ? error.message : "Manual feature creation failed.",
    });

    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}/features`, searchParams), {
      status: 303,
    });
  }
}