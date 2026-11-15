"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, Empty, Field, Input, Label, Modal, PageHeader, Select, Spinner, Textarea, cls } from "@/components/ui";
import { ApiError, api } from "@/lib/client/api";
import { useApp } from "@/components/app-shell";
import { MODULES, ORDER_STATUS_LABELS, PAYMENT_LABELS, RECEIVABLE_STATUS_LABELS, type FieldDef } from "@/lib/modules";
import { formatCOP, formatDate } from "@/lib/brand";
import { can } from "@/lib/permissions";

export default function ResourcePage() {
  const pathname = usePathname();
  const module = pathname.split("/").pop() ?? "";
  const def = MODULES[module];
  const { config } = useApp();
  const role = config.role;

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [selectOptions, setSelectOptions] = useState<Record<string, Array<{ id: string; name: string }>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ rows: any[] }>(`/api/resource?module=${module}&limit=300`);
      setRows(d.rows);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!def) return;
    const dynamic = def.fields.filter((f) => typeof f.options === "string");
    void Promise.all(
      dynamic.map(async (f) => {
        const opt = f.options as string;
        if (opt === "clients") {
          const d = await api<{ rows: any[] }>("/api/resource?module=clients&limit=500");
          setSelectOptions((s) => ({ ...s, clients: d.rows.map((r) => ({ id: r.id, name: r.name })) }));
        } else if (opt === "expense_categories") {
          const d = await api<{ rows: any[] }>("/api/categories?type=expenses");
          setSelectOptions((s) => ({ ...s, expense_categories: d.rows }));
        } else if (opt === "product_categories") {
          const d = await api<{ rows: any[] }>("/api/categories?type=products");
          setSelectOptions((s) => ({ ...s, product_categories: d.rows }));
        }
      }),
    );
  }, [def]);

  const extraFields = useMemo(() => {
    const prod = (config.config.entities as any)?.products;
    return module === "products" ? (prod?.extraFields ?? []) : [];
  }, [config, module]);

  if (!def) {
    return <Empty title="Módulo no encontrado" description={`No existe el módulo «${module}».`} />;
  }

  const canWrite = can(role, module, "write");
  const canDelete = can(role, module, "delete");

  function openCreate() {
    setEditing(null);
    const f: Record<string, any> = {};
    for (const field of def.fields) f[field.key] = field.type === "money" ? "" : "";
    if (module === "orders") f.status = "pending";
    if (module === "expenses") f.paymentMethod = "cash";
    if (module === "employees") f.role = "operator";
    setForm(f);
    setModalOpen(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    const f: Record<string, any> = {};
    for (const field of def.fields) {
      const v = row[field.key];
      f[field.key] = field.type === "money" ? (v != null ? (v / 100).toString() : "") : v ?? "";
    }
    if (module === "employees") delete f.password;
    setForm(f);
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, any> = {};
      for (const field of def.fields) {
        let v = form[field.key];
        if (v === "" || v === undefined) v = null;
        if (field.type === "money") payload[field.key] = Math.round(Number(v ?? 0) * 100);
        else if (field.key === "password" && !editing) payload.password = v;
        else if (field.key === "password") continue;
        else payload[field.key] = v;
      }
      if (module === "employees" && editing) {
        await api(`/api/resource?module=employees&id=${editing.id}`, { method: "PATCH", body: JSON.stringify({ role: form.role }) });
      } else if (editing) {
        await api(`/api/resource?module=${module}&id=${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api(`/api/resource?module=${module}`, { method: "POST", body: JSON.stringify(payload) });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: any) {
    if (!confirm(`¿Eliminar este registro «${row.name ?? row.title ?? row.description ?? ""}»?`)) return;
    try {
      await api(`/api/resource?module=${module}&id=${row.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  async function pay() {
    if (!payTarget) return;
    const cents = Math.round(Number(payAmount) * 100);
    if (!cents || cents <= 0) return;
    try {
      await api(`/api/resource?module=receivables&id=${payTarget.id}&pay=1`, {
        method: "POST",
        body: JSON.stringify({ amountCents: cents, method: payMethod }),
      });
      setPayTarget(null);
      setPayAmount("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar el abono");
    }
  }

  const filtered = rows.filter((r) =>
    !search ||
    [r.name, r.title, r.description, r.phone, r.email]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(search.toLowerCase())),
  );

  function cell(row: any, key: string) {
    const v = row[key];
    if (key === "amountCents" || key === "totalCents" || key === "paidCents") return formatCOP(v);
    if (key === "status") {
      const map = module === "orders" ? ORDER_STATUS_LABELS : RECEIVABLE_STATUS_LABELS;
      const tone = v === "done" || v === "paid" ? "good" : v === "cancelled" || v === "overdue" ? "bad" : v === "in_progress" || v === "partial" ? "warn" : "neutral";
      return <Badge tone={tone as any}>{map[v] ?? v}</Badge>;
    }
    if (key === "paymentMethod") return PAYMENT_LABELS[v] ?? v ?? "—";
    if (key === "dueDate" || key === "date" || key === "createdAt") return formatDate(v);
    if (key === "clientId") return row.clientName ?? "—";
    if (key === "categoryId") return row.categoryName ?? "—";
    if (key === "role") return v;
    return v ?? "—";
  }

  return (
    <div>
      <PageHeader
        title={def.label}
        description={def.description}
        actions={
          <>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="w-56 pl-9" />
            </div>
            {canWrite && (
              <Button onClick={openCreate}>
                <Icon name="plus" className="h-4 w-4" /> Nuevo {def.singular}
              </Button>
            )}
          </>
        }
      />
      {error && <p className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-10"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10">
            <Empty
              icon={def.icon}
              title={rows.length === 0 ? `Aún no hay ${def.label.toLowerCase()}` : "Sin resultados"}
              description={rows.length === 0 ? `Registra tu primer ${def.singular} para empezar.` : "Prueba con otra búsqueda."}
              action={rows.length === 0 && canWrite ? <Button onClick={openCreate}><Icon name="plus" className="h-4 w-4" /> Nuevo {def.singular}</Button> : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-faint">
                  {def.columns.map((c) => (
                    <th key={c} className="px-4 py-3 font-medium">{labelFor(def.fields, c, c)}</th>
                  ))}
                  {(canWrite || canDelete) && <th className="px-4 py-3 text-right font-medium">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-line/50 transition-colors hover:bg-white/[0.03]">
                    {def.columns.map((c) => (
                      <td key={c} className="px-4 py-3">{cell(row, c)}</td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {module === "receivables" && row.status !== "paid" && canWrite && (
                          <Button size="sm" variant="subtle" onClick={() => { setPayTarget(row); setPayAmount(String(((row.amountCents - row.paidCents) / 100) || "")); }}>
                            <Icon name="card" className="h-3.5 w-3.5" /> Abonar
                          </Button>
                        )}
                        {canWrite && (
                          <button onClick={() => openEdit(row)} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-ink" title="Editar">
                            <Icon name="pencil" className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => void remove(row)} className="rounded-lg p-2 text-muted hover:bg-bad/10 hover:text-bad" title="Eliminar">
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Editar ${def.singular}` : `Nuevo ${def.singular}`} wide={def.fields.length > 4}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {def.fields.map((f) => (
            <div key={f.key} className={cls(f.type === "textarea" && "sm:col-span-2")}>
              {f.type === "textarea" ? (
                <Field label={f.label} required={f.required}>
                  <Textarea value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
                </Field>
              ) : f.type === "select" ? (
                <Field label={f.label} required={f.required}>
                  <Select value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value || null })}>
                    <option value="">— Sin asignar —</option>
                    {typeof f.options === "string"
                      ? (selectOptions[f.options] ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)
                      : (f.options ?? []).map((o) => <option key={o} value={o}>{labelFor([], o, o)}</option>)}
                  </Select>
                </Field>
              ) : (
                <Field label={f.label} required={f.required}>
                  <Input
                    type={f.type === "money" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.key === "password" ? "password" : "text"}
                    min={f.type === "money" ? 0 : undefined}
                    step={f.type === "money" ? "any" : undefined}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.type === "money" ? "0" : f.placeholder}
                    required={f.required}
                  />
                </Field>
              )}
            </div>
          ))}
          {extraFields.length > 0 && module === "products" && <p className="text-xs text-faint sm:col-span-2">Campos personalizados configurados: {extraFields.map((f: any) => f.label).join(", ")}</p>}
        </div>
        {error && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Guardar</Button>
        </div>
      </Modal>

      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Registrar abono">
        {payTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Cuenta de <strong>{payTarget.clientName ?? "cliente"}</strong> — saldo pendiente:{" "}
              <strong className="text-ink">{formatCOP(payTarget.amountCents - payTarget.paidCents)}</strong>
            </p>
            <Field label="Monto del abono (COP)" required>
              <Input type="number" min={0} step="any" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus />
            </Field>
            <Field label="Método">
              <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPayTarget(null)}>Cancelar</Button>
              <Button onClick={() => void pay()}><Icon name="check" className="h-4 w-4" /> Registrar abono</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function labelFor(fields: FieldDef[], key: string, fallback: string) {
  const f = fields.find((x) => x.key === key);
  if (f) return f.label;
  const map: Record<string, string> = {
    status: "Estado", paymentMethod: "Pago", dueDate: "Vencimiento", date: "Fecha", totalCents: "Total",
    amountCents: "Monto", paidCents: "Abonado", clientId: "Cliente", categoryId: "Categoría", role: "Rol",
    createdAt: "Creado",
  };
  return map[key] ?? fallback.charAt(0).toUpperCase() + fallback.slice(1);
}
