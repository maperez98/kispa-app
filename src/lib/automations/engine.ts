// Motor de automatización empresarial.
// Ejecuta reglas ante disparadores reales (venta creada, inventario cambiado,
// gasto registrado, pedido creado, escaneo programado...), con evaluación de
// condiciones, ejecución de acciones controladas, historial, manejo de errores
// y protección contra ejecuciones duplicadas (índice único rule+triggerKey).
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { alerts, automationRules, automationRuns, orders, products, receivables } from "@/db/schema";
import { evaluateConditions, renderTemplate, type Condition } from "./conditions";

export interface TriggerContext extends Record<string, unknown> {
  entityType?: string;
  entityId?: string;
}

interface RuleAction {
  type: string;
  params?: Record<string, unknown>;
}

export async function runAutomations(
  companyId: string,
  trigger: string,
  ctx: TriggerContext,
): Promise<Array<Record<string, unknown>>> {
  const rules = await db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.companyId, companyId),
        eq(automationRules.trigger, trigger),
        eq(automationRules.enabled, true),
      ),
    );

  const results: Array<Record<string, unknown>> = [];
  for (const rule of rules) {
    const conds = (rule.conditions ?? []) as unknown as Condition[];
    if (!evaluateConditions(conds, ctx)) {
      results.push({ rule: rule.name, status: "skipped", reason: "conditions_not_met" });
      continue;
    }
    const triggerKey = `${trigger}:${ctx.entityId ?? "global"}`;
    try {
      // Inserción atómica: si ya existe ejecución para esta regla+entidad, se omite (anti-duplicados).
      const inserted = await db
        .insert(automationRuns)
        .values({ ruleId: rule.id, companyId, trigger, triggerKey, status: "running" })
        .onConflictDoNothing({ target: [automationRuns.ruleId, automationRuns.triggerKey] })
        .returning();
      if (!inserted[0]) {
        results.push({ rule: rule.name, status: "skipped", reason: "duplicate" });
        continue;
      }
      const runId = inserted[0].id;
      const actionResults: unknown[] = [];
      for (const action of (rule.actions ?? []) as unknown as RuleAction[]) {
        actionResults.push(await executeAction(companyId, action, ctx));
      }
      await db
        .update(automationRuns)
        .set({ status: "success", result: { actions: actionResults } })
        .where(eq(automationRuns.id, runId));
      results.push({ rule: rule.name, status: "success", actions: actionResults });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const existing = await db
        .select({ id: automationRuns.id })
        .from(automationRuns)
        .where(and(eq(automationRuns.ruleId, rule.id), eq(automationRuns.triggerKey, triggerKey)))
        .limit(1);
      if (existing[0]) {
        await db
          .update(automationRuns)
          .set({ status: "error", error: msg })
          .where(eq(automationRuns.id, existing[0].id));
      } else {
        await db.insert(automationRuns).values({
          ruleId: rule.id,
          companyId,
          trigger,
          triggerKey,
          status: "error",
          error: msg,
        });
      }
      results.push({ rule: rule.name, status: "error", error: msg });
    }
  }
  return results;
}

// Acciones controladas: la IA nunca llama a esto directamente; solo propone
// reglas que el backend ejecuta mediante estas acciones permitidas.
async function executeAction(
  companyId: string,
  action: RuleAction,
  ctx: TriggerContext,
): Promise<Record<string, unknown>> {
  const p = action.params ?? {};
  switch (action.type) {
    case "create_alert":
    case "create_reminder": {
      const severity =
        (p.severity as string) ?? (action.type === "create_reminder" ? "info" : "warning");
      const [row] = await db
        .insert(alerts)
        .values({
          companyId,
          title: renderTemplate(String(p.title ?? "Alerta"), ctx),
          message: renderTemplate(String(p.message ?? ""), ctx),
          severity,
          entityType: (ctx.entityType as string) ?? null,
          entityId: (ctx.entityId as string) ?? null,
        })
        .returning({ id: alerts.id });
      return { type: action.type, alertId: row.id };
    }
    case "update_order_status": {
      if (ctx.entityType === "order" && ctx.entityId && p.status) {
        await db
          .update(orders)
          .set({ status: String(p.status), updatedAt: new Date() })
          .where(and(eq(orders.id, ctx.entityId as string), eq(orders.companyId, companyId)));
        return { type: action.type, status: p.status };
      }
      return { type: action.type, skipped: "no hay pedido en el contexto" };
    }
    case "log":
    default:
      return { type: "log", note: renderTemplate(String(p.message ?? "Acción ejecutada"), ctx) };
  }
}

// Escaneos programados (equivalente a un cron interno): stock bajo por
// producto y cuentas por cobrar vencidas.
export async function runScheduledScans(companyId: string) {
  const low = await db
    .select()
    .from(products)
    .where(and(eq(products.companyId, companyId), lte(products.stock, products.lowStockThreshold)));
  for (const p of low) {
    await runAutomations(companyId, "inventory.low", { entityType: "product", entityId: p.id, ...p });
  }
  const overdue = await db
    .select()
    .from(receivables)
    .where(
      and(
        eq(receivables.companyId, companyId),
        sql`${receivables.dueDate} < now()`,
        sql`${receivables.status} in ('pending','partial')`,
      ),
    );
  for (const r of overdue) {
    await runAutomations(companyId, "receivable.overdue", {
      entityType: "receivable",
      entityId: r.id,
      ...r,
      amount: (r.amountCents - r.paidCents) / 100,
      clientName: "el cliente",
    });
    await db
      .update(receivables)
      .set({ status: "overdue", updatedAt: new Date() })
      .where(eq(receivables.id, r.id));
  }
  return { lowStockScanned: low.length, overdueScanned: overdue.length };
}
