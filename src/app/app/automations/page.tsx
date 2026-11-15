"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, Empty, PageHeader, Spinner, cls } from "@/components/ui";
import { ApiError, api } from "@/lib/client/api";
import { useApp } from "@/components/app-shell";
import { formatDateTime } from "@/lib/brand";
import { can } from "@/lib/permissions";

const TRIGGER_LABELS: Record<string, string> = {
  "sale.created": "Venta registrada",
  "inventory.changed": "Inventario cambiado",
  "inventory.low": "Stock bajo (escaneo)",
  "expense.created": "Gasto registrado",
  "order.created": "Pedido creado",
  "order.status_changed": "Estado de pedido cambiado",
  "receivable.overdue": "Cuenta por cobrar vencida",
  "payment.registered": "Abono registrado",
  "schedule.daily": "Escaneo programado",
};

export default function AutomationsPage() {
  const { config } = useApp();
  const role = config.role;
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runsFor, setRunsFor] = useState<string | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ rules: any[] }>("/api/automations");
      setRules(d.rules);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canWrite = can(role, "automations", "write");

  async function toggle(rule: any) {
    try {
      await api(`/api/automations?id=${rule.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }) });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar");
    }
  }

  async function remove(rule: any) {
    if (!confirm(`¿Eliminar la automatización «${rule.name}»?`)) return;
    try {
      await api(`/api/automations?id=${rule.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  async function runScan() {
    setRunning(true);
    setToast(null);
    try {
      const d = await api<{ ok: boolean; lowStockScanned?: number; overdueScanned?: number }>("/api/automations?run=1", {
        method: "POST",
        body: JSON.stringify({ trigger: "schedule.daily" }),
      });
      setToast(`Escaneo ejecutado: ${d.lowStockScanned ?? 0} productos con stock bajo revisados, ${d.overdueScanned ?? 0} cuentas vencidas revisadas.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo ejecutar el escaneo");
    } finally {
      setRunning(false);
    }
  }

  async function showRuns(rule: any) {
    if (runsFor === rule.id) {
      setRunsFor(null);
      return;
    }
    const d = await api<{ runs: any[] }>(`/api/automations?id=${rule.id}&runs=1`);
    setRuns(d.runs);
    setRunsFor(rule.id);
  }

  return (
    <div>
      <PageHeader
        title="Automatizaciones"
        description="Reglas que se ejecutan solas ante eventos de tu negocio. Puedes crearlas conversando con el asistente."
        actions={
          canWrite ? (
            <Button variant="ghost" onClick={() => void runScan()} disabled={running}>
              {running ? <Spinner /> : <Icon name="refresh" className="h-4 w-4" />} Ejecutar escaneo ahora
            </Button>
          ) : undefined
        }
      />
      {toast && <p className="mb-4 rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-sm text-good">{toast}</p>}
      {error && <p className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {loading ? (
        <div className="flex justify-center p-10"><Spinner /></div>
      ) : rules.length === 0 ? (
        <Empty
          icon="zap"
          title="Aún no hay automatizaciones"
          description="Pídele al asistente: «quiero que me avises cuando un producto tenga menos de cinco unidades»."
        />
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon name="zap" className={cls("h-4 w-4", r.enabled ? "text-ember" : "text-faint")} />
                    <span className="font-medium">{r.name}</span>
                    <Badge tone={r.enabled ? "good" : "neutral"}>{r.enabled ? "Activa" : "Pausada"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Disparador: {TRIGGER_LABELS[r.trigger] ?? r.trigger} · {r.conditions.length} condición(es) · {r.actions.length} acción(es)
                  </p>
                  {r.description && <p className="mt-1 text-xs text-faint">{r.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="subtle" onClick={() => void showRuns(r)}>Historial</Button>
                  {canWrite && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => void toggle(r)}>{r.enabled ? "Pausar" : "Activar"}</Button>
                      <button onClick={() => void remove(r)} className="rounded-lg p-2 text-muted hover:bg-bad/10 hover:text-bad">
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {runsFor === r.id && (
                <div className="mt-3 border-t border-line pt-3">
                  {runs.length === 0 ? (
                    <p className="text-xs text-muted">Aún no se ha ejecutado.</p>
                  ) : (
                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {runs.map((run) => (
                        <div key={run.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs">
                          <span className="flex items-center gap-2">
                            <Badge tone={run.status === "success" ? "good" : run.status === "error" ? "bad" : "neutral"}>{run.status}</Badge>
                            <span className="text-muted">{run.triggerKey}</span>
                          </span>
                          <span className="text-faint">{formatDateTime(run.executedAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
