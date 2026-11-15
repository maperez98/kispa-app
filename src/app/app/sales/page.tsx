"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, Empty, Field, Input, Label, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/client/api";
import { useApp } from "@/components/app-shell";
import { PAYMENT_LABELS, SALE_STATUS_LABELS } from "@/lib/modules";
import { formatCOP, formatDateTime } from "@/lib/brand";
import { can } from "@/lib/permissions";

interface ItemRow {
  productId: string;
  name: string;
  quantity: string;
  unitPrice: string;
}

export default function SalesPage() {
  const { config } = useApp();
  const role = config.role;
  const [rows, setRows] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [clientId, setClientId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ productId: "", name: "", quantity: "1", unitPrice: "" }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, c] = await Promise.all([
        api<{ rows: any[] }>("/api/sales"),
        api<{ rows: any[] }>("/api/products"),
        api<{ rows: any[] }>("/api/resource?module=clients&limit=500"),
      ]);
      setRows(s.rows);
      setProducts(p.rows);
      setClients(c.rows);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canWrite = can(role, "sales", "write");
  const canDelete = can(role, "sales", "delete");

  const total = useMemo(
    () => items.reduce((acc, it) => acc + Math.round(Number(it.quantity || 0) * Number(it.unitPrice || 0) * 100), 0),
    [items],
  );

  function setItem(i: number, patch: Partial<ItemRow>) {
    setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function pickProduct(i: number, pid: string) {
    const p = products.find((x) => x.id === pid);
    setItem(i, { productId: pid, name: p?.name ?? "", unitPrice: p ? (p.priceCents / 100).toString() : "" });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        clientId: clientId || null,
        paymentMethod,
        note: note || null,
        items: items
          .filter((it) => Number(it.quantity) > 0 && Number(it.unitPrice) >= 0)
          .map((it) => ({
            productId: it.productId || null,
            name: it.name || undefined,
            quantity: Number(it.quantity),
            unitPriceCents: Math.round(Number(it.unitPrice) * 100),
          })),
      };
      if (!payload.items.length) throw new ApiError("Agrega al menos un producto con cantidad y precio", 422);
      await api("/api/sales", { method: "POST", body: JSON.stringify(payload) });
      setModal(false);
      setItems([{ productId: "", name: "", quantity: "1", unitPrice: "" }]);
      setClientId("");
      setPaymentMethod("cash");
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar la venta");
    } finally {
      setSaving(false);
    }
  }

  async function cancelSale(r: any) {
    if (!confirm(`¿Cancelar la venta #${r.number}? Se restaurará el inventario.`)) return;
    try {
      await api(`/api/sales?id=${r.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cancelar");
    }
  }

  async function remove(r: any) {
    if (!confirm(`¿Eliminar la venta #${r.number}?`)) return;
    try {
      await api(`/api/sales?id=${r.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  return (
    <div>
      <PageHeader
        title="Ventas"
        description="Cada venta descuenta el inventario automáticamente y puede generar una cuenta por cobrar."
        actions={canWrite ? <Button onClick={() => setModal(true)}><Icon name="plus" className="h-4 w-4" /> Nueva venta</Button> : undefined}
      />
      {error && <p className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-10"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="p-10">
            <Empty icon="cart" title="Aún no hay ventas" description="Registra tu primera venta; el inventario se actualiza solo." action={canWrite ? <Button onClick={() => setModal(true)}><Icon name="plus" className="h-4 w-4" /> Nueva venta</Button> : undefined} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-faint">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Productos</th>
                  <th className="px-4 py-3 font-medium">Pago</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  {(canWrite || canDelete) && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/50 hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-medium">#{r.number}</td>
                    <td className="px-4 py-3 text-muted">{r.clientName ?? "Venta de mostrador"}</td>
                    <td className="max-w-[280px] px-4 py-3 text-xs text-muted">
                      {(r.items ?? []).map((it: any) => `${it.quantity}× ${it.name}`).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{PAYMENT_LABELS[r.paymentMethod] ?? r.paymentMethod}</td>
                    <td className="px-4 py-3">
                      <Badge tone={r.status === "completed" ? "good" : r.status === "cancelled" ? "bad" : "warn"}>
                        {SALE_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCOP(r.totalCents)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {r.status === "completed" && canWrite && (
                          <button onClick={() => void cancelSale(r)} className="rounded-lg p-1.5 text-xs text-muted hover:bg-warn/10 hover:text-warn" title="Cancelar (restaura stock)">Cancelar</button>
                        )}
                        {canDelete && (
                          <button onClick={() => void remove(r)} className="rounded-lg p-1.5 text-muted hover:bg-bad/10 hover:text-bad" title="Eliminar">
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

      <Modal open={modal} onClose={() => setModal(false)} title="Nueva venta" wide>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Cliente (opcional)">
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Venta de mostrador</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Método de pago">
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
                <option value="credit">Crédito (genera cuenta por cobrar)</option>
              </Select>
            </Field>
          </div>
          <div>
            <Label>Productos</Label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_110px_32px] items-center gap-2">
                  <Select value={it.productId} onChange={(e) => pickProduct(i, e.target.value)}>
                    <option value="">Producto manual…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} — stock {p.stock}</option>)}
                  </Select>
                  <Input type="number" min={0} step="any" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} placeholder="Cant." />
                  <Input type="number" min={0} step="any" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} placeholder="Precio (COP)" />
                  <button
                    onClick={() => setItems((arr) => arr.filter((_, idx) => idx !== i))}
                    className="rounded-lg p-2 text-muted hover:bg-bad/10 hover:text-bad"
                    disabled={items.length === 1}
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {items.some((it) => !it.productId) && (
                <Input value={items.find((it) => !it.productId)?.name ?? ""} onChange={(e) => { const i = items.findIndex((it) => !it.productId); setItem(i, { name: e.target.value }); }} placeholder="Nombre del producto manual" />
              )}
            </div>
            <Button size="sm" variant="subtle" className="mt-2" onClick={() => setItems((arr) => [...arr, { productId: "", name: "", quantity: "1", unitPrice: "" }])}>
              <Icon name="plus" className="h-3.5 w-3.5" /> Agregar ítem
            </Button>
          </div>
          <Field label="Nota (opcional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: venta del mediodía" />
          </Field>
          <div className="flex items-center justify-between border-t border-line pt-4">
            <span className="text-sm text-muted">Total</span>
            <span className="font-display text-2xl font-semibold">{formatCOP(total)}</span>
          </div>
          {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={saving || total <= 0}>{saving ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Registrar venta</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
