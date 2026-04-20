import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { updateDoctrineVersion } from "@/lib/doctrine-store";
import { getOperatorSession, getRedirectUrl } from "@/lib/request-utils";

function parseList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = getOperatorSession(request);

  if (!session) {
    return NextResponse.redirect(getRedirectUrl(request, "/login"), { status: 303 });
  }

  const { projectId } = await params;
  const formData = await request.formData();
  const doctrineId = String(formData.get("doctrineId") ?? "");

  if (!doctrineId) {
    const searchParams = new URLSearchParams({
      error: "Doctrine version was missing.",
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/doctrine`, searchParams),
      { status: 303 },
    );
  }

  const updatedVersion = await updateDoctrineVersion({
    projectId,
    doctrineId,
    editedBy: session.username,
    content: {
      summary: String(formData.get("summary") ?? "").trim(),
      architecturePatterns: parseList(formData.get("architecturePatterns")),
      uxPatterns: parseList(formData.get("uxPatterns")),
      interactionPatterns: parseList(formData.get("interactionPatterns")),
      criticalRules: parseList(formData.get("criticalRules")),
      antiPatterns: parseList(formData.get("antiPatterns")),
      groundingReferences: parseList(formData.get("groundingReferences")),
    },
  });

  const searchParams = new URLSearchParams(
    updatedVersion
      ? { doctrine: "saved", version: String(updatedVersion.version) }
      : { error: "Doctrine version could not be updated." },
  );

  return NextResponse.redirect(
    getRedirectUrl(request, `/projects/${projectId}/doctrine`, searchParams),
    { status: 303 },
  );
}