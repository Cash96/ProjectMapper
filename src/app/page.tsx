import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { appConfig } from "@/lib/config";
import { verifySessionToken } from "@/lib/auth/session";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(appConfig.auth.cookieName)?.value;
  const session = sessionToken ? verifySessionToken(sessionToken) : null;

  redirect(session ? "/dashboard" : "/login");
}
