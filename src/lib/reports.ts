// Consultas de datos reales del negocio (snapshot para el asistente, widgets
// del dashboard y reportes). Todas las consultas están aisladas por companyId.
import { and, count, desc, eq, gte, inArray, lte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  clients,
  expenseCategories,
  expenses,
  products,
  receivables,
  saleItems,
  sales,
} from "@/db/schema";

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const num = (v: unknown) => Number(v ?? 0);

export async function getBusinessSnapshot(companyId: string) {
  const now = new Date();
  const today = startOfDay(now);
  const month = startOfMonth(now);

  const [revToday] = await db
    .select({ v: sum(sales.totalCents) })
    .from(sales)
    .where(and(eq(sales.companyId, companyId), eq(sales.status, "completed"), gte(sales.createdAt, today)));
  const [revMonth] = await db
    .select({ v: sum(sales.totalCents) })
    .from(sales)
    .where(and(eq(sales.companyId, companyId), eq(sales.status, "completed"), gte(sales.createdAt, month)));
  const [expMonth] = await db
    .select({ v: sum(expenses.amountCents) })
    .from(expenses)
    .where(and(eq(expenses.companyId, companyId), gte(expenses.date, month)));
  const [salesCount] = await db
    .select({ c: count() })
    .from(sales)
    .where(and(eq(sales.companyId, companyId), eq(sales.status, "completed"), gte(sales.createdAt, month)));
  const [clientsCount] = await db
    .select({ c: count() })
    .from(clients)
    .where(eq(clients.companyId, companyId));
  const [recv] = await db
    .select({ v: sql<number>`coalesce(sum(${receivables.amountCents} - ${receivables.paidCents}), 0)` })
    .from(receivables)
    .where(
      and(
        eq(receivables.companyId, companyId),
        inArray(receivables.status, ["pending", "partial", "overdue"]),
      ),
    );

  const allProducts = await db
    .select({
      id: products.id,
      name: products.name,
      stock: products.stock,
      lowStockThreshold: products.lowStockThreshold,
    })
    .from(products)
    .where(eq(products.companyId, companyId));
  const lowStock = allProducts.filter((p) => p.stock <= p.lowStockThreshold);

  const topProducts = await db
    .select({
      name: saleItems.name,
      qty: sum(saleItems.quantity),
      revenue: sum(saleItems.totalCents),
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(and(eq(sales.companyId, companyId), eq(sales.status, "completed"), gte(sales.createdAt, month)))
    .groupBy(saleItems.name)
    .orderBy(desc(sum(saleItems.totalCents)))
    .limit(5);

  return {
    revenueTodayCents: num(revToday.v),
    revenueMonthCents: num(revMonth.v),
    expensesMonthCents: num(expMonth.v),
    profitMonthCents: num(revMonth.v) - num(expMonth.v),
    salesCountMonth: Number(salesCount.c),
    clientsCount: Number(clientsCount.c),
    receivablesCents: num(recv.v),
    lowStockCount: lowStock.length,
    lowStock: lowStock.map((p) => ({ name: p.name, stock: p.stock })),
    topProducts: topProducts.map((p) => ({ name: p.name, qty: num(p.qty), revenue: num(p.revenue) })),
  };
}

export async function getReport(companyId: string, from: Date, to: Date) {
  const [rev] = await db
    .select({ v: sum(sales.totalCents), c: count() })
    .from(sales)
    .where(
      and(
        eq(sales.companyId, companyId),
        eq(sales.status, "completed"),
        gte(sales.createdAt, from),
        lte(sales.createdAt, to),
      ),
    );
  const [exp] = await db
    .select({ v: sum(expenses.amountCents) })
    .from(expenses)
    .where(and(eq(expenses.companyId, companyId), gte(expenses.date, from), lte(expenses.date, to)));

  const topProducts = await db
    .select({ name: saleItems.name, qty: sum(saleItems.quantity), revenue: sum(saleItems.totalCents) })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(
      and(eq(sales.companyId, companyId), eq(sales.status, "completed"), gte(sales.createdAt, from), lte(sales.createdAt, to)),
    )
    .groupBy(saleItems.name)
    .orderBy(desc(sum(saleItems.totalCents)))
    .limit(10);

  const expensesByCategory = await db
    .select({
      name: sql<string>`coalesce(${expenseCategories.name}, 'Sin categoría')`,
      amount: sum(expenses.amountCents),
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(and(eq(expenses.companyId, companyId), gte(expenses.date, from), lte(expenses.date, to)))
    .groupBy(expenseCategories.name)
    .orderBy(desc(sum(expenses.amountCents)));

  const salesByDay = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${sales.createdAt}), 'YYYY-MM-DD')`,
      total: sum(sales.totalCents),
      n: count(),
    })
    .from(sales)
    .where(
      and(eq(sales.companyId, companyId), eq(sales.status, "completed"), gte(sales.createdAt, from), lte(sales.createdAt, to)),
    )
    .groupBy(sql`date_trunc('day', ${sales.createdAt})`)
    .orderBy(sql`date_trunc('day', ${sales.createdAt})`);

  const salesByMethod = await db
    .select({ method: sales.paymentMethod, total: sum(sales.totalCents), n: count() })
    .from(sales)
    .where(
      and(eq(sales.companyId, companyId), eq(sales.status, "completed"), gte(sales.createdAt, from), lte(sales.createdAt, to)),
    )
    .groupBy(sales.paymentMethod);

  const revenue = num(rev.v);
  const salesN = Number(rev.c);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    revenueCents: revenue,
    expensesCents: num(exp.v),
    profitCents: revenue - num(exp.v),
    salesCount: salesN,
    avgTicketCents: salesN > 0 ? Math.round(revenue / salesN) : 0,
    topProducts: topProducts.map((p) => ({ name: p.name, qty: num(p.qty), revenueCents: num(p.revenue) })),
    expensesByCategory: expensesByCategory.map((e) => ({ name: e.name, amountCents: num(e.amount) })),
    salesByDay: salesByDay.map((d) => ({ day: d.day, totalCents: num(d.total), count: Number(d.n) })),
    salesByMethod: salesByMethod.map((m) => ({ method: m.method, totalCents: num(m.total), count: Number(m.n) })),
  };
}

// Datos por widget del dashboard dinámico.
export async function computeWidgetData(metric: string, companyId: string) {
  const now = new Date();
  const month = startOfMonth(now);
  const today = startOfDay(now);
  const days14 = new Date(now.getTime() - 13 * 24 * 3600 * 1000);

  switch (metric) {
    case "revenue_today": {
      const [r] = await db
        .select({ v: sum(sales.totalCents) })
        .from(sales)
        .where(and(eq(sales.companyId, companyId), eq(sales.status, "completed"), gte(sales.createdAt, today)));
      return { value: num(r.v) };
    }
    case "revenue_month": {
      const [r] = await db
        .select({ v: sum(sales.totalCents) })
        .from(sales)
        .where(and(eq(sales.companyId, companyId), eq(sales.status, "completed"), gte(sales.createdAt, month)));
      return { value: num(r.v) };
    }
    case "expenses_month": {
      const [r] = await db
        .select({ v: sum(expenses.amountCents) })
        .from(expenses)
        .where(and(eq(expenses.companyId, companyId), gte(expenses.date, month)));
      return { value: num(r.v) };
    }
    case "profit_month": {
      const snap = await getBusinessSnapshot(companyId);
      return { value: snap.profitMonthCents };
    }
    case "low_stock": {
      const snap = await getBusinessSnapshot(companyId);
      return { value: snap.lowStockCount };
    }
    case "receivables": {
      const snap = await getBusinessSnapshot(companyId);
      return { value: snap.receivablesCents };
    }
    case "clients_count": {
      const [r] = await db.select({ c: count() }).from(clients).where(eq(clients.companyId, companyId));
      return { value: Number(r.c) };
    }
    case "sales_count": {
      const snap = await getBusinessSnapshot(companyId);
      return { value: snap.salesCountMonth };
    }
    case "sales_by_day": {
      const rows = await db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${sales.createdAt}), 'YYYY-MM-DD')`,
          total: sum(sales.totalCents),
        })
        .from(sales)
        .where(
          and(
            eq(sales.companyId, companyId),
            eq(sales.status, "completed"),
            gte(sales.createdAt, startOfDay(days14)),
          ),
        )
        .groupBy(sql`date_trunc('day', ${sales.createdAt})`)
        .orderBy(sql`date_trunc('day', ${sales.createdAt})`);
      const map = new Map(rows.map((r) => [r.day, num(r.total)]));
      const days: Array<{ day: string; totalCents: number }> = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
        const key = d.toISOString().slice(0, 10);
        days.push({ day: key, totalCents: map.get(key) ?? 0 });
      }
      return { days };
    }
    case "top_products": {
      const snap = await getBusinessSnapshot(companyId);
      return { items: snap.topProducts };
    }
    case "expenses_by_category": {
      const rows = await db
        .select({
          name: sql<string>`coalesce(${expenseCategories.name}, 'Sin categoría')`,
          amount: sum(expenses.amountCents),
        })
        .from(expenses)
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(and(eq(expenses.companyId, companyId), gte(expenses.date, month)))
        .groupBy(expenseCategories.name)
        .orderBy(desc(sum(expenses.amountCents)))
        .limit(8);
      return { items: rows.map((r) => ({ name: r.name, amountCents: num(r.amount) })) };
    }
    case "recent_sales": {
      const rows = await db
        .select({
          id: sales.id,
          number: sales.number,
          totalCents: sales.totalCents,
          paymentMethod: sales.paymentMethod,
          status: sales.status,
          createdAt: sales.createdAt,
          clientName: clients.name,
        })
        .from(sales)
        .leftJoin(clients, eq(sales.clientId, clients.id))
        .where(eq(sales.companyId, companyId))
        .orderBy(desc(sales.createdAt))
        .limit(10);
      return { rows };
    }
    case "low_stock_products": {
      const rows = await db
        .select({ id: products.id, name: products.name, stock: products.stock, lowStockThreshold: products.lowStockThreshold, unit: products.unit })
        .from(products)
        .where(eq(products.companyId, companyId))
        .orderBy(products.stock)
        .limit(10);
      return { rows: rows.filter((r) => r.stock <= r.lowStockThreshold) };
    }
    case "alerts": {
      const rows = await db
        .select()
        .from(alerts)
        .where(eq(alerts.companyId, companyId))
        .orderBy(desc(alerts.createdAt))
        .limit(8);
      return { rows };
    }
    default:
      return {};
  }
}
