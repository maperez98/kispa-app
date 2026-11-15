// Productos e inventario: CRUD + movimientos de stock con ajuste automático,
// alertas de stock bajo (motor de automatización) y límite del plan.
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { inventoryMovements, plans, productCategories, products, subscriptions } from "@/db/schema";
import { audit, err, getContext, json, parseBody } from "@/lib/http";
import { can } from "@/lib/permissions";
import { runAutomations } from "@/lib/automations/engine";

const ProductSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(60).nullish(),
  categoryId: z.string().uuid().nullish(),
  priceCents: z.number().int().min(0).default(0),
  costCents: z.number().int().min(0).default(0),
  stock: z.number().min(0).default(0),
  lowStockThreshold: z.number().min(0).default(5),
  unit: z.string().max(20).default("unidad"),
  extra: z.record(z.string(), z.unknown()).optional(),
});

const MovementSchema = z.object({
  type: z.enum(["in", "out", "adjust"]),
  quantity: z.number().positive(),
  reason: z.string().max(300).optional(),
  reference: z.string().max(100).optional(),
});

async function getPlanLimits(companyId: string) {
  const sub = await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1);
  const plan = await db.select().from(plans).where(eq(plans.id, sub[0]?.planId ?? "free")).limit(1);
  return (plan[0]?.limits ?? {}) as Record<string, number>;
}

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  if (!can(ctx.role, "products", "read")) return err("Sin permiso", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id && url.searchParams.get("movements") === "1") {
    const rows = await db
      .select()
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.productId, id), eq(inventoryMovements.companyId, ctx.company.id)))
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(100);
    return json({ rows });
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      categoryId: products.categoryId,
      categoryName: productCategories.name,
      priceCents: products.priceCents,
      costCents: products.costCents,
      stock: products.stock,
      lowStockThreshold: products.lowStockThreshold,
      unit: products.unit,
      extra: products.extra,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(eq(products.companyId, ctx.company.id))
    .orderBy(desc(products.createdAt))
    .limit(500);
  return json({ rows });
}

export async function POST(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  if (!can(ctx.role, "products", "write")) return err("Sin permiso", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  // Movimiento de inventario: POST /api/products?id=<id>&movement=1
  if (id && url.searchParams.get("movement") === "1") {
    const body = await parseBody(req);
    const parsed = MovementSchema.safeParse(body);
    if (!parsed.success) return err(`Datos inválidos: ${parsed.error.issues[0]?.message}`, 422);
    const product = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.companyId, ctx.company.id)))
      .limit(1);
    if (!product[0]) return err("Producto no encontrado", 404);
    const p = product[0];
    const { type, quantity } = parsed.data;
    let newStock = p.stock;
    if (type === "in") newStock = p.stock + quantity;
    else if (type === "out") newStock = p.stock - quantity;
    else newStock = quantity; // adjust: fija el stock

    await db.insert(inventoryMovements).values({
      companyId: ctx.company.id,
      productId: id,
      type,
      quantity,
      reason: parsed.data.reason ?? null,
      reference: parsed.data.reference ?? null,
      createdBy: ctx.user.id,
    });
    await db
      .update(products)
      .set({ stock: newStock, updatedAt: new Date() })
      .where(eq(products.id, id));

    const movementCtx = { entityType: "product", entityId: id, ...p, stock: newStock };
    await runAutomations(ctx.company.id, "inventory.changed", movementCtx);
    if (newStock <= p.lowStockThreshold) {
      await runAutomations(ctx.company.id, "inventory.low", movementCtx);
    }
    await audit(ctx, "inventory.movement", "product", id, { type, quantity, newStock });
    return json({ ok: true, stock: newStock });
  }

  const body = await parseBody(req);
  const parsed = ProductSchema.safeParse(body);
  if (!parsed.success) return err(`Datos inválidos: ${parsed.error.issues[0]?.message}`, 422);

  const limits = await getPlanLimits(ctx.company.id);
  const count = await db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.companyId, ctx.company.id));
  if (Number(count[0]?.n ?? 0) >= (limits.maxProducts ?? 50)) {
    return err("Tu plan alcanzó el límite de productos. Amplía tu plan para agregar más.", 402);
  }

  const [row] = await db
    .insert(products)
    .values({ companyId: ctx.company.id, ...parsed.data })
    .returning();
  if (parsed.data.stock > 0) {
    await db.insert(inventoryMovements).values({
      companyId: ctx.company.id,
      productId: row.id,
      type: "in",
      quantity: parsed.data.stock,
      reason: "Stock inicial",
      createdBy: ctx.user.id,
    });
  }
  await audit(ctx, "product.created", "product", row.id, { name: row.name });
  return json({ row }, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  if (!can(ctx.role, "products", "write")) return err("Sin permiso", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return err("Falta id", 422);
  const body = await parseBody(req);
  const parsed = ProductSchema.partial().safeParse(body);
  if (!parsed.success) return err("Datos inválidos", 422);

  const existing = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.companyId, ctx.company.id)))
    .limit(1);
  if (!existing[0]) return err("Producto no encontrado", 404);

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  // Si el stock se edita directamente, se registra como movimiento de ajuste.
  if (typeof parsed.data.stock === "number" && parsed.data.stock !== existing[0].stock) {
    await db.insert(inventoryMovements).values({
      companyId: ctx.company.id,
      productId: id,
      type: "adjust",
      quantity: parsed.data.stock,
      reason: "Ajuste manual de inventario",
      createdBy: ctx.user.id,
    });
  }
  await db.update(products).set(updates).where(eq(products.id, id));

  const newStock = typeof parsed.data.stock === "number" ? parsed.data.stock : existing[0].stock;
  const movementCtx = { entityType: "product", entityId: id, ...existing[0], ...parsed.data, stock: newStock };
  await runAutomations(ctx.company.id, "inventory.changed", movementCtx);
  if (newStock <= (parsed.data.lowStockThreshold ?? existing[0].lowStockThreshold)) {
    await runAutomations(ctx.company.id, "inventory.low", movementCtx);
  }
  await audit(ctx, "product.updated", "product", id, { changes: parsed.data });
  return json({ ok: true, stock: newStock });
}

export async function DELETE(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  if (!can(ctx.role, "products", "delete")) return err("Sin permiso para eliminar productos", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return err("Falta id", 422);
  const existing = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.companyId, ctx.company.id)))
    .limit(1);
  if (!existing[0]) return err("Producto no encontrado", 404);
  await db.delete(products).where(eq(products.id, id));
  await audit(ctx, "product.deleted", "product", id, { name: existing[0].name });
  return json({ ok: true });
}
