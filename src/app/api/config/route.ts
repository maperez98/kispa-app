import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";
import { err, getContext, json, parseBody } from "@/lib/http";
import { applyPatch, getOrCreateConfig } from "@/lib/config/engine";
import { ConfigPatchSchema } from "@/lib/config/patch";

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const config = await getOrCreateConfig(ctx.company.id);
  const sub = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.companyId, ctx.company.id))
    .limit(1);
  const planId = sub[0]?.planId ?? "free";
  const plan = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  return json({
    company: ctx.company,
    role: ctx.role,
    config: config,
    subscription: sub[0] ?? null,
    plan: plan[0] ?? null,
    paymentsEnabled: Boolean(process.env.PAYMENTS_PROVIDER),
  });
}

// Aplica un parche de configuración directamente (solo admin+). El flujo
// normal es proponer → vista previa → aprobar vía /api/config/pending.
export async function PATCH(req: Request) {
  const ctx = await getContext(req, "admin");
  if (!ctx) return err("No autorizado", 403);
  const body = await parseBody(req);
  const parsed = ConfigPatchSchema.safeParse(body?.patch);
  if (!parsed.success) return err(`Parche inválido: ${parsed.error.issues[0]?.message}`, 422);
  const result = await applyPatch(ctx, parsed.data);
  return json(result);
}
