// Vista previa legible de un ConfigPatch en el cliente (sin zod para no
// pesar en el bundle; el servidor valida con zod igualmente).
import { MODULE_LABELS, type ConfigPatch, type ModuleKey } from "@/lib/config/patch";

export function describePatchClient(patch: ConfigPatch): string[] {
  const out: string[] = [];
  if (patch.modules)
    for (const m of patch.modules)
      out.push(`${m.enabled ? "Activar" : "Desactivar"} el módulo «${m.label ?? MODULE_LABELS[m.key as ModuleKey] ?? m.key}»`);
  if (patch.categories?.products?.length)
    out.push(`Categorías de productos: ${patch.categories.products.map((c) => c.name).join(", ")}`);
  if (patch.categories?.expenses?.length)
    out.push(`Categorías de gastos: ${patch.categories.expenses.map((c) => c.name).join(", ")}`);
  if (patch.productFields) for (const f of patch.productFields) out.push(`Campo «${f.label}» en productos (${f.type})`);
  if (patch.dashboard) out.push(`Panel con ${patch.dashboard.widgets.length} secciones`);
  if (patch.automations) for (const a of patch.automations) out.push(`Automatización «${a.name}» (${a.trigger})`);
  if (patch.profile) out.push("Perfil del negocio actualizado");
  return out;
}
