import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pendingChanges } from "@/db/schema";
import { err, getContext, json, parseBody } from "@/lib/http";
import { resolvePendingChange } from "@/lib/config/engine";
import { describePatch, type ConfigPatch } from "@/lib/config/patch";

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const rows = await db
    .select()
    .from(pendingChanges)
    .where(eq(pendingChanges.companyId, ctx.company.id))
    .orderBy(desc(pendingChanges.createdAt))
    .limit(50);
  return json({
    pending: rows.map((r) => ({
      ...r,
      items: r.status === "pending" ? describePatch(r.patch as unknown as ConfigPatch) : [],
    })),
  });
}

const ActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
});

// Aprobar aplica el parche en el workspace; rechazar lo descarta.
// Solo admin+ puede aprobar (la IA propone, el humano autoriza).
export async function POST(req: Request) {
  const ctx = await getContext(req, "admin");
  if (!ctx) return err("No autorizado: se requiere rol administrador", 403);
  const body = await parseBody(req);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return err("Datos inválidos", 422);
  const result = await resolvePendingChange(ctx, parsed.data.id, parsed.data.action);
  if ("error" in result && result.error) return err(result.error, 404);
  return json(result);
}
