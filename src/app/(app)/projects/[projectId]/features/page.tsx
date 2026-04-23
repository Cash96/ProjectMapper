import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { FieldShell, SelectablePanel, StepRail, StickyNextActionBar, WorkflowHero } from "@/components/workflow-primitives";
import { buildCanonicalWorkflowSteps, countCompletedWorkflowSteps, getCanonicalWorkflowHref, getCanonicalWorkflowStep, type CanonicalWorkflowStepNumber } from "@/lib/canonical-workflow";
import { getFeatureStatusTone } from "@/lib/feature-intelligence";
import { listFeatureInventory } from "@/lib/feature-store";
import { getProject } from "@/lib/project-helpers";

type FeaturesPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatSourceLabel(source: string) {
  return source === "AI Discovered" ? "AI discovered" : "Manual topic";
}

function buildFeedbackMessage(input: {
  error?: string;
  created?: string;
  deleted?: string;
  deletedName?: string;
  discovery?: string;
  count?: string;
}) {
  if (input.error) {
    return input.error;
  }

  if (input.created === "manual") {
    return "Manual feature topic created.";
  }

  if (input.deleted === "true") {
    return input.deletedName ? `${input.deletedName} was deleted.` : "Feature topic deleted.";
  }

  if (input.discovery === "complete") {
    return `Feature inventory refreshed with ${input.count ?? "new"} discovered topics.`;
  }

  return undefined;
}

export default async function FeaturesPage({ params, searchParams }: FeaturesPageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  const selectedFeatureId = getSearchValue(query.feature);

  if (selectedFeatureId) {
    const nextSearchParams = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (key === "feature" || value == null) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((entry) => nextSearchParams.append(key, entry));
        return;
      }

      nextSearchParams.set(key, value);
    });

    const nextUrl = nextSearchParams.toString();
    redirect(`/projects/${projectId}/features/${selectedFeatureId}${nextUrl ? `?${nextUrl}` : ""}`);
  }

  const project = await getProject(projectId);
  const features = await listFeatureInventory(projectId);
  const understandingReady = project.doctrine.approvalState === "Approved";
  const focusFeature = features.find((feature) => !feature.latestTargetStudyRunId || !feature.latestSourceStudyRunId) ?? features[0] ?? null;
  const completedFeatureCount = features.filter((feature) => feature.latestSourceStudyRunId && feature.latestTargetStudyRunId).length;
  const activeStepNumber: CanonicalWorkflowStepNumber = !understandingReady ? 2 : features.length === 0 ? 3 : 4;
  const workflowSteps = buildCanonicalWorkflowSteps({
    activeStep: activeStepNumber,
    stateByStep: {
      1: "complete",
      2: understandingReady ? "complete" : "blocked",
      3: features.length > 0 ? "complete" : understandingReady ? "in-progress" : "not-started",
      4: features.length > 0 ? "ready" : "not-started",
      5: "not-started",
      6: "not-started",
      7: "not-started",
      8: "not-started",
      9: "not-started",
      10: "not-started",
    },
    descriptionByStep: {
      2: understandingReady
        ? "Repository understanding and governing rules are approved."
        : "Feature work is blocked until the understanding workspace has approved repo answers and doctrine.",
      3: features.length > 0
        ? `${features.length} topic${features.length === 1 ? "" : "s"} are already in the inventory.`
        : "Generate the migration inventory from grounded repo understanding.",
      4: features.length > 0
        ? "Choose the single feature that should move next."
        : "Feature selection stays blocked until there is an inventory to choose from.",
    },
    badgesByStep: {
      2: [{ label: project.doctrine.approvalState, tone: understandingReady ? "success" as const : "warning" as const }],
      3: [{ label: `${features.length} tracked`, tone: features.length > 0 ? "info" as const : "warning" as const }],
      4: focusFeature ? [{ label: focusFeature.status, tone: getFeatureStatusTone(focusFeature.status) }] : undefined,
    },
    hrefByStep: {
      1: getCanonicalWorkflowHref(projectId, 1),
      2: getCanonicalWorkflowHref(projectId, 2),
      3: getCanonicalWorkflowHref(projectId, 3),
      4: getCanonicalWorkflowHref(projectId, 4),
      5: getCanonicalWorkflowHref(projectId, 5),
      6: getCanonicalWorkflowHref(projectId, 6),
      7: getCanonicalWorkflowHref(projectId, 7),
      8: getCanonicalWorkflowHref(projectId, 8),
      9: getCanonicalWorkflowHref(projectId, 9),
      10: getCanonicalWorkflowHref(projectId, 10),
    },
  });
  const activeStep = getCanonicalWorkflowStep(activeStepNumber);
  const completedWorkflowSteps = countCompletedWorkflowSteps(workflowSteps);
  const feedbackMessage = buildFeedbackMessage({
    error: getSearchValue(query.error),
    created: getSearchValue(query.created),
    deleted: getSearchValue(query.deleted),
    deletedName: getSearchValue(query.deletedName),
    discovery: getSearchValue(query.discovery),
    count: getSearchValue(query.count),
  });
  const nextAction = !understandingReady
    ? {
        title: "Finish repo understanding first",
        description: "Feature generation is intentionally blocked until the repo-understanding phase is approved.",
        action: { label: "Open Understanding", href: `/projects/${project.id}/understanding` },
      }
    : features.length === 0
      ? {
          title: "Generate the feature inventory",
          description: "This page should only create the migration queue, not start feature work yet.",
          action: undefined,
        }
      : {
          title: `Select ${focusFeature?.canonicalName ?? "the next feature"}`,
          description: "Choose one feature flow and move only that one forward.",
          action: focusFeature ? { label: "Open feature flow", href: `/projects/${project.id}/features/${focusFeature.id}` } : undefined,
        };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Features"
        title="Migration queue"
        description="A clean queue of migration topics, with one feature lane in motion at a time."
        actions={[
          { label: "Home", href: `/projects/${project.id}` },
          { label: "System Knowledge", href: `/projects/${project.id}/understanding` },
        ]}
      />

      {feedbackMessage ? (
        <div className={getSearchValue(query.error) ? "callout-danger" : "callout-info"}>{feedbackMessage}</div>
      ) : null}

      <WorkflowHero
        stepLabel={`Step ${activeStep.number}: ${activeStep.title}`}
        progressLabel={`${completedWorkflowSteps} of 10 complete`}
        title={nextAction.title}
        description={nextAction.description}
        state={workflowSteps.find((step) => step.number === activeStep.number)?.state ?? "not-started"}
        badges={workflowSteps.find((step) => step.number === activeStep.number)?.badges}
      />

      <StickyNextActionBar
        stepLabel={`Step ${activeStep.number}: ${activeStep.title}`}
        description={nextAction.title}
        action={nextAction.action}
      />

      {!understandingReady ? (
        <SectionCard eyebrow="Blocked" title="Feature work is still locked">
          <div className="focus-panel">
            <p className="focus-panel-title">The queue opens after System Knowledge is approved.</p>
            <p className="focus-panel-summary">Complete repo-level questions and approve doctrine before trying to create or move feature work.</p>
          </div>
        </SectionCard>
      ) : null}

      {understandingReady && focusFeature ? (
        <SectionCard eyebrow="Active feature" title={focusFeature.canonicalName} action={{ label: "Open active feature", href: `/projects/${project.id}/features/${focusFeature.id}` }}>
          <div className="focus-panel">
            <p className="focus-panel-title">This is the feature that should move next.</p>
            <p className="focus-panel-summary">{focusFeature.summary}</p>
            <div className="workflow-stage-meta">
              <StatusBadge label={focusFeature.status} tone={getFeatureStatusTone(focusFeature.status)} />
              <StatusBadge label={focusFeature.latestSourceStudyRunId ? "Repo 1 ready" : "Repo 1 next"} tone={focusFeature.latestSourceStudyRunId ? "success" : "warning"} />
              <StatusBadge label={focusFeature.latestTargetStudyRunId ? "Repo 2 ready" : "Repo 2 pending"} tone={focusFeature.latestTargetStudyRunId ? "success" : "warning"} />
            </div>
          </div>
          <details className="detail-shell">
            <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">View supporting detail</summary>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={focusFeature.priority} tone={focusFeature.priority === "High" ? "warning" : focusFeature.priority === "Medium" ? "info" : "neutral"} />
                <StatusBadge label={`${focusFeature.confidence} confidence`} tone={focusFeature.confidence === "High" ? "success" : focusFeature.confidence === "Medium" ? "info" : "warning"} />
                <StatusBadge label={formatSourceLabel(focusFeature.discoverySource)} tone="neutral" />
              </div>
              {focusFeature.sourceEvidence.length > 0 ? (
                <ul className="space-y-2 text-sm leading-6 text-[var(--ink-700)]">
                  {focusFeature.sourceEvidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        </SectionCard>
      ) : null}

      {understandingReady ? (
        <SectionCard eyebrow="Queue" title={`${features.length} tracked feature topic${features.length === 1 ? "" : "s"}`}>
          {features.length > 0 ? (
            <div className="compact-stack">
              {features.map((feature) => (
                <SelectablePanel key={feature.id} href={`/projects/${project.id}/features/${feature.id}`} selected={feature.id === focusFeature?.id}>
                  <div className="compact-row-main">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="compact-row-title">{feature.canonicalName}</p>
                        <p className="compact-row-summary">{feature.summary}</p>
                      </div>
                      <div className="compact-row-meta">
                        <StatusBadge label={feature.status} tone={getFeatureStatusTone(feature.status)} />
                      </div>
                    </div>
                    <div className="workflow-stage-meta">
                      <StatusBadge label={feature.latestSourceStudyRunId ? "Repo 1 done" : "Repo 1 pending"} tone={feature.latestSourceStudyRunId ? "success" : "warning"} />
                      <StatusBadge label={feature.latestTargetStudyRunId ? "Repo 2 done" : "Repo 2 pending"} tone={feature.latestTargetStudyRunId ? "success" : "warning"} />
                      <StatusBadge label={feature.latestTargetStudyRunId && feature.latestSourceStudyRunId ? "Ready for mapping" : "Still in study"} tone={feature.latestTargetStudyRunId && feature.latestSourceStudyRunId ? "info" : "neutral"} />
                    </div>
                  </div>
                </SelectablePanel>
              ))}
            </div>
          ) : (
            <div className="callout-info">
              No feature topics exist yet. Generate the queue from Repo 1, or add one manual migration topic.
            </div>
          )}
        </SectionCard>
      ) : null}

      <details>
        <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">Feature intake tools</summary>
        <div className="mt-4 space-y-4">
          <SectionCard eyebrow="Discovery" title="Refresh AI-Discovered Topics">
            <p>Generate migration-sized topics from the latest grounded Repo 1 understanding.</p>
            <form action={`/api/projects/${project.id}/features/discover`} method="post" className="mt-5 flex justify-start">
              <button type="submit" className="control-button-primary w-full sm:w-auto">
                Generate feature queue
              </button>
            </form>
          </SectionCard>

          <SectionCard eyebrow="Manual Topic" title="Add an Operator-Suggested Feature">
            <form action={`/api/projects/${project.id}/features/create`} method="post" className="space-y-4">
              <FieldShell label="Feature name" htmlFor="canonicalName" hint="Name the one coherent user-facing capability this migration topic represents.">
                <input
                  id="canonicalName"
                  type="text"
                  name="canonicalName"
                  className="field-input"
                  placeholder="Example: Standards alignment workflow"
                />
              </FieldShell>
              <FieldShell label="What should this topic cover?" htmlFor="summary" hint="Write the short operator summary that should appear in the queue.">
                <textarea
                  id="summary"
                  name="summary"
                  rows={4}
                  className="field-textarea"
                  placeholder="Describe the workflow, why it matters, and what part of the migration this topic should own."
                />
              </FieldShell>
              <FieldShell label="Tags" htmlFor="tags" hint="Optional comma-separated labels for routing or search.">
                <input
                  id="tags"
                  type="text"
                  name="tags"
                  className="field-input"
                  placeholder="Optional tags separated by commas"
                />
              </FieldShell>
              <div className="flex justify-end">
                <button type="submit" className="control-button-secondary w-full sm:w-auto">
                  Add manual topic
                </button>
              </div>
            </form>
          </SectionCard>
        </div>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-medium text-[var(--ink-700)]">View full workflow</summary>
        <div className="mt-4">
          <SectionCard eyebrow="Workflow" title="How features move">
            <StepRail steps={workflowSteps} />
          </SectionCard>
        </div>
      </details>

      {understandingReady ? (
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={`${completedFeatureCount} fully studied`} tone={completedFeatureCount > 0 ? "success" : "neutral"} />
          <StatusBadge label={`${features.length} total`} tone="info" />
        </div>
      ) : null}
    </div>
  );
}