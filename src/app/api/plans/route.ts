import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";
import { getContext, json } from "@/lib/http";

// Planes comerciales (COP/mes). Sin proveedor de pagos configurado no se
// realiza ningún cobro real: PAYMENTS_PROVIDER vacío = modo catálogo.
export async function GET(req: Request) {
  const all = await db.select().from(plans).where(eq(plans.active, true));
  const ctx = await getContext(req);
  let subscription = null;
  if (ctx) {
    const sub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, ctx.company.id))
      .limit(1);
    subscription = sub[0] ?? null;
  }
  return json({
    plans: all,
    subscription,
    paymentsEnabled: Boolean(process.env.PAYMENTS_PROVIDER),
    paymentsProvider: process.env.PAYMENTS_PROVIDER || null,
  });
}
