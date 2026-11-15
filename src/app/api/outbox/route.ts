// Sincronización: cola de operaciones pendientes del cliente (outbox) y
// feed de cambios del servidor. Cada operación del cliente llega con un
// clientOpId único → se aplica de forma idempotente (reintentos no duplican).
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  clients,
  expenses,
  orders,
  outboxOps,
  products,
  receivables,
  sales,
} from "@/db/schema";
import { audit, err, getContext, json, parseBody } from "@/lib/http";
import { can } from "@/lib/permissions";

const OpSchema = z.object({
  clientOpId: z.string().min(1).max(100),
  entity: z.enum(["clients", "products", "sales", "expenses", "orders", "receivables"]),
  operation: z.enum(["create", "update", "delete"]),
  payload: z.record(z.string(), z.unknown()),
});

const TABLES: Record<string, any> = { clients, products, expenses, orders, receivables, sales };

async function applyOp(companyId: string, userId: string, op: z.infer<typeof OpSchema>) {
  const table = TABLES[op.entity];
  const p = op.payload as Record<string, any>;
  if (op.operation === "delete") {
    if (!p.id) throw new Error("Falta id para eliminar");
    await db.delete(table).where(and(eq(table.id, p.id), eq(table.companyId, companyId)));
    return { id: p.id };
  }
  const values: Record<string, unknown> = { companyId, ...p };
  delete values.id;
  if (op.operation === "create") {
    const inserted = (await db.insert(table).values(values).returning()) as any[];
    return { id: inserted[0]?.id };
  }
  if (!p.id) throw new Error("Falta id para actualizar");
  await db
    .update(table)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(table.id, p.id), eq(table.companyId, companyId)));
  return { id: p.id };
}

export async function POST(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  if (!can(ctx.role, "sales", "write")) return err("Sin permiso de escritura", 403);
  const body = await parseBody(req);
  const parsed = z.object({ ops: z.array(OpSchema).max(100) }).safeParse(body);
  if (!parsed.success) return err("Lote inválido", 422);

  const results: Array<Record<string, unknown>> = [];
  for (const op of parsed.data.ops) {
    const existing = await db
      .select()
      .from(outboxOps)
      .where(eq(outboxOps.clientOpId, op.clientOpId))
      .limit(1);
    if (existing[0]) {
      results.push({ clientOpId: op.clientOpId, status: existing[0].status, idempotent: true });
      continue;
    }
    try {
      const applied = await applyOp(ctx.company.id, ctx.user.id, op);
      const [row] = await db
        .insert(outboxOps)
        .values({
          companyId: ctx.company.id,
          clientOpId: op.clientOpId,
          entity: op.entity,
          operation: op.operation,
          payload: op.payload,
          status: "applied",
          appliedAt: new Date(),
        })
        .returning();
      await audit(ctx, `outbox.${op.operation}`, op.entity, applied.id ?? null, { via: "sync" });
      results.push({ clientOpId: op.clientOpId, status: "applied", id: row.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.insert(outboxOps).values({
        companyId: ctx.company.id,
        clientOpId: op.clientOpId,
        entity: op.entity,
        operation: op.operation,
        payload: op.payload,
        status: "failed",
        error: msg,
        attempts: 1,
      });
      results.push({ clientOpId: op.clientOpId, status: "failed", error: msg });
    }
  }
  return json({ results });
}

// Pull: cambios recientes del servidor (auditoría) para sincronizar otros dispositivos.
export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : new Date(0);
  const changes = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.companyId, ctx.company.id), gt(auditLogs.createdAt, sinceDate)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);
  void sql;
  return json({ serverTime: new Date().toISOString(), changes });
}
