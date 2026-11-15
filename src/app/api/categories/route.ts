// Categorías de productos y de gastos (por empresa).
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { expenseCategories, productCategories } from "@/db/schema";
import { audit, err, getContext, json, parseBody } from "@/lib/http";

const Schema = z.object({ name: z.string().min(1).max(80) });

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "products";
  if (type === "expenses") {
    const rows = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.companyId, ctx.company.id))
      .orderBy(expenseCategories.name);
    return json({ rows });
  }
  const rows = await db
    .select()
    .from(productCategories)
    .where(eq(productCategories.companyId, ctx.company.id))
    .orderBy(productCategories.name);
  return json({ rows });
}

export async function POST(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "products";
  const body = await parseBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err("Nombre inválido", 422);
  if (type === "expenses") {
    const [row] = await db
      .insert(expenseCategories)
      .values({ companyId: ctx.company.id, name: parsed.data.name })
      .onConflictDoNothing()
      .returning();
    await audit(ctx, "expense_category.created", "expense_category", row?.id ?? null, { name: parsed.data.name });
    return json({ row: row ?? null }, { status: 201 });
  }
  const [row] = await db
    .insert(productCategories)
    .values({ companyId: ctx.company.id, name: parsed.data.name })
    .onConflictDoNothing()
    .returning();
  await audit(ctx, "product_category.created", "product_category", row?.id ?? null, { name: parsed.data.name });
  return json({ row: row ?? null }, { status: 201 });
}
