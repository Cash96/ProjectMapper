import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildRevEdProjectRecord } from "@/lib/project-bootstrap";
import { upsertProjectRecord } from "@/lib/project-store";
import { getOperatorSession, getRedirectUrl } from "@/lib/request-utils";

export async function POST(request: NextRequest) {
  const session = getOperatorSession(request);

  if (!session) {
    return NextResponse.redirect(getRedirectUrl(request, "/login"), { status: 303 });
  }

  const project = buildRevEdProjectRecord();
  await upsertProjectRecord(project);

  const searchParams = new URLSearchParams({
    bootstrap: "complete",
    projectId: project.id,
  });

  return NextResponse.redirect(getRedirectUrl(request, "/projects", searchParams), { status: 303 });
}