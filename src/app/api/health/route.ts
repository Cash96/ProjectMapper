import { NextResponse } from "next/server";

import { appConfig, getIntegrationHealth } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    service: "ProjectMapper",
    status: "ok",
    timestamp: new Date().toISOString(),
    deployment: appConfig.deployment,
    integrations: getIntegrationHealth(),
    repositories: appConfig.repositories,
  });
}