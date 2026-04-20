"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { ProjectRecord } from "@/domain/project-mapper";
import { StatusBadge, toneFromState } from "@/components/status-badge";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  username,
  project,
  children,
}: {
  username: string;
  project: ProjectRecord;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const projectBase = `/projects/${project.id}`;
  const openApprovals = project.approvals.filter((approval) => approval.status === "Open");
  const navGroups = [
    {
      label: "Core",
      links: [
        { href: "/dashboard", label: "Dashboard" },
        { href: projectBase, label: "Project" },
        { href: `${projectBase}/tasks`, label: "Tasks" },
        { href: `${projectBase}/approvals`, label: "Approvals" },
      ],
    },
    {
      label: "Workspace",
      links: [
        { href: `${projectBase}/repositories`, label: "Repositories" },
        { href: `${projectBase}/doctrine`, label: "Doctrine" },
        { href: `${projectBase}/analysis`, label: "Analysis" },
        { href: "/settings", label: "Settings" },
      ],
    },
  ];
  const activeTasks = project.tasks.filter((task) => task.status === "Executing");
  const readyTasks = project.tasks.filter((task) => task.status === "Ready to Merge");

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1540px] gap-4 lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="surface-card-strong bg-surface-rail rounded-[2rem] p-4 text-white">
          <div className="rounded-[1.25rem] border border-white/10 bg-white/6 p-4">
            <p className="section-label text-white/60">ProjectMapper</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Migration control</h1>
          </div>

          <nav className="mt-6 space-y-6">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="section-label text-white/45">{group.label}</p>
                <div className="mt-3 space-y-2">
                  {group.links.map((link) => {
                    const active = isActive(pathname, link.href);

                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`block rounded-xl px-3 py-2.5 text-sm transition ${
                          active
                            ? "bg-white text-[var(--surface-rail)] shadow-lg"
                            : "text-white/74 hover:bg-white/8 hover:text-white"
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-6 space-y-3 rounded-[1.25rem] border border-white/10 bg-white/6 p-4 text-sm text-white/74">
            <div className="flex items-center justify-between gap-3">
              <span>Operator</span>
              <StatusBadge label={username} tone="info" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Active</span>
              <StatusBadge label={`${activeTasks.length} task`} tone="warning" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Pending</span>
              <StatusBadge label={`${openApprovals.length} approval`} tone="warning" />
            </div>
            <form action="/api/auth/logout" method="post" className="pt-3">
              <button
                type="submit"
                className="w-full rounded-full border border-white/14 px-4 py-2 text-left text-sm font-medium text-white transition hover:bg-white/10"
              >
                Log out
              </button>
            </form>
          </div>
        </aside>

        <div className="space-y-4">
          <header className="surface-card rounded-[2rem] px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="section-label text-[var(--ink-500)]">Current workspace</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">{project.name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={project.status} tone="info" />
                <StatusBadge label={`${openApprovals.length} pending`} tone="warning" />
                <StatusBadge label={`${readyTasks.length} ready`} tone="success" />
                <StatusBadge label={`${activeTasks.length} active`} tone={toneFromState("Executing")} />
              </div>
            </div>
          </header>

          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}