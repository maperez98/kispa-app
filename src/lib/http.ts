import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, companies, companyUsers, sessions, users } from "@/db/schema";
import { roleAtLeast, type Role } from "./permissions";

export const SESSION_COOKIE = "kispa_session";
export const SESSION_DAYS = 30;

export const hashPassword = (pw: string) => bcrypt.hashSync(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compareSync(pw, hash);
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export async function createSession(userId: string, userAgent?: string | null) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: userAgent ?? null,
  });
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function getSessionUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  const s = row[0];
  if (!s || s.expiresAt < new Date()) return null;
  const u = await db.select().from(users).where(eq(users.id, s.userId)).limit(1);
  return u[0] ?? null;
}

export interface Ctx {
  user: typeof users.$inferSelect;
  company: typeof companies.$inferSelect;
  role: string;
}

// Resuelve el usuario de la sesión + su empresa (header x-company-id) + rol.
// Toda operación multi-tenant pasa por aquí: nunca se confía solo en la UI.
export async function getContext(req: Request, minRole?: Role): Promise<Ctx | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const companyId = req.headers.get("x-company-id");
  let membership;
  if (companyId) {
    membership = await db
      .select()
      .from(companyUsers)
      .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, user.id)))
      .limit(1);
  } else {
    membership = await db
      .select()
      .from(companyUsers)
      .where(eq(companyUsers.userId, user.id))
      .limit(1);
  }
  const m = membership[0];
  if (!m) return null;
  if (minRole && !roleAtLeast(m.role, minRole)) return null;
  const c = await db.select().from(companies).where(eq(companies.id, m.companyId)).limit(1);
  if (!c[0]) return null;
  return { user, company: c[0], role: m.role };
}

export const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);

export const err = (message: string, status = 400, extra?: Record<string, unknown>) =>
  Response.json({ error: message, ...extra }, { status });

export async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function audit(
  ctx: Ctx,
  action: string,
  entityType?: string | null,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
  req?: Request,
) {
  try {
    await db.insert(auditLogs).values({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      action,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
      ip: req?.headers.get("x-forwarded-for") ?? null,
    });
  } catch {
    // La auditoría nunca debe romper la operación principal.
  }
}
