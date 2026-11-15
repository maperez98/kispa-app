import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { audit, err, getContext, json } from "@/lib/http";

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const rows = await db
    .select()
    .from(alerts)
    .where(eq(alerts.companyId, ctx.company.id))
    .orderBy(desc(alerts.createdAt))
    .limit(100);
  return json({ rows, unread: rows.filter((r) => !r.read).length });
}

export async function PATCH(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (url.searchParams.get("all") === "1") {
    await db.update(alerts).set({ read: true }).where(and(eq(alerts.companyId, ctx.company.id), eq(alerts.read, false)));
    return json({ ok: true });
  }
  if (!id) return err("Falta id", 422);
  await db.update(alerts).set({ read: true }).where(and(eq(alerts.id, id), eq(alerts.companyId, ctx.company.id)));
  await audit(ctx, "alert.read", "alert", id, {});
  return json({ ok: true });
}
