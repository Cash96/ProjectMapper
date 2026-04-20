import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { appConfig, getIntegrationHealth } from "@/lib/config";

export default function SettingsPage() {
  const health = getIntegrationHealth();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Service wiring and deployment target."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SectionCard eyebrow="Deployment" title="Cloud Run target">
          <div className="space-y-3">
            <div className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4">
              <p className="font-medium text-[var(--ink-950)]">Project</p>
              <p className="mt-1 text-sm text-[var(--ink-700)]">{appConfig.deployment.projectId}</p>
            </div>
            <div className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4">
              <p className="font-medium text-[var(--ink-950)]">Service</p>
              <p className="mt-1 text-sm text-[var(--ink-700)]">{appConfig.deployment.service}</p>
            </div>
            <div className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4">
              <p className="font-medium text-[var(--ink-950)]">Region</p>
              <p className="mt-1 text-sm text-[var(--ink-700)]">{appConfig.deployment.region}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Integration health" title="Configured now">
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={`MongoDB ${health.mongodb ? "configured" : "pending"}`} tone={health.mongodb ? "success" : "warning"} />
            <StatusBadge label={`Gemini ${health.gemini ? "configured" : "pending"}`} tone={health.gemini ? "success" : "warning"} />
            <StatusBadge label={`GitHub token ${health.githubToken ? "configured" : "pending"}`} tone={health.githubToken ? "success" : "warning"} />
          </div>
          <div className="mt-5 space-y-3">
            <div className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4">
              <p className="font-medium text-[var(--ink-950)]">Repo A</p>
              <p className="mt-1 text-sm text-[var(--ink-700)]">{appConfig.repositories.repoA}</p>
            </div>
            <div className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4">
              <p className="font-medium text-[var(--ink-950)]">Repo B</p>
              <p className="mt-1 text-sm text-[var(--ink-700)]">{appConfig.repositories.repoB}</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}