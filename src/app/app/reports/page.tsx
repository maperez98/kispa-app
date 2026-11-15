"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { formatCOP, formatDate } from "@/lib/brand";
import { PAYMENT_LABELS } from "@/lib/modules";

const toInput = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsPage() {
  const now = new Date();
  const [from, setFrom] = useState(toInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toInput(now));
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api<any>(`/api/reports?from=${from}&to=${to}`);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el reporte");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxDay = data ? Math.max(...data.salesByDay.map((d: any) => d.totalCents), 1) : 1;
  const maxCat = data ? Math.max(...data.expensesByCategory.map((d: any) => d.amountCents), 1) : 1;

  return (
    <div>
      <PageHeader
        title="Reportes"
        description="Datos reales de tus operaciones en el rango seleccionado."
        actions={
          <div className="flex items-end gap-2">
            <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        }
      />
      {error && <p className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {loading || !data ? (
        <div className="flex justify-center p-10"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Ingresos</p>
              <p className="mt-1 font-display text-2xl font-semibold text-good">{formatCOP(data.revenueCents)}</p>
              <p className="mt-1 text-xs text-faint">{data.salesCount} ventas</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Gastos</p>
              <p className="mt-1 font-display text-2xl font-semibold text-bad">{formatCOP(data.expensesCents)}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Ganancia</p>
              <p className={`mt-1 font-display text-2xl font-semibold ${data.profitCents >= 0 ? "text-ink" : "text-bad"}`}>{formatCOP(data.profitCents)}</p>
              <p className="mt-1 text-xs text-faint">Ticket promedio {formatCOP(data.avgTicketCents)}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Periodo</p>
              <p className="mt-1 text-sm font-medium">{formatDate(data.from)} — {formatDate(data.to)}</p>
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-muted">Ventas por día</h3>
            {data.salesByDay.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Sin ventas en este periodo.</p>
            ) : (
              <div className="flex h-40 items-end gap-1">
                {data.salesByDay.map((d: any) => (
                  <div key={d.day} className="flex-1" title={`${d.day}: ${formatCOP(d.totalCents)} (${d.count} ventas)`}>
                    <div className="w-full rounded-t bg-ember/70 hover:bg-ember" style={{ height: `${Math.max((d.totalCents / maxDay) * 100, d.totalCents > 0 ? 3 : 1)}%` }} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-muted">Productos más vendidos</h3>
              {data.topProducts.length === 0 ? <p className="text-sm text-muted">Sin datos.</p> : (
                <div className="space-y-2.5">
                  {data.topProducts.map((p: any, i: number) => (
                    <div key={i}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted">{p.name} · {p.qty} und.</span>
                        <span className="font-medium">{formatCOP(p.revenueCents)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-ember/80" style={{ width: `${(p.revenueCents / (data.topProducts[0]?.revenueCents || 1)) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-muted">Gastos por categoría</h3>
              {data.expensesByCategory.length === 0 ? <p className="text-sm text-muted">Sin gastos en este periodo.</p> : (
                <div className="space-y-2.5">
                  {data.expensesByCategory.map((c: any, i: number) => (
                    <div key={i}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted">{c.name}</span>
                        <span className="font-medium">{formatCOP(c.amountCents)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-ember-soft/70" style={{ width: `${(c.amountCents / maxCat) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-muted">Ventas por método de pago</h3>
            <div className="flex flex-wrap gap-2">
              {data.salesByMethod.map((m: any) => (
                <span key={m.method} className="rounded-xl border border-line bg-white/5 px-4 py-2.5 text-sm">
                  <Icon name="card" className="mr-1.5 inline h-3.5 w-3.5 text-muted" />
                  {PAYMENT_LABELS[m.method] ?? m.method}: <strong>{formatCOP(m.totalCents)}</strong>{" "}
                  <span className="text-xs text-muted">({m.count})</span>
                </span>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
