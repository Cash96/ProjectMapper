import type { NextRequest } from "next/server";

import { verifySessionToken } from "@/lib/auth/session";
import { appConfig } from "@/lib/config";

export function getRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  if (!forwardedHost) {
    return requestUrl.origin;
  }

  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");
  return `${protocol}://${forwardedHost}`;
}

export function getRedirectUrl(request: Request, pathname: string, searchParams?: URLSearchParams) {
  const url = new URL(pathname, getRequestOrigin(request));

  if (searchParams) {
    url.search = searchParams.toString();
  }

  return url;
}

export function getOperatorSession(request: NextRequest) {
  const sessionToken = request.cookies.get(appConfig.auth.cookieName)?.value;
  return sessionToken ? verifySessionToken(sessionToken) : null;
}