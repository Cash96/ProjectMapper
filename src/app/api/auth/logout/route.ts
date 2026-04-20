import { NextResponse } from "next/server";

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
  const response = NextResponse.redirect(new URL("/login", getRequestOrigin(request)), {
    status: 303,
  });

  response.cookies.set({
    name: appConfig.auth.cookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });

  return response;
}