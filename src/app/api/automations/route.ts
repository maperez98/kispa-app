// Reglas de automatización: CRUD (admin+) y ejecución manual de escaneos.
// Las reglas se disparan automáticamente desde las rutas de ventas,
// productos, gastos, pedidos y pagos.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { automationRules, automationRuns } from "@/db/schema";
import { audit, err, getContext, json, parseBody } from "@/lib/http";
import { can } from "@/lib/permissions";
import { runAutomations, runScheduledScans } from "@/lib/automations/engine";
import { ActionSchema, ConditionSchema } from "@/lib/config/patch";

const TRIGGERS = [
  "sale.created",
  "inventory.changed",
  "inventory.low",
  "expense.created",
  "order.created",
  "order.status_changed",
  "receivable.overdue",
  "payment.registered",
  "schedule.daily",
] as const;

const RuleSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(500).nullish(),
  trigger: z.enum(TRIGGERS),
  conditions: z.array(ConditionSchema).default([]),
  actions: z.array(ActionSchema).default([]),
  enabled: z.boolean().default(true),
});

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  if (!can(ctx.role, "automations", "read")) return err("Sin permiso", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id && url.searchParams.get("runs") === "1") {
    const runs = await db
      .select()
      .from(automationRuns)
      .where(and(eq(automationRuns.ruleId, id), eq(automationRuns.companyId, ctx.company.id)))
      .orderBy(desc(automationRuns.executedAt))
      .limit(100);
    return json({ runs });
  }
  const rules = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.companyId, ctx.company.id))
    .orderBy(desc(automationRules.createdAt));
  return json({ rules, triggers: TRIGGERS });
}

export async function POST(req: Request) {
  const ctx = await getContext(req, "admin");
  if (!ctx) return err("No autorizado: se requiere rol administrador", 403);
  const url = new URL(req.url);

  // Ejecución manual: POST /api/automations?run=1  { trigger? }
  if (url.searchParams.get("run") === "1") {
    if (!can(ctx.role, "automations", "write")) return err("Sin permiso", 403);
    const body = (await parseBody(req)) ?? {};
    const trigger = String(body.trigger ?? "schedule.daily");
    if (trigger === "schedule.daily") {
      const res = await runScheduledScans(ctx.company.id);
      await audit(ctx, "automations.manual_run", "automation", undefined, { trigger, res });
      return json({ ok: true, ...res });
    }
    const res = await runAutomations(ctx.company.id, trigger, { entityType: trigger.split(".")[0] });
    await audit(ctx, "automations.manual_run", "automation", undefined, { trigger, res });
    return json({ ok: true, results: res });
  }

  const body = await parseBody(req);
  const parsed = RuleSchema.safeParse(body);
  if (!parsed.success) return err(`Regla inválida: ${parsed.error.issues[0]?.message}`, 422);
  const [row] = await db
    .insert(automationRules)
    .values({ companyId: ctx.company.id, createdBy: ctx.user.id, ...parsed.data })
    .returning();
  await audit(ctx, "automation.created", "automation_rule", row.id, { name: row.name, trigger: row.trigger });
  return json({ rule: row }, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await getContext(req, "admin");
  if (!ctx) return err("No autorizado", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return err("Falta id", 422);
  const body = await parseBody(req);
  const parsed = RuleSchema.partial().safeParse(body);
  if (!parsed.success) return err("Datos inválidos", 422);
  const existing = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.companyId, ctx.company.id)))
    .limit(1);
  if (!existing[0]) return err("Regla no encontrada", 404);
  await db
    .update(automationRules)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(automationRules.id, id));
  await audit(ctx, "automation.updated", "automation_rule", id, { changes: parsed.data });
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await getContext(req, "admin");
  if (!ctx) return err("No autorizado", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return err("Falta id", 422);
  const existing = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.companyId, ctx.company.id)))
    .limit(1);
  if (!existing[0]) return err("Regla no encontrada", 404);
  await db.delete(automationRules).where(eq(automationRules.id, id));
  await audit(ctx, "automation.deleted", "automation_rule", id, { name: existing[0].name });
  return json({ ok: true });
}
