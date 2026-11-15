"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge, Card, Empty, Spinner, cls } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useApp } from "@/components/app-shell";
import { formatCOP, formatDate, formatDateTime } from "@/lib/brand";
import { ORDER_STATUS_LABELS, PAYMENT_LABELS, SALE_STATUS_LABELS } from "@/lib/modules";

interface Widget {
  type: string;
  metric: string;
  title?: string;
  size?: string;
  data: any;
}

export default function DashboardPage() {
  const { config } = useApp();
  const [widgets, setWidgets] = useState<Widget[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ widgets: Widget[] }>("/api/dashboard")
      .then((d) => setWidgets(d.widgets))
      .catch((e) => setError(e.message))
  }, []);

  if (error) return <Empty title="No se pudo cargar el panel" description={error} />;
  if (!widgets) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <Spinner /> Cargando tu panel…
      </div>
    );
  }

  const profile = config.config.businessProfile as { businessType?: string; sector?: string };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Hola, {config.company.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {profile.businessType ? `Vista configurada para tu negocio: ${profile.businessType}.` : "Tu panel se adapta a lo que conversamos."}{" "}
          ¿Quieres cambiar algo?{" "}
          <Link href="/app/assistant" className="font-medium text-ember-soft hover:text-ember">
            Pídele un cambio al asistente
          </Link>
        </p>
      </div>
      {widgets.length === 0 && (
        <Empty
          icon="dashboard"
          title="Tu panel aún no está configurado"
          description="Conversa con el asistente para construir tu panel personalizado."
          action={<Link href="/app/assistant"><button className="mt-2 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-[#1a0b04]">Abrir el asistente</button></Link>}
        />
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {widgets.map((w, i) => (
          <WidgetCard key={i} w={w} />
        ))}
      </div>
    </div>
  );
}

function StatValue({ metric, data }: { metric: string; data: any }) {
  const moneyMetrics = ["revenue_today", "revenue_month", "expenses_month", "profit_month", "receivables"];
  if (moneyMetrics.includes(metric)) return <span>{formatCOP(Number(data?.value ?? 0))}</span>;
  return <span>{Number(data?.value ?? 0)}</span>;
}

function Bars({ items, value }: { items: Array<{ label: string; value: number }>; value: (n: number) => string }) {
  const max = Math.max(...items.map((x) => x.value), 1);
  return (
    <div className="space-y-2">
      {items.map((x, i) => (
        <div key={i}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="truncate text-muted">{x.label}</span>
            <span className="font-medium">{value(x.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-ember/80" style={{ width: `${(x.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function WidgetCard({ w }: { w: Widget }) {
  const title = w.title ?? w.metric;
  const full = w.size === "full";
  return (
    <Card className={cls("p-5", full && "md:col-span-2")}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted">{title}</h3>
        <Icon name={w.type === "alerts" ? "bell" : w.type === "table" ? "inbox" : "chart"} className="h-4 w-4 text-faint" />
      </div>
      {w.type === "stat" && (
        <p className="font-display text-3xl font-semibold tracking-tight">
          <StatValue metric={w.metric} data={w.data} />
        </p>
      )}
      {w.type === "chart" && w.metric === "sales_by_day" && (
        <div className="flex h-32 items-end gap-1.5">
          {(w.data?.days ?? []).map((d: any) => {
            const max = Math.max(...(w.data.days as any[]).map((x: any) => x.totalCents), 1);
            return (
              <div key={d.day} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-ember/70 transition-colors hover:bg-ember"
                  style={{ height: `${Math.max((d.totalCents / max) * 100, d.totalCents > 0 ? 4 : 1)}%` }}
                  title={`${d.day}: ${formatCOP(d.totalCents)}`}
                />
              </div>
            );
          })}
        </div>
      )}
      {w.type === "chart" && w.metric === "top_products" && (
        <Bars
          items={(w.data?.items ?? []).map((x: any) => ({ label: x.name, value: x.revenue }))}
          value={(n) => formatCOP(n)}
        />
      )}
      {w.type === "chart" && w.metric === "expenses_by_category" && (
        <Bars
          items={(w.data?.items ?? []).map((x: any) => ({ label: x.name, value: x.amountCents }))}
          value={(n) => formatCOP(n)}
        />
      )}
      {w.type === "table" && w.metric === "recent_sales" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-faint">
                <th className="pb-2 pr-3 font-medium">Venta</th>
                <th className="pb-2 pr-3 font-medium">Cliente</th>
                <th className="pb-2 pr-3 font-medium">Pago</th>
                <th className="pb-2 pr-3 font-medium">Estado</th>
                <th className="pb-2 pr-3 text-right font-medium">Total</th>
                <th className="pb-2 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {(w.data?.rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-line/60">
                  <td className="py-2.5 pr-3 font-medium">#{r.number}</td>
                  <td className="py-2.5 pr-3 text-muted">{r.clientName ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-muted">{PAYMENT_LABELS[r.paymentMethod] ?? r.paymentMethod}</td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={r.status === "completed" ? "good" : r.status === "cancelled" ? "bad" : "warn"}>
                      {SALE_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-medium">{formatCOP(r.totalCents)}</td>
                  <td className="py-2.5 text-xs text-muted">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
              {(w.data?.rows ?? []).length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-sm text-muted">Aún no hay ventas registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {w.type === "table" && w.metric === "low_stock_products" && (
        <div className="space-y-2">
          {(w.data?.rows ?? []).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-sm">
              <span className="font-medium">{r.name}</span>
              <span className="text-warn">Quedan {r.stock} {r.unit}</span>
            </div>
          ))}
          {(w.data?.rows ?? []).length === 0 && <p className="py-4 text-center text-sm text-muted">Todo el inventario está en buen nivel.</p>}
        </div>
      )}
      {w.type === "alerts" && (
        <div className="space-y-2">
          {(w.data?.rows ?? []).map((a: any) => (
            <div key={a.id} className={cls("rounded-lg border px-3 py-2 text-sm", a.severity === "warning" ? "border-warn/25 bg-warn/5" : "border-line bg-white/5")}>
              <p className="font-medium">{a.title}</p>
              <p className="text-xs text-muted">{a.message}</p>
            </div>
          ))}
          {(w.data?.rows ?? []).length === 0 && <p className="py-4 text-center text-sm text-muted">Sin alertas pendientes.</p>}
        </div>
      )}
    </Card>
  );
}
