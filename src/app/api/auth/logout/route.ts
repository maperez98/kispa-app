import { cookies } from "next/headers";
import { destroySession, json, SESSION_COOKIE } from "@/lib/http";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  store.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return json({ ok: true });
}
