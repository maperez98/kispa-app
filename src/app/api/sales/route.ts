// Ventas: registro con ítems, descuento automático de inventario, creación
// de cuenta por cobrar si el pago es a crédito, disparo de automatizaciones
// y auditoría. Cancelar una venta restaura el stock.
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, inventoryMovements, products, receivables, saleItems, sales } from "@/db/schema";
import { audit, err, getContext, json, parseBody } from "@/lib/http";
import { can } from "@/lib/permissions";
import { runAutomations } from "@/lib/automations/engine";

const ItemSchema = z.object({
  productId: z.string().uuid().nullish(),
  name: z.string().max(200).optional(),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().min(0),
});

const CreateSchema = z.object({
  clientId: z.string().uuid().nullish(),
  paymentMethod: z.enum(["cash", "card", "transfer", "credit"]).default("cash"),
  note: z.string().max(500).nullish(),
  items: z.array(ItemSchema).min(1),
});

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  if (!can(ctx.role, "sales", "read")) return err("Sin permiso", 403);
  const rows = await db
    .select({
      id: sales.id,
      number: sales.number,
      totalCents: sales.totalCents,
      subtotalCents: sales.subtotalCents,
      taxCents: sales.taxCents,
      paymentMethod: sales.paymentMethod,
      status: sales.status,
      note: sales.note,
      createdAt: sales.createdAt,
      clientName: clients.name,
    })
    .from(sales)
    .leftJoin(clients, eq(sales.clientId, clients.id))
    .where(eq(sales.companyId, ctx.company.id))
    .orderBy(desc(sales.createdAt))
    .limit(200);

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db.select().from(saleItems).where(sql`${saleItems.saleId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    : [];
  const itemsBySale = new Map<string, typeof items>();
  for (const it of items) {
    const arr = itemsBySale.get(it.saleId) ?? [];
    arr.push(it);
    itemsBySale.set(it.saleId, arr);
  }
  return json({ rows: rows.map((r) => ({ ...r, items: itemsBySale.get(r.id) ?? [] })) });
}

export async function POST(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  if (!can(ctx.role, "sales", "write")) return err("Sin permiso para registrar ventas", 403);
  const body = await parseBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return err(`Datos inválidos: ${parsed.error.issues[0]?.message}`, 422);

  const { items, paymentMethod, clientId, note } = parsed.data;

  const result = await db.transaction(async (tx) => {
    // Resolver productos y calcular totales
    const resolved = [];
    let subtotal = 0;
    for (const it of items) {
      let name = it.name ?? "Producto";
      let product = null;
      if (it.productId) {
        const p = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, it.productId), eq(products.companyId, ctx.company.id)))
          .limit(1);
        product = p[0] ?? null;
        if (product) name = product.name;
      }
      const total = Math.round(it.quantity * it.unitPriceCents);
      subtotal += total;
      resolved.push({ ...it, name, product });
    }

    const maxRow = await tx
      .select({ n: sql<number>`coalesce(max(${sales.number}), 0)` })
      .from(sales)
      .where(eq(sales.companyId, ctx.company.id));
    const number = Number(maxRow[0]?.n ?? 0) + 1;

    const [sale] = await tx
      .insert(sales)
      .values({
        companyId: ctx.company.id,
        clientId: clientId ?? null,
        number,
        subtotalCents: subtotal,
        taxCents: 0,
        totalCents: subtotal,
        paymentMethod,
        status: "completed",
        note: note ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    for (const it of resolved) {
      await tx.insert(saleItems).values({
        saleId: sale.id,
        productId: it.productId ?? null,
        name: it.name,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
        totalCents: Math.round(it.quantity * it.unitPriceCents),
      });
      if (it.product) {
        const newStock = it.product.stock - it.quantity;
        await tx.insert(inventoryMovements).values({
          companyId: ctx.company.id,
          productId: it.product.id,
          type: "out",
          quantity: it.quantity,
          reason: `Venta #${number}`,
          reference: sale.id,
          createdBy: ctx.user.id,
        });
        await tx.update(products).set({ stock: newStock, updatedAt: new Date() }).where(eq(products.id, it.product.id));
        const pCtx = { entityType: "product", entityId: it.product.id, ...it.product, stock: newStock };
        await runAutomations(ctx.company.id, "inventory.changed", pCtx);
        if (newStock <= it.product.lowStockThreshold) {
          await runAutomations(ctx.company.id, "inventory.low", pCtx);
        }
      }
    }

    if (paymentMethod === "credit") {
      await tx.insert(receivables).values({
        companyId: ctx.company.id,
        clientId: clientId ?? null,
        saleId: sale.id,
        description: `Venta #${number} a crédito`,
        amountCents: subtotal,
        paidCents: 0,
        status: "pending",
        dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      });
    }
    return sale;
  });

  await runAutomations(ctx.company.id, "sale.created", {
    entityType: "sale",
    entityId: result.id,
    number: result.number,
    totalCents: result.totalCents,
    paymentMethod: result.paymentMethod,
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
  });
  await audit(ctx, "sale.created", "sale", result.id, { totalCents: result.totalCents, paymentMethod: result.paymentMethod, items: items.length });
  return json({ sale: result }, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  if (!can(ctx.role, "sales", "write")) return err("Sin permiso", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return err("Falta id", 422);
  const body = await parseBody(req);
  const status = body?.status;
  if (!["completed", "pending", "cancelled"].includes(String(status))) return err("Estado inválido", 422);

  const existing = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, id), eq(sales.companyId, ctx.company.id)))
    .limit(1);
  const sale = existing[0];
  if (!sale) return err("Venta no encontrada", 404);

  if (status === "cancelled" && sale.status === "completed") {
    // Restaurar inventario de los ítems vendidos
    const its = await db.select().from(saleItems).where(eq(saleItems.saleId, id));
    for (const it of its) {
      if (!it.productId) continue;
      const p = await db.select().from(products).where(eq(products.id, it.productId)).limit(1);
      if (!p[0]) continue;
      const newStock = p[0].stock + it.quantity;
      await db.insert(inventoryMovements).values({
        companyId: ctx.company.id,
        productId: it.productId,
        type: "in",
        quantity: it.quantity,
        reason: `Devolución por venta #${sale.number} cancelada`,
        reference: id,
        createdBy: ctx.user.id,
      });
      await db.update(products).set({ stock: newStock, updatedAt: new Date() }).where(eq(products.id, it.productId));
    }
    await db
      .update(receivables)
      .set({ status: "cancelled" as never, updatedAt: new Date() })
      .where(and(eq(receivables.saleId, id), eq(receivables.companyId, ctx.company.id)));
  }
  await db.update(sales).set({ status: String(status) }).where(eq(sales.id, id));
  await audit(ctx, "sale.status_changed", "sale", id, { status });
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  if (!can(ctx.role, "sales", "delete")) return err("Sin permiso para eliminar ventas", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return err("Falta id", 422);
  const existing = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, id), eq(sales.companyId, ctx.company.id)))
    .limit(1);
  if (!existing[0]) return err("Venta no encontrada", 404);
  if (existing[0].status === "completed") {
    const its = await db.select().from(saleItems).where(eq(saleItems.saleId, id));
    for (const it of its) {
      if (!it.productId) continue;
      const p = await db.select().from(products).where(eq(products.id, it.productId)).limit(1);
      if (p[0]) {
        await db
          .update(products)
          .set({ stock: p[0].stock + it.quantity, updatedAt: new Date() })
          .where(eq(products.id, it.productId));
      }
    }
  }
  await db.delete(sales).where(eq(sales.id, id));
  await audit(ctx, "sale.deleted", "sale", id, {});
  return json({ ok: true });
}
