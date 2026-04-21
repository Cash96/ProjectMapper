import { notFound } from "next/navigation";

import type { ProjectRecord } from "@/domain/project-mapper";
import { getCurrentProjectRecord, listProjectRecords, readProjectRecord } from "@/lib/project-store";

export async function getProjects() {
  return listProjectRecords();
}

export async function getCurrentProject() {
  return getCurrentProjectRecord();
}

export async function getProject(projectId: string) {
  const project = await readProjectRecord(projectId);

  if (!project) {
    notFound();
  }

  return project;
}

export async function getTask(projectId: string, taskId: string) {
  const project = await getProject(projectId);
  const task = project.tasks.find((entry) => entry.id === taskId);

  if (!task) {
    notFound();
  }

  return task;
}

export function getDashboardCounts(project: ProjectRecord) {
  const tasks = project.tasks;

  return {
    pendingApprovals: project.approvals.filter((approval) => approval.status === "Open").length,
    executing: tasks.filter((task) => task.status === "Executing").length,
    awaitingInput: tasks.filter((task) => task.humanInputNeeded).length,
    readyToMerge: tasks.filter((task) => task.status === "Ready to Merge").length,
  };
}