"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, Empty, Field, Input, Label, Modal, PageHeader, Select, Spinner, cls } from "@/components/ui";
import { ApiError, api } from "@/lib/client/api";
import { useApp } from "@/components/app-shell";
import { formatCOP, formatDateTime } from "@/lib/brand";
import { can } from "@/lib/permissions";

export default function ProductsPage() {
  const { config } = useApp();
  const role = config.role;
  const [rows, setRows] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [mov, setMov] = useState<any | null>(null);
  const [movForm, setMovForm] = useState({ type: "in", quantity: "", reason: "" });
  const [movs, setMovs] = useState<any[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        api<{ rows: any[] }>("/api/products"),
        api<{ rows: any[] }>("/api/categories?type=products"),
      ]);
      setRows(p.rows);
      setCats(c.rows);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canWrite = can(role, "products", "write");
  const canDelete = can(role, "products", "delete");

  function openCreate() {
    setEditing(null);
    setForm({ name: "", sku: "", categoryId: "", price: "", cost: "", stock: "", lowStockThreshold: "5", unit: "unidad" });
    setModal(true);
  }

  function openEdit(r: any) {
    setEditing(r);
    setForm({
      name: r.name, sku: r.sku ?? "", categoryId: r.categoryId ?? "",
      price: (r.priceCents / 100).toString(), cost: (r.costCents / 100).toString(),
      stock: String(r.stock), lowStockThreshold: String(r.lowStockThreshold), unit: r.unit,
    });
    setModal(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        sku: form.sku || null,
        categoryId: form.categoryId || null,
        priceCents: Math.round(Number(form.price || 0) * 100),
        costCents: Math.round(Number(form.cost || 0) * 100),
        stock: Number(form.stock || 0),
        lowStockThreshold: Number(form.lowStockThreshold || 5),
        unit: form.unit || "unidad",
      };
      if (editing) await api(`/api/products?id=${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
      setModal(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: any) {
    if (!confirm(`¿Eliminar el producto «${r.name}»?`)) return;
    try {
      await api(`/api/products?id=${r.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  async function saveMovement() {
    if (!mov) return;
    try {
      await api(`/api/products?id=${mov.id}&movement=1`, {
        method: "POST",
        body: JSON.stringify({ type: movForm.type, quantity: Number(movForm.quantity), reason: movForm.reason || undefined }),
      });
      setMov(null);
      setMovs(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar el movimiento");
    }
  }

  async function showMovements(r: any) {
    const d = await api<{ rows: any[] }>(`/api/products?id=${r.id}&movements=1`);
    setMovs(d.rows);
    setMov(r);
  }

  const extraFields: any[] = ((config.config.entities as any)?.products?.extraFields ?? []) as any[];

  return (
    <div>
      <PageHeader
        title="Productos e inventario"
        description="Existencias, entradas, salidas y alertas de stock bajo."
        actions={canWrite ? <Button onClick={openCreate}><Icon name="plus" className="h-4 w-4" /> Nuevo producto</Button> : undefined}
      />
      {error && <p className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-10"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="p-10">
            <Empty icon="box" title="Aún no hay productos" description="Agrega tu catálogo para controlar el inventario y las ventas." action={canWrite ? <Button onClick={openCreate}><Icon name="plus" className="h-4 w-4" /> Nuevo producto</Button> : undefined} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-faint">
                  <th className="px-4 py-3 font-medium">Producto</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 text-right font-medium">Precio</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Alerta</th>
                  {extraFields.map((f) => <th key={f.name} className="px-4 py-3 font-medium">{f.label}</th>)}
                  {(canWrite || canDelete) && <th className="px-4 py-3 text-right font-medium">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const low = r.stock <= r.lowStockThreshold;
                  return (
                    <tr key={r.id} className="border-b border-line/50 hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <span className="font-medium">{r.name}</span>
                        {r.sku && <span className="ml-2 text-xs text-faint">SKU {r.sku}</span>}
                      </td>
                      <td className="px-4 py-3 text-muted">{r.categoryName ?? "—"}</td>
                      <td className="px-4 py-3 text-right">{formatCOP(r.priceCents)}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge tone={low ? "warn" : "good"}>{r.stock} {r.unit}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">≤ {r.lowStockThreshold}</td>
                      {extraFields.map((f) => <td key={f.name} className="px-4 py-3 text-muted">{r.extra?.[f.name] ?? "—"}</td>)}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {canWrite && (
                            <>
                              <button onClick={() => void showMovements(r)} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-ink" title="Movimientos">
                                <Icon name="refresh" className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => openEdit(r)} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-ink" title="Editar">
                                <Icon name="pencil" className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {canDelete && (
                            <button onClick={() => void remove(r)} className="rounded-lg p-2 text-muted hover:bg-bad/10 hover:text-bad" title="Eliminar">
                              <Icon name="trash" className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Editar producto" : "Nuevo producto"} wide>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nombre" required><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          </div>
          <Field label="SKU"><Input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
          <Field label="Categoría">
            <Select value={form.categoryId ?? ""} onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}>
              <option value="">Sin categoría</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Precio de venta (COP)" required><Input type="number" min={0} step="any" value={form.price ?? ""} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Costo (COP)"><Input type="number" min={0} step="any" value={form.cost ?? ""} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
          <Field label="Stock actual"><Input type="number" min={0} step="any" value={form.stock ?? ""} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
          <Field label="Alerta de stock bajo en"><Input type="number" min={0} step="any" value={form.lowStockThreshold ?? "5"} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} /></Field>
          <Field label="Unidad"><Input value={form.unit ?? "unidad"} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="unidad, kg, litro…" /></Field>
        </div>
        {error && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving || !form.name}>{saving ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Guardar</Button>
        </div>
      </Modal>

      <Modal open={!!mov} onClose={() => { setMov(null); setMovs(null); }} title={mov ? `Inventario: ${mov.name}` : ""} wide>
        {mov && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Stock actual: <strong className="text-ink">{mov.stock} {mov.unit}</strong> · Alerta en ≤ {mov.lowStockThreshold}</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tipo">
                <Select value={movForm.type} onChange={(e) => setMovForm({ ...movForm, type: e.target.value })}>
                  <option value="in">Entrada</option>
                  <option value="out">Salida</option>
                  <option value="adjust">Ajustar a…</option>
                </Select>
              </Field>
              <Field label="Cantidad" required>
                <Input type="number" min={0} step="any" value={movForm.quantity} onChange={(e) => setMovForm({ ...movForm, quantity: e.target.value })} />
              </Field>
              <Field label="Motivo"><Input value={movForm.reason} onChange={(e) => setMovForm({ ...movForm, reason: e.target.value })} placeholder="Ej: compra a proveedor" /></Field>
            </div>
            <Button onClick={() => void saveMovement()} disabled={!movForm.quantity}><Icon name="check" className="h-4 w-4" /> Registrar movimiento</Button>
            {movs && movs.length > 0 && (
              <div className="mt-2">
                <Label>Últimos movimientos</Label>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {movs.map((m) => (
                    <div key={m.id} className="flex justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs">
                      <span className={cls(m.type === "in" ? "text-good" : m.type === "out" ? "text-bad" : "text-warn")}>
                        {m.type === "in" ? "+" : m.type === "out" ? "−" : "="} {m.quantity}
                      </span>
                      <span className="text-muted">{m.reason ?? "—"}</span>
                      <span className="text-faint">{formatDateTime(m.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
