// Núcleo puro del motor de configuración: esquemas validados (zod), propuesta
// de configuración a partir del perfil del negocio, merge y hash anti-duplicados.
// Sin dependencias de base de datos (testable con node:test).
import { z } from "zod";
import { createHash } from "crypto";

export const MODULE_KEYS = [
  "clients",
  "products",
  "sales",
  "orders",
  "expenses",
  "receivables",
  "employees",
  "reports",
  "automations",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  clients: "Clientes",
  products: "Productos e inventario",
  sales: "Ventas",
  orders: "Pedidos",
  expenses: "Gastos",
  receivables: "Cuentas por cobrar",
  employees: "Equipo",
  reports: "Reportes",
  automations: "Automatizaciones",
};

export const ConditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["lt", "lte", "gt", "gte", "eq", "neq", "contains"]),
  value: z.union([z.number(), z.string(), z.boolean()]),
});

export const ActionSchema = z.object({
  type: z.enum(["create_alert", "create_reminder", "update_order_status", "log"]),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const AutomationProposalSchema = z.object({
  name: z.string().min(3),
  trigger: z.string().min(1),
  description: z.string().optional(),
  conditions: z.array(ConditionSchema).default([]),
  actions: z.array(ActionSchema).default([]),
  enabled: z.boolean().default(true),
});

export const WidgetSchema = z.object({
  type: z.enum(["stat", "chart", "table", "alerts"]),
  metric: z.string().min(1),
  title: z.string().optional(),
  size: z.enum(["half", "full"]).default("half"),
});

export const ConfigPatchSchema = z.object({
  profile: z
    .object({
      businessType: z.string().optional(),
      sector: z.string().optional(),
      sells: z.array(z.string()).optional(),
      teamSize: z.number().int().min(1).optional(),
      currentTools: z.array(z.string()).optional(),
      problems: z.array(z.string()).optional(),
      goals: z.array(z.string()).optional(),
    })
    .optional(),
  modules: z
    .array(
      z.object({
        key: z.enum(MODULE_KEYS),
        enabled: z.boolean().default(true),
        label: z.string().optional(),
      }),
    )
    .optional(),
  categories: z
    .object({
      products: z.array(z.object({ name: z.string().min(1) })).optional(),
      expenses: z.array(z.object({ name: z.string().min(1) })).optional(),
    })
    .optional(),
  productFields: z
    .array(
      z.object({
        name: z.string().min(1),
        label: z.string().min(1),
        type: z.enum(["text", "number", "date"]).default("text"),
      }),
    )
    .optional(),
  dashboard: z.object({ widgets: z.array(WidgetSchema) }).optional(),
  automations: z.array(AutomationProposalSchema).optional(),
});
export type ConfigPatch = z.infer<typeof ConfigPatchSchema>;

export const AssistantOutputSchema = z.object({
  reply: z.string().min(1),
  intent: z.string().default("chat"),
  question: z.string().optional(),
  proposal: ConfigPatchSchema.optional(),
  proposalDescription: z.string().optional(),
});
export type AssistantOutput = z.infer<typeof AssistantOutputSchema>;

export interface BusinessProfile {
  businessType?: string;
  sector?: string;
  sells?: string[];
  teamSize?: number;
  currentTools?: string[];
  problems?: string[];
  goals?: string[];
}

export const SECTOR_INFO: Record<
  string,
  { label: string; productCategories: string[]; expenseCategories: string[]; modules: ModuleKey[] }
> = {
  retail_store: {
    label: "Tienda de barrio / abarrotes",
    productCategories: ["Alimentos", "Bebidas", "Aseo", "Hogar", "Snacks", "Licores"],
    expenseCategories: ["Compra de mercancía", "Arriendo", "Servicios públicos", "Transporte", "Otros"],
    modules: ["clients", "products", "sales", "expenses", "receivables", "reports", "automations"],
  },
  restaurant: {
    label: "Restaurante / cafetería / comidas",
    productCategories: ["Entradas", "Platos fuertes", "Bebidas", "Postres"],
    expenseCategories: ["Insumos de cocina", "Arriendo", "Servicios públicos", "Nómina", "Otros"],
    modules: ["clients", "products", "sales", "orders", "expenses", "receivables", "employees", "reports", "automations"],
  },
  bakery: {
    label: "Panadería / repostería",
    productCategories: ["Panadería", "Repostería", "Bebidas", "Especiales"],
    expenseCategories: ["Harinas e insumos", "Arriendo", "Servicios públicos", "Nómina", "Otros"],
    modules: ["clients", "products", "sales", "orders", "expenses", "receivables", "reports", "automations"],
  },
  salon: {
    label: "Peluquería / barbería / salón de belleza",
    productCategories: ["Servicios", "Productos de venta"],
    expenseCategories: ["Insumos", "Arriendo", "Servicios públicos", "Marketing", "Otros"],
    modules: ["clients", "sales", "orders", "expenses", "employees", "reports", "automations"],
  },
  workshop: {
    label: "Taller / mecánica / reparación",
    productCategories: ["Repuestos", "Servicios", "Insumos"],
    expenseCategories: ["Repuestos", "Arriendo", "Herramientas", "Servicios públicos", "Otros"],
    modules: ["clients", "products", "sales", "orders", "expenses", "receivables", "employees", "reports", "automations"],
  },
  pharmacy: {
    label: "Farmacia / droguería",
    productCategories: ["Medicamentos", "Cuidado personal", "Bebés", "Naturales"],
    expenseCategories: ["Inventario", "Arriendo", "Servicios públicos", "Otros"],
    modules: ["clients", "products", "sales", "expenses", "receivables", "reports", "automations"],
  },
  clothing: {
    label: "Tienda de ropa / calzado / accesorios",
    productCategories: ["Ropa", "Calzado", "Accesorios"],
    expenseCategories: ["Compra de mercancía", "Arriendo", "Marketing", "Otros"],
    modules: ["clients", "products", "sales", "expenses", "receivables", "reports", "automations"],
  },
  services: {
    label: "Negocio de servicios profesionales",
    productCategories: ["Servicios"],
    expenseCategories: ["Operación", "Arriendo", "Software", "Marketing", "Otros"],
    modules: ["clients", "sales", "orders", "expenses", "receivables", "employees", "reports", "automations"],
  },
  other: {
    label: "Otro tipo de negocio",
    productCategories: ["General"],
    expenseCategories: ["Operación", "Arriendo", "Otros"],
    modules: ["clients", "products", "sales", "expenses", "reports", "automations"],
  },
};

export function detectSector(text: string): string | null {
  const t = text.toLowerCase();
  if (/colmado|abarrote|tienda|minimercado|miscel|supermercado|barrio|boutique/.test(t)) return "retail_store";
  if (/panader|reposter|helader|arepa|pastel/.test(t)) return "bakery";
  if (/restaurante|cafeter|comida|menu|menú|asadero|pizza|hamburg/.test(t)) return "restaurant";
  if (/peluquer|barber|sal[oó]n|belleza|uñas|unas|corte de pelo|estética|estetica/.test(t)) return "salon";
  if (/taller|mec[aá]nic|reparaci|llantas|carro|auto|computador/.test(t)) return "workshop";
  if (/farmacia|droguer|medicamento/.test(t)) return "pharmacy";
  if (/ropa|calzado|zapato|accesorio/.test(t)) return "clothing";
  if (/servicio|consultor|diseñ|disen|abogad|contador|fotograf/.test(t)) return "services";
  return null;
}

// Construye la propuesta de configuración completa a partir del perfil del negocio.
export function proposeFromProfile(p: BusinessProfile): ConfigPatch {
  const sector =
    p.sector && SECTOR_INFO[p.sector]
      ? p.sector
      : detectSector([p.businessType ?? "", ...(p.sells ?? []), ...(p.problems ?? [])].join(" ")) ?? "other";
  const info = SECTOR_INFO[sector];
  const modules = new Set<ModuleKey>(info.modules);
  const goalsText = [...(p.goals ?? []), ...(p.problems ?? []), p.businessType ?? ""].join(" ").toLowerCase();
  if (/pedido|cita|orden de servicio|encargar|agendar/.test(goalsText)) modules.add("orders");
  if (/fiado|cr[eé]dito|pendiente|cobrar|deuda|deben/.test(goalsText)) modules.add("receivables");
  if ((p.teamSize ?? 1) > 1) modules.add("employees");
  if (/producto|inventario|stock|mercancía|mercancia/.test(goalsText)) modules.add("products");

  const widgets: z.infer<typeof WidgetSchema>[] = [
    { type: "stat", metric: "revenue_month", title: "Ingresos del mes", size: "half" },
    { type: "stat", metric: "profit_month", title: "Ganancia del mes", size: "half" },
    { type: "stat", metric: "expenses_month", title: "Gastos del mes", size: "half" },
    { type: "stat", metric: "low_stock", title: "Productos con poco stock", size: "half" },
  ];
  if (modules.has("receivables"))
    widgets.push({ type: "stat", metric: "receivables", title: "Total por cobrar", size: "half" });
  if (modules.has("clients"))
    widgets.push({ type: "stat", metric: "clients_count", title: "Clientes registrados", size: "half" });
  widgets.push({ type: "chart", metric: "sales_by_day", title: "Ventas de los últimos 14 días", size: "full" });
  if (modules.has("products"))
    widgets.push({ type: "chart", metric: "top_products", title: "Productos más vendidos", size: "half" });
  widgets.push({ type: "chart", metric: "expenses_by_category", title: "Gastos por categoría", size: "half" });
  widgets.push({ type: "table", metric: "recent_sales", title: "Ventas recientes", size: "full" });
  if (modules.has("products"))
    widgets.push({ type: "table", metric: "low_stock_products", title: "Inventario en punto bajo", size: "half" });
  widgets.push({ type: "alerts", metric: "alerts", title: "Alertas", size: "half" });

  return {
    profile: { ...p, sector },
    modules: [...modules].map((key) => ({ key, enabled: true, label: MODULE_LABELS[key] })),
    categories: {
      products: info.productCategories.map((name) => ({ name })),
      expenses: info.expenseCategories.map((name) => ({ name })),
    },
    dashboard: { widgets },
    automations: [
      {
        name: "Alerta de stock bajo",
        trigger: "inventory.low",
        description: "Genera una alerta cuando un producto baja de su umbral de stock.",
        conditions: [{ field: "stock", op: "lte", value: 5 }],
        actions: [
          {
            type: "create_alert",
            params: {
              severity: "warning",
              title: "Stock bajo: {name}",
              message: "Quedan {stock} unidades de {name}. Es momento de reponer.",
            },
          },
        ],
        enabled: true,
      },
      {
        name: "Recordatorio de cuentas por cobrar vencidas",
        trigger: "receivable.overdue",
        description: "Avisa cuando una cuenta por cobrar supera su fecha de vencimiento.",
        conditions: [],
        actions: [
          {
            type: "create_reminder",
            params: {
              title: "Cuenta por cobrar vencida",
              message: "{clientName} tiene una cuenta vencida por {amount}.",
            },
          },
        ],
        enabled: true,
      },
    ],
  };
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return (
    "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k])).join(",") + "}"
  );
}

export function hashPatch(patch: unknown): string {
  return createHash("sha256").update(stableStringify(patch)).digest("hex");
}

export function mergeModules(
  current: Array<Record<string, unknown>>,
  incoming: Array<{ key: string; enabled: boolean; label?: string }>,
): Array<Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const m of current) if (typeof m.key === "string") map.set(m.key, m);
  for (const m of incoming) {
    const prev = map.get(m.key) ?? {};
    map.set(m.key, { ...prev, ...m });
  }
  return [...map.values()];
}

// Descripción humana (español) de un patch para la vista previa de aprobación.
export function describePatch(patch: ConfigPatch): string[] {
  const out: string[] = [];
  if (patch.modules)
    for (const m of patch.modules)
      out.push(`${m.enabled ? "Activar" : "Desactivar"} el módulo «${m.label ?? MODULE_LABELS[m.key] ?? m.key}»`);
  if (patch.categories?.products?.length)
    out.push(`Crear categorías de productos: ${patch.categories.products.map((c) => c.name).join(", ")}`);
  if (patch.categories?.expenses?.length)
    out.push(`Crear categorías de gastos: ${patch.categories.expenses.map((c) => c.name).join(", ")}`);
  if (patch.productFields)
    for (const f of patch.productFields) out.push(`Agregar campo «${f.label}» a los productos (tipo ${f.type})`);
  if (patch.dashboard) out.push(`Configurar el panel con ${patch.dashboard.widgets.length} indicadores y secciones`);
  if (patch.automations)
    for (const a of patch.automations) out.push(`Crear automatización «${a.name}» (disparador: ${a.trigger})`);
  if (patch.profile) out.push("Actualizar el perfil del negocio");
  return out;
}
