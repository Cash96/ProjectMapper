import { NextResponse } from "next/server";

import { createSessionToken } from "@/lib/auth/session";
import { appConfig } from "@/lib/config";

function getRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  if (!forwardedHost) {
    return requestUrl.origin;
  }

  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");
  return `${protocol}://${forwardedHost}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const requestOrigin = getRequestOrigin(request);

  if (
    username !== appConfig.auth.username ||
    password !== appConfig.auth.password
  ) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-credentials", requestOrigin),
      { status: 303 },
    );
  }

  const expiresAt = Date.now() + appConfig.auth.sessionDurationMs;
  const response = NextResponse.redirect(
    new URL("/dashboard", requestOrigin),
    {
      status: 303,
    },
  );

  response.cookies.set({
    name: appConfig.auth.cookieName,
    value: createSessionToken({ username, expiresAt }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });

  return response;
}