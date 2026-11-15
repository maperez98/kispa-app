// CRUD genérico multi-tenant para los módulos configurables
// (clients, orders, expenses, receivables, employees).
// ?module=<key>  ·  GET lista  ·  POST crea  ·  PATCH?id= actualiza  ·  DELETE?id= elimina
// Todas las operaciones verifican membresía, rol y aislación por companyId.
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  companyUsers,
  expenses,
  orders,
  plans,
  receivablePayments,
  receivables,
  subscriptions,
  users,
} from "@/db/schema";
import { audit, err, getContext, json, parseBody } from "@/lib/http";
import { can } from "@/lib/permissions";
import { MODULES, MODULE_SCHEMAS } from "@/lib/modules";
import { runAutomations } from "@/lib/automations/engine";
import { hashPassword } from "@/lib/http";

const TABLES: Record<string, any> = { clients, orders, expenses, receivables };

async function getPlanLimits(companyId: string) {
  const sub = await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1);
  const planId = sub[0]?.planId ?? "free";
  const plan = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  return (plan[0]?.limits ?? {}) as Record<string, number>;
}

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const url = new URL(req.url);
  const module = url.searchParams.get("module") ?? "";
  if (!MODULES[module]) return err("Módulo desconocido", 404);
  if (!can(ctx.role, module, "read")) return err("Sin permiso de lectura en este módulo", 403);

  const search = url.searchParams.get("search")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

  if (module === "employees") {
    const rows = await db
      .select({
        id: companyUsers.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: companyUsers.role,
        createdAt: companyUsers.createdAt,
      })
      .from(companyUsers)
      .innerJoin(users, eq(companyUsers.userId, users.id))
      .where(eq(companyUsers.companyId, ctx.company.id))
      .orderBy(desc(companyUsers.createdAt))
      .limit(limit);
    return json({ rows });
  }

  const table = TABLES[module];
  let rows = await db
    .select()
    .from(table)
    .where(eq(table.companyId, ctx.company.id))
    .orderBy(desc(table.createdAt))
    .limit(limit);

  if (module === "receivables") {
    const withClient = await Promise.all(
      rows.map(async (r: any) => {
        let clientName = null;
        if (r.clientId) {
          const c = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, r.clientId)).limit(1);
          clientName = c[0]?.name ?? null;
        }
        return { ...r, clientName };
      }),
    );
    rows = withClient;
  }
  if (module === "orders" || module === "expenses") {
    rows = await Promise.all(
      rows.map(async (r: any) => {
        let clientName = null;
        let categoryName = null;
        if (r.clientId) {
          const c = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, r.clientId)).limit(1);
          clientName = c[0]?.name ?? null;
        }
        if (r.categoryId) {
          const { expenseCategories } = await import("@/db/schema");
          const c = await db
            .select({ name: expenseCategories.name })
            .from(expenseCategories)
            .where(eq(expenseCategories.id, r.categoryId))
            .limit(1);
          categoryName = c[0]?.name ?? null;
        }
        return { ...r, clientName, categoryName };
      }),
    );
  }

  if (search) {
    rows = rows.filter((r: any) =>
      [r.name, r.title, r.description, r.phone, r.email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(search.toLowerCase())),
    );
  }
  return json({ rows, module });
}

export async function POST(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const url = new URL(req.url);
  const module = url.searchParams.get("module") ?? "";
  if (!MODULES[module]) return err("Módulo desconocido", 404);
  if (!can(ctx.role, module, "write")) return err("Sin permiso de escritura en este módulo", 403);

  // Abono a una cuenta por cobrar: POST /api/resource?module=receivables&id=<id>&pay=1
  if (module === "receivables" && url.searchParams.get("pay") === "1") {
    const id = url.searchParams.get("id");
    if (!id) return err("Falta id", 422);
    const body = await parseBody(req);
    const amountCents = Number(body?.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) return err("Monto inválido", 422);
    const rec = await db
      .select()
      .from(receivables)
      .where(and(eq(receivables.id, id), eq(receivables.companyId, ctx.company.id)))
      .limit(1);
    if (!rec[0]) return err("Cuenta no encontrada", 404);
    await db.insert(receivablePayments).values({
      receivableId: id,
      amountCents,
      method: String(body?.method ?? "cash"),
      note: body?.note ? String(body.note) : null,
      createdBy: ctx.user.id,
    });
    const newPaid = rec[0].paidCents + amountCents;
    const status = newPaid >= rec[0].amountCents ? "paid" : "partial";
    await db
      .update(receivables)
      .set({ paidCents: newPaid, status, updatedAt: new Date() })
      .where(eq(receivables.id, id));
    await runAutomations(ctx.company.id, "payment.registered", {
      entityType: "receivable",
      entityId: id,
      amountCents,
      paidCents: newPaid,
      status,
    });
    await audit(ctx, "receivable.payment", "receivable", id, { amountCents });
    return json({ ok: true, paidCents: newPaid, status });
  }

  const body = await parseBody(req);
  const schema = MODULE_SCHEMAS[module];
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err(`Datos inválidos: ${parsed.error.issues[0]?.message}`, 422);
  const data = parsed.data as Record<string, unknown>;

  if (module === "employees") {
    const limits = await getPlanLimits(ctx.company.id);
    const count = await db
      .select({ n: sql<number>`count(*)` })
      .from(companyUsers)
      .where(eq(companyUsers.companyId, ctx.company.id));
    if (Number(count[0]?.n ?? 0) >= (limits.maxUsers ?? 2)) {
      return err("Tu plan alcanzó el límite de usuarios. Amplía tu plan para invitar más personas.", 402);
    }
    const email = String(data.email).toLowerCase();
    if (!data.password) return err("La contraseña inicial es obligatoria", 422);
    let u = (
      await db.select().from(users).where(eq(users.email, email)).limit(1)
    )[0];
    if (!u) {
      const [created] = await db
        .insert(users)
        .values({ name: String(data.name), email, passwordHash: hashPassword(String(data.password)) })
        .returning();
      u = created;
    }
    const existing = await db
      .select({ id: companyUsers.id })
      .from(companyUsers)
      .where(and(eq(companyUsers.companyId, ctx.company.id), eq(companyUsers.userId, u.id)))
      .limit(1);
    if (existing[0]) return err("Esa persona ya pertenece a la empresa", 409);
    const [m] = await db
      .insert(companyUsers)
      .values({ companyId: ctx.company.id, userId: u.id, role: String(data.role ?? "operator") })
      .returning();
    await audit(ctx, "employee.invited", "company_user", m.id, { email, role: m.role });
    return json({ row: { id: m.id, userId: u.id, name: u.name, email: u.email, role: m.role } }, { status: 201 });
  }

  const table = TABLES[module];
  const values: Record<string, unknown> = { companyId: ctx.company.id, createdBy: ctx.user.id };
  for (const k of Object.keys(data)) {
    if (k === "tags") continue;
    let v = data[k];
    if (v === "" ) v = null;
    if (k === "dueDate" || k === "date") v = v ? new Date(String(v)) : null;
    values[k] = v;
  }
  const inserted = (await db.insert(table).values(values).returning()) as any[];
  const row = inserted[0];
  if (module === "orders") {
    await runAutomations(ctx.company.id, "order.created", { entityType: "order", entityId: row.id, ...row });
  }
  if (module === "expenses") {
    await runAutomations(ctx.company.id, "expense.created", { entityType: "expense", entityId: row.id, ...row });
  }
  await audit(ctx, `${module}.created`, module, row.id, { snapshot: data });
  return json({ row }, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const url = new URL(req.url);
  const module = url.searchParams.get("module") ?? "";
  const id = url.searchParams.get("id");
  if (!MODULES[module]) return err("Módulo desconocido", 404);
  if (!id) return err("Falta id", 422);
  if (!can(ctx.role, module, "write")) return err("Sin permiso de escritura en este módulo", 403);

  if (module === "employees") {
    const body = await parseBody(req);
    const role = body?.role;
    if (role && !["admin", "operator", "viewer"].includes(String(role))) return err("Rol inválido", 422);
    const target = await db
      .select()
      .from(companyUsers)
      .where(and(eq(companyUsers.id, id), eq(companyUsers.companyId, ctx.company.id)))
      .limit(1);
    if (!target[0]) return err("Miembro no encontrado", 404);
    if (target[0].role === "owner") return err("No se puede modificar al propietario", 403);
    await db.update(companyUsers).set({ role: String(role) }).where(eq(companyUsers.id, id));
    await audit(ctx, "employee.updated", "company_user", id, { role });
    return json({ ok: true });
  }

  const table = TABLES[module];
  const schema = MODULE_SCHEMAS[module];
  const body = await parseBody(req);
  const parsed = (schema as any).partial().safeParse(body);
  if (!parsed.success) return err("Datos inválidos", 422);
  const existing = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.companyId, ctx.company.id)))
    .limit(1);
  if (!existing[0]) return err("Registro no encontrado", 404);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === "tags") continue;
    let val: unknown = v;
    if (val === "") val = null;
    if (k === "dueDate" || k === "date") val = val ? new Date(String(val)) : null;
    updates[k] = val;
  }
  await db.update(table).set(updates).where(eq(table.id, id));
  if (module === "orders" && parsed.data.status && parsed.data.status !== existing[0].status) {
    await runAutomations(ctx.company.id, "order.status_changed", {
      entityType: "order",
      entityId: id,
      ...existing[0],
      status: parsed.data.status,
    });
  }
  await audit(ctx, `${module}.updated`, module, id, { changes: parsed.data });
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const url = new URL(req.url);
  const module = url.searchParams.get("module") ?? "";
  const id = url.searchParams.get("id");
  if (!MODULES[module]) return err("Módulo desconocido", 404);
  if (!id) return err("Falta id", 422);
  if (!can(ctx.role, module, "delete")) return err("Sin permiso para eliminar en este módulo", 403);

  if (module === "employees") {
    const target = await db
      .select()
      .from(companyUsers)
      .where(and(eq(companyUsers.id, id), eq(companyUsers.companyId, ctx.company.id)))
      .limit(1);
    if (!target[0]) return err("Miembro no encontrado", 404);
    if (target[0].role === "owner" || target[0].userId === ctx.user.id)
      return err("No puedes eliminar al propietario ni tu propia cuenta", 403);
    await db.delete(companyUsers).where(eq(companyUsers.id, id));
    await audit(ctx, "employee.removed", "company_user", id, {});
    return json({ ok: true });
  }

  const table = TABLES[module];
  const existing = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.companyId, ctx.company.id)))
    .limit(1);
  if (!existing[0]) return err("Registro no encontrado", 404);
  await db.delete(table).where(eq(table.id, id));
  await audit(ctx, `${module}.deleted`, module, id, {});
  return json({ ok: true });
}
