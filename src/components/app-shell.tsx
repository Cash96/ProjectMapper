"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import type { ProjectRecord } from "@/domain/project-mapper";
import { StatusBadge, toneFromState } from "@/components/status-badge";

function isActive(pathname: string, href: string, exact = false) {
  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  username,
  project,
  children,
}: {
  username: string;
  project: ProjectRecord | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const projectBase = project ? `/projects/${project.id}` : null;
  const openApprovals = project?.approvals.filter((approval) => approval.status === "Open") ?? [];
  const activeTasks = project?.tasks.filter((task) => task.status === "Executing") ?? [];
  const readyTasks = project?.tasks.filter((task) => task.status === "Ready to Merge") ?? [];
  const navGroups = projectBase
    ? [
        {
          label: "Workspace",
          links: [
            { href: projectBase, label: "Home" },
            { href: `${projectBase}/understanding`, label: "Understanding" },
            { href: `${projectBase}/features`, label: "Features" },
            { href: "/settings", label: "Settings" },
          ],
        },
      ]
    : [
        {
          label: "Core",
          links: [
            { href: "/projects", label: "Projects" },
            { href: "/settings", label: "Settings" },
          ],
        },
      ];

  const sidebar = (
    <>
      <div className="rounded-[1.15rem] border border-white/10 bg-white/6 p-4">
        <p className="section-label text-white/65">ProjectMapper</p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-white sm:text-xl">Migration control</h1>
        <p className="mt-2 text-sm leading-6 text-white/72">
          Internal operator workspace for repo study, doctrine, and migration control.
        </p>
      </div>

      <nav className="mt-5 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="section-label text-white/45">{group.label}</p>
            <div className="mt-2.5 space-y-1.5">
              {group.links.map((link) => {
                const active = projectBase
                  ? link.href === projectBase || link.href === "/settings"
                    ? isActive(pathname, link.href, true)
                    : isActive(pathname, link.href)
                  : isActive(pathname, link.href, true);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`block rounded-2xl border px-3.5 py-3 text-sm font-medium leading-none transition ${
                      active
                        ? "border-white/70 bg-white text-[var(--ink-950)] shadow-[0_8px_24px_rgba(255,255,255,0.14)]"
                        : "border-transparent bg-transparent text-white/82 hover:border-white/12 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    <span className={active ? "text-[var(--ink-950)]" : "text-inherit"}>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-5 space-y-3 rounded-[1.15rem] border border-white/10 bg-white/6 p-4 text-sm text-white/78">
        <div className="flex items-center justify-between gap-3">
          <span>Operator</span>
          <StatusBadge label={username} tone="info" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Active</span>
          <StatusBadge label={`${activeTasks.length} task${activeTasks.length === 1 ? "" : "s"}`} tone="warning" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Pending</span>
          <StatusBadge label={`${openApprovals.length} approval${openApprovals.length === 1 ? "" : "s"}`} tone="warning" />
        </div>
        <form action="/api/auth/logout" method="post" className="pt-2">
          <button
            type="submit"
            className="control-button-secondary w-full border-white/16 bg-transparent text-white hover:bg-white/10"
          >
            Log out
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4 md:px-5 md:py-5">
      <div className="mx-auto max-w-[1500px]">
        <header className="surface-card mb-3 rounded-[1.35rem] px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="section-label">ProjectMapper</p>
              <p className="mt-1 truncate text-base font-semibold tracking-tight text-[var(--ink-950)]">
                {project ? project.name : "No project configured"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              className="control-button-secondary px-3.5 text-sm"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-navigation"
            >
              {mobileNavOpen ? "Close" : "Menu"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge label={project?.status ?? "No active project"} tone="info" />
            <StatusBadge label={`${openApprovals.length} pending`} tone="warning" />
            <StatusBadge label={`${activeTasks.length} active`} tone={toneFromState("Executing")} />
          </div>
        </header>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-40 bg-[rgba(21,34,48,0.26)] lg:hidden" onClick={() => setMobileNavOpen(false)}>
            <aside
              id="mobile-navigation"
              className="absolute inset-y-0 left-0 w-[min(84vw,22rem)] overflow-y-auto bg-surface-rail p-4 text-white shadow-[0_24px_64px_rgba(21,34,48,0.32)]"
              onClick={(event) => event.stopPropagation()}
            >
              {sidebar}
            </aside>
          </div>
        ) : null}

        <div className="grid min-h-[calc(100vh-1.5rem)] gap-3 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-4">
          <aside className="surface-card-strong sticky top-4 hidden h-fit bg-surface-rail rounded-[1.6rem] p-4 text-white lg:block">
            {sidebar}
          </aside>

          <div className="min-w-0 space-y-3 lg:space-y-4">
            <header className="surface-card hidden rounded-[1.5rem] px-5 py-4 lg:block">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="section-label text-[var(--ink-500)]">Current workspace</p>
                  <p className="mt-1 truncate text-lg font-semibold tracking-tight text-[var(--ink-950)]">
                    {project ? project.name : "No project configured"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={project?.status ?? "No active project"} tone="info" />
                  <StatusBadge label={`${openApprovals.length} pending`} tone="warning" />
                  <StatusBadge label={`${readyTasks.length} ready`} tone="success" />
                  <StatusBadge label={`${activeTasks.length} active`} tone={toneFromState("Executing")} />
                </div>
              </div>
            </header>

            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}