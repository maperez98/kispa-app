"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, Field, Input, PageHeader, Spinner, cls } from "@/components/ui";
import { ApiError, api } from "@/lib/client/api";
import { useApp } from "@/components/app-shell";
import { MODULE_KEYS, MODULE_LABELS, type ConfigPatch, type ModuleKey } from "@/lib/config/patch";
import { formatCOP } from "@/lib/brand";
import { can } from "@/lib/permissions";

export default function SettingsPage() {
  const { config, refreshConfig } = useApp();
  const role = config.role;
  const [plans, setPlans] = useState<any[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ plans: any[] }>("/api/plans").then((d) => setPlans(d.plans)).catch(() => {});
  }, []);

  const activeModules = new Set(config.config.modules.filter((m) => m.enabled !== false).map((m) => m.key));
  const profile = config.config.businessProfile as Record<string, any>;

  async function toggleModule(key: string, enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      const patch: ConfigPatch = { modules: [{ key: key as ModuleKey, enabled }] };
      await api("/api/config", { method: "PATCH", body: JSON.stringify({ patch }) });
      await refreshConfig();
      setToast(`Módulo «${MODULE_LABELS[key as ModuleKey]}» ${enabled ? "activado" : "desactivado"}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  }

  const canWrite = can(role, "config", "write");

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Ajustes" description="Empresa, módulos activos, plan y perfil del negocio." />
      {toast && <p className="rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-sm text-good">{toast}</p>}
      {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

      <Card className="p-6">
        <h2 className="font-display text-base font-semibold">Tu empresa</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre del negocio"><Input value={config.company.name} disabled /></Field>
          <Field label="Tu rol"><Input value={role} disabled /></Field>
          <Field label="Tipo de negocio"><Input value={profile.businessType ?? "—"} disabled /></Field>
          <Field label="Sector detectado"><Input value={profile.sector ?? "—"} disabled /></Field>
        </div>
        <p className="mt-4 text-xs text-muted">
          Para cambiar el perfil del negocio, conversa con el{" "}
          <Link href="/app/assistant" className="text-ember-soft hover:text-ember">asistente</Link>.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-base font-semibold">Módulos activos</h2>
        <p className="mt-1 text-xs text-muted">Activa o desactiva módulos de tu espacio de trabajo.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_KEYS.map((key) => {
            const on = activeModules.has(key);
            return (
              <button
                key={key}
                disabled={!canWrite || saving}
                onClick={() => void toggleModule(key, !on)}
                className={cls(
                  "flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors",
                  on ? "border-ember/40 bg-ember/10" : "border-line bg-white/[0.03] hover:bg-white/5",
                  !canWrite && "opacity-60",
                )}
              >
                <span className="text-sm font-medium">{MODULE_LABELS[key]}</span>
                <span className={cls("relative h-5 w-9 rounded-full transition-colors", on ? "bg-ember" : "bg-white/10")}>
                  <span className={cls("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} />
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Plan y facturación</h2>
          {config.plan && <Badge tone="ember">Plan actual: {config.plan.name}</Badge>}
        </div>
        {!config.paymentsEnabled && (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            Los cobros en línea están desactivados: no hay un proveedor de pagos configurado (PAYMENTS_PROVIDER).
            Para activar suscripciones de pago, configura las credenciales del proveedor en las variables de entorno.
          </p>
        )}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className={cls("rounded-2xl border p-4", config.plan?.id === p.id ? "border-ember/50 bg-ember/5" : "border-line")}>
              <p className="font-display text-sm font-semibold">{p.name}</p>
              <p className="mt-1 font-display text-xl font-semibold">
                {p.priceCopMonth === 0 ? "Gratis" : `${formatCOP(p.priceCopMonth * 100)}/mes`}
              </p>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {(p.features as string[]).slice(0, 5).map((f) => <li key={f}>• {f}</li>)}
              </ul>
              <p className="mt-3 text-[11px] text-faint">
                Límites: {p.limits?.maxUsers} usuarios · {p.limits?.maxProducts} productos · {p.limits?.maxAutomations} automatizaciones
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-base font-semibold">Seguridad y sincronización</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li className="flex gap-2"><Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-good" /> Sesiones con cookie httpOnly; contraseñas hasheadas (bcrypt); aislamiento por empresa en cada consulta.</li>
          <li className="flex gap-2"><Icon name="refresh" className="mt-0.5 h-4 w-4 shrink-0 text-good" /> Sin conexión, las operaciones quedan en una cola local y se sincronizan al volver (idempotente por clientOpId).</li>
          <li className="flex gap-2"><Icon name="bell" className="mt-0.5 h-4 w-4 shrink-0 text-good" /> Todas las operaciones quedan en la auditoría de tu empresa.</li>
        </ul>
      </Card>
    </div>
  );
}
