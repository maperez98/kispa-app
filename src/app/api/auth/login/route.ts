import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, err, json, SESSION_COOKIE, verifyPassword } from "@/lib/http";

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err("Correo o contraseña inválidos", 422);

  const rows = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);
  const u = rows[0];
  if (!u || !verifyPassword(parsed.data.password, u.passwordHash)) {
    return err("Correo o contraseña incorrectos", 401);
  }

  const { token, expiresAt } = await createSession(u.id, req.headers.get("user-agent"));
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
  return json({ user: { id: u.id, name: u.name, email: u.email } });
}
