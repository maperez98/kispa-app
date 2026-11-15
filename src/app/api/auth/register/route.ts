import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, err, hashPassword, json, SESSION_COOKIE } from "@/lib/http";

const Schema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(100),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err(`Datos inválidos: ${parsed.error.issues[0]?.message}`, 422);
  const { name, email, password } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (existing[0]) return err("Ya existe una cuenta con ese correo electrónico", 409);

  const [u] = await db
    .insert(users)
    .values({ name, email: email.toLowerCase(), passwordHash: hashPassword(password) })
    .returning();

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
