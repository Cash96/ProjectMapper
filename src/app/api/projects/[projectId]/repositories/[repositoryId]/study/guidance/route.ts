import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { appendOperatorGuidanceToStudyRun } from "@/lib/repo-study";
import { readRepoStudyRun } from "@/lib/repo-study-store";
import { readProjectRecord } from "@/lib/project-store";
import { getOperatorSession, getRedirectUrl } from "@/lib/request-utils";

function buildCompiledGuidance(formData: FormData) {
  const directGuidance = String(formData.get("guidance") ?? "").trim();
  const questionBlocks = new Map<string, { question: string; answer: string }>();

  for (const [key, rawValue] of formData.entries()) {
    const value = String(rawValue ?? "").trim();

    if (key.startsWith("questionText-")) {
      const id = key.slice("questionText-".length);
      const existing = questionBlocks.get(id) ?? { question: "", answer: "" };
      existing.question = value;
      questionBlocks.set(id, existing);
    }

    if (key.startsWith("questionAnswer-")) {
      const id = key.slice("questionAnswer-".length);
      const existing = questionBlocks.get(id) ?? { question: "", answer: "" };
      existing.answer = value;
      questionBlocks.set(id, existing);
    }
  }

  const answeredQuestions = [...questionBlocks.values()]
    .filter((entry) => entry.question && entry.answer)
    .map((entry, index) => `${index + 1}. ${entry.question}\nAnswer: ${entry.answer}`);

  const sections = [
    answeredQuestions.length > 0
      ? ["Question responses:", ...answeredQuestions].join("\n\n")
      : "",
    directGuidance
      ? `Additional guidance:\n${directGuidance}`
      : "",
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; repositoryId: string }> },
) {
  const session = getOperatorSession(request);

  if (!session) {
    return NextResponse.redirect(getRedirectUrl(request, "/login"), { status: 303 });
  }

  const { projectId, repositoryId } = await params;
  const project = await readProjectRecord(projectId);

  const buildUnderstandingSearchParams = (values: Record<string, string>) => {
    const searchParams = new URLSearchParams({ repositoryId });

    for (const [key, value] of Object.entries(values)) {
      searchParams.set(key, value);
    }

    return searchParams;
  };

  if (!project) {
    return NextResponse.redirect(getRedirectUrl(request, "/projects"), { status: 303 });
  }

  const repository = project.repositories.find((entry) => entry.id === repositoryId);

  if (!repository) {
    return NextResponse.redirect(getRedirectUrl(request, `/projects/${projectId}`), { status: 303 });
  }

  const formData = await request.formData();
  const runId = String(formData.get("runId") ?? "").trim();
  const guidance = buildCompiledGuidance(formData);

  if (!runId || !guidance) {
    const searchParams = buildUnderstandingSearchParams({
      error: "Add at least one question response or one guidance note before saving operator context.",
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/understanding`, searchParams),
      { status: 303 },
    );
  }

  const run = await readRepoStudyRun(runId);

  if (!run || run.projectId !== projectId || run.repositoryId !== repositoryId) {
    const searchParams = buildUnderstandingSearchParams({
      error: "The requested study run could not be found for this repository.",
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/understanding`, searchParams),
      { status: 303 },
    );
  }

  if (run.status !== "Complete") {
    const searchParams = buildUnderstandingSearchParams({
      error: "Operator guidance can only be added to a completed study run.",
    });

    return NextResponse.redirect(
      getRedirectUrl(request, `/projects/${projectId}/understanding`, searchParams),
      { status: 303 },
    );
  }

  await appendOperatorGuidanceToStudyRun({
    studyRunId: runId,
    author: session.username,
    guidance,
  });

  const searchParams = buildUnderstandingSearchParams({
    guidance: "saved",
    version: String(run.version),
  });

  return NextResponse.redirect(
    getRedirectUrl(request, `/projects/${projectId}/understanding`, searchParams),
    { status: 303 },
  );
}
