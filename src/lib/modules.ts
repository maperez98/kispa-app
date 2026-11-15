// Registro de módulos de negocio: define campos, columnas y validación zod
// para el CRUD genérico y para la UI dinámica.
import { z } from "zod";

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "email" | "number" | "date" | "textarea" | "money" | "select";
  required?: boolean;
  options?: string[] | "clients" | "product_categories" | "expense_categories";
  placeholder?: string;
}

export interface ModuleDef {
  key: string;
  label: string;
  icon: string;
  singular: string;
  description: string;
  fields: FieldDef[];
  columns: string[];
}

const optStr = z.string().max(500).nullish();
const uuidNull = z.string().uuid().nullish();

export const MODULES: Record<string, ModuleDef> = {
  clients: {
    key: "clients",
    label: "Clientes",
    icon: "users",
    singular: "cliente",
    description: "Registro, contacto e historial de tus clientes.",
    columns: ["name", "phone", "email", "document"],
    fields: [
      { key: "name", label: "Nombre completo", type: "text", required: true },
      { key: "phone", label: "Teléfono / WhatsApp", type: "text" },
      { key: "email", label: "Correo electrónico", type: "email" },
      { key: "document", label: "Documento (CC / NIT)", type: "text" },
      { key: "address", label: "Dirección", type: "text" },
      { key: "notes", label: "Notas", type: "textarea" },
    ],
  },
  orders: {
    key: "orders",
    label: "Pedidos",
    icon: "clipboard",
    singular: "pedido",
    description: "Pedidos, órdenes de servicio y trabajos con estados.",
    columns: ["title", "status", "totalCents", "dueDate"],
    fields: [
      { key: "title", label: "Título del pedido", type: "text", required: true },
      { key: "clientId", label: "Cliente", type: "select", options: "clients" },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: ["pending", "in_progress", "done", "cancelled"],
      },
      { key: "totalCents", label: "Valor estimado", type: "money" },
      { key: "dueDate", label: "Fecha de entrega", type: "date" },
      { key: "description", label: "Descripción", type: "textarea" },
    ],
  },
  expenses: {
    key: "expenses",
    label: "Gastos",
    icon: "wallet",
    singular: "gasto",
    description: "Registro de gastos con categorías y reportes.",
    columns: ["description", "amountCents", "categoryId", "date"],
    fields: [
      { key: "description", label: "Descripción", type: "text", required: true },
      { key: "amountCents", label: "Monto", type: "money", required: true },
      { key: "categoryId", label: "Categoría", type: "select", options: "expense_categories" },
      {
        key: "paymentMethod",
        label: "Método de pago",
        type: "select",
        options: ["cash", "card", "transfer"],
      },
      { key: "date", label: "Fecha", type: "date" },
      { key: "receiptRef", label: "Referencia / soporte", type: "text" },
    ],
  },
  receivables: {
    key: "receivables",
    label: "Cuentas por cobrar",
    icon: "clock",
    singular: "cuenta por cobrar",
    description: "Pagos pendientes de clientes, abonos y seguimiento.",
    columns: ["clientId", "description", "amountCents", "paidCents", "status", "dueDate"],
    fields: [
      { key: "clientId", label: "Cliente", type: "select", options: "clients" },
      { key: "description", label: "Concepto", type: "text" },
      { key: "amountCents", label: "Monto total", type: "money", required: true },
      { key: "dueDate", label: "Fecha de vencimiento", type: "date" },
    ],
  },
  employees: {
    key: "employees",
    label: "Equipo",
    icon: "badge",
    singular: "miembro del equipo",
    description: "Usuarios del sistema, roles y permisos.",
    columns: ["name", "email", "role"],
    fields: [
      { key: "name", label: "Nombre", type: "text", required: true },
      { key: "email", label: "Correo", type: "email", required: true },
      { key: "password", label: "Contraseña inicial", type: "text", required: true, placeholder: "Mínimo 8 caracteres" },
      { key: "role", label: "Rol", type: "select", options: ["operator", "admin", "viewer"] },
    ],
  },
};

export const MODULE_KEYS = Object.keys(MODULES);

export const MODULE_SCHEMAS: Record<string, z.ZodTypeAny> = {
  clients: z.object({
    name: z.string().min(1).max(200),
    phone: optStr,
    email: z.union([z.string().email().max(200), z.literal("")]).nullish(),
    document: optStr,
    address: optStr,
    notes: optStr,
    tags: z.array(z.string().max(40)).optional(),
  }),
  orders: z.object({
    title: z.string().min(1).max(200),
    clientId: uuidNull,
    status: z.enum(["pending", "in_progress", "done", "cancelled"]).default("pending"),
    totalCents: z.number().int().min(0).default(0),
    dueDate: z.string().nullish(),
    description: optStr,
  }),
  expenses: z.object({
    description: z.string().min(1).max(300),
    amountCents: z.number().int().min(1),
    categoryId: uuidNull,
    paymentMethod: z.enum(["cash", "card", "transfer"]).default("cash"),
    date: z.string().optional(),
    receiptRef: optStr,
  }),
  receivables: z.object({
    clientId: uuidNull,
    saleId: uuidNull,
    description: optStr,
    amountCents: z.number().int().min(1),
    dueDate: z.string().nullish(),
  }),
  employees: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(200),
    password: z.string().min(8).max(100).optional(),
    role: z.enum(["admin", "operator", "viewer"]).default("operator"),
  }),
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  done: "Completado",
  cancelled: "Cancelado",
};

export const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  partial: "Abonado",
  paid: "Pagada",
  overdue: "Vencida",
};

export const SALE_STATUS_LABELS: Record<string, string> = {
  completed: "Completada",
  pending: "Pendiente",
  cancelled: "Cancelada",
};

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  credit: "Crédito (por cobrar)",
};
