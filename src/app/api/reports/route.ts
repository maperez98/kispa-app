// Reportes con rango de fechas: ingresos, gastos, ganancia, top productos,
// gastos por categoría, ventas por día y por método de pago. Datos reales.
import { err, getContext, json } from "@/lib/http";
import { getReport } from "@/lib/reports";

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const url = new URL(req.url);
  const now = new Date();
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toParam ? new Date(toParam) : now;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return err("Fechas inválidas", 422);
  const report = await getReport(ctx.company.id, from, new Date(to.getTime() + 24 * 3600 * 1000 - 1));
  return json(report);
}
