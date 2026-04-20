import { createHmac, timingSafeEqual } from "node:crypto";

import { appConfig } from "@/lib/config";

export interface AuthSession {
  username: string;
  expiresAt: number;
}

function sign(payload: string) {
  return createHmac("sha256", appConfig.auth.secret)
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(session: AuthSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string) {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = sign(payload);
  const matches = timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );

  if (!matches) {
    return null;
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthSession;

  if (parsed.expiresAt <= Date.now()) {
    return null;
  }

  return parsed;
}