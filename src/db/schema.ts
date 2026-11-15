import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const idCol = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const companyRef = () =>
  uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" });

/* ---------------------------------- Auth ---------------------------------- */

export const users = pgTable("users", {
  id: idCol(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: idCol(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------ Planes / SaaS ------------------------------ */

export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // free | pro | business
  name: text("name").notNull(),
  priceCopMonth: integer("price_cop_month").notNull().default(0),
  limits: jsonb("limits").$type<Record<string, unknown>>().notNull().default({}),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
});

export const companies = pgTable("companies", {
  id: idCol(),
  name: text("name").notNull(),
  nit: text("nit"),
  sector: text("sector"),
  businessType: text("business_type"),
  country: text("country").notNull().default("CO"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const companyUsers = pgTable(
  "company_users",
  {
    id: idCol(),
    companyId: companyRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("operator"), // owner | admin | operator | viewer
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("company_user_unique").on(t.companyId, t.userId),
    index("company_user_user_idx").on(t.userId),
  ],
);

export const subscriptions = pgTable("subscriptions", {
  id: idCol(),
  companyId: companyRef().unique(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  status: text("status").notNull().default("active"), // active | trialing | past_due | canceled
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: createdAt(),
});

/* --------------------- Motor de configuración (workspace) ------------------- */

export const workspaceConfigs = pgTable("workspace_configs", {
  id: idCol(),
  companyId: companyRef().unique(),
  businessProfile: jsonb("business_profile")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  modules: jsonb("modules")
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default([]),
  entities: jsonb("entities").$type<Record<string, unknown>>().notNull().default({}),
  dashboard: jsonb("dashboard")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({ widgets: [] }),
  appliedHashes: jsonb("applied_hashes").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const pendingChanges = pgTable(
  "pending_changes",
  {
    id: idCol(),
    companyId: companyRef(),
    conversationId: uuid("conversation_id"),
    description: text("description").notNull(),
    patch: jsonb("patch").$type<Record<string, unknown>>().notNull(),
    patchHash: text("patch_hash").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    onboarding: boolean("onboarding").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("pending_changes_company_idx").on(t.companyId),
    index("pending_changes_hash_idx").on(t.companyId, t.patchHash, t.status),
  ],
);

/* ------------------------------ Asistente / chat ---------------------------- */

export const conversations = pgTable(
  "conversations",
  {
    id: idCol(),
    companyId: companyRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Nueva conversación"),
    createdAt: createdAt(),
  },
  (t) => [index("conversations_company_idx").on(t.companyId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: idCol(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant | system
    content: text("content").notNull(),
    structured: jsonb("structured").$type<Record<string, unknown> | null>(),
    pendingChangeId: uuid("pending_change_id"),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_conv_idx").on(t.conversationId)],
);

/* ------------------------------- Módulos de negocio ------------------------- */

export const clients = pgTable(
  "clients",
  {
    id: idCol(),
    companyId: companyRef(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    document: text("document"),
    address: text("address"),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clients_company_idx").on(t.companyId)],
);

export const productCategories = pgTable(
  "product_categories",
  {
    id: idCol(),
    companyId: companyRef(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("product_categories_unique").on(t.companyId, t.name)],
);

export const products = pgTable(
  "products",
  {
    id: idCol(),
    companyId: companyRef(),
    name: text("name").notNull(),
    sku: text("sku"),
    categoryId: uuid("category_id").references(() => productCategories.id, {
      onDelete: "set null",
    }),
    priceCents: integer("price_cents").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    stock: real("stock").notNull().default(0),
    lowStockThreshold: real("low_stock_threshold").notNull().default(5),
    unit: text("unit").notNull().default("unidad"),
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_company_idx").on(t.companyId)],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: idCol(),
    companyId: companyRef(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // in | out | adjust
    quantity: real("quantity").notNull(),
    reason: text("reason"),
    reference: text("reference"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("inventory_movements_company_idx").on(t.companyId),
    index("inventory_movements_product_idx").on(t.productId),
  ],
);

export const sales = pgTable(
  "sales",
  {
    id: idCol(),
    companyId: companyRef(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    number: integer("number").notNull().default(1),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    paymentMethod: text("payment_method").notNull().default("cash"), // cash|card|transfer|credit
    status: text("status").notNull().default("completed"), // completed | pending | cancelled
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("sales_company_idx").on(t.companyId)],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: idCol(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    quantity: real("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId)],
);

export const orders = pgTable(
  "orders",
  {
    id: idCol(),
    companyId: companyRef(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("pending"), // pending | in_progress | done | cancelled
    totalCents: integer("total_cents").notNull().default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("orders_company_idx").on(t.companyId)],
);

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: idCol(),
    companyId: companyRef(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("expense_categories_unique").on(t.companyId, t.name)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: idCol(),
    companyId: companyRef(),
    categoryId: uuid("category_id").references(() => expenseCategories.id, {
      onDelete: "set null",
    }),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    paymentMethod: text("payment_method").notNull().default("cash"),
    date: timestamp("date", { withTimezone: true }).defaultNow().notNull(),
    receiptRef: text("receipt_ref"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_company_idx").on(t.companyId)],
);

export const receivables = pgTable(
  "receivables",
  {
    id: idCol(),
    companyId: companyRef(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    saleId: uuid("sale_id").references(() => sales.id, { onDelete: "set null" }),
    description: text("description"),
    amountCents: integer("amount_cents").notNull(),
    paidCents: integer("paid_cents").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | partial | paid | overdue
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("receivables_company_idx").on(t.companyId)],
);

export const receivablePayments = pgTable(
  "receivable_payments",
  {
    id: idCol(),
    receivableId: uuid("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").notNull().default("cash"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("receivable_payments_rec_idx").on(t.receivableId)],
);

/* ------------------------------ Automatizaciones ---------------------------- */

export const automationRules = pgTable(
  "automation_rules",
  {
    id: idCol(),
    companyId: companyRef(),
    name: text("name").notNull(),
    description: text("description"),
    trigger: text("trigger").notNull(), // sale.created | inventory.low | inventory.changed | expense.created | order.created | order.status_changed | receivable.overdue | payment.registered | schedule.daily
    conditions: jsonb("conditions")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    actions: jsonb("actions")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("automation_rules_company_idx").on(t.companyId)],
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: idCol(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    companyId: companyRef(),
    trigger: text("trigger").notNull(),
    triggerKey: text("trigger_key").notNull(),
    status: text("status").notNull().default("success"), // success | error | skipped
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    error: text("error"),
    executedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("automation_runs_dedupe").on(t.ruleId, t.triggerKey),
    index("automation_runs_company_idx").on(t.companyId),
  ],
);

/* --------------------------- Alertas y auditoría ---------------------------- */

export const alerts = pgTable(
  "alerts",
  {
    id: idCol(),
    companyId: companyRef(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    severity: text("severity").notNull().default("info"), // info | warning | critical
    read: boolean("read").notNull().default(false),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("alerts_company_idx").on(t.companyId),
    index("alerts_unread_idx").on(t.companyId, t.read),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: idCol(),
    companyId: companyRef(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_company_idx").on(t.companyId),
    index("audit_logs_created_idx").on(t.companyId, t.createdAt),
  ],
);

/* ------------------------- Sincronización (outbox) -------------------------- */

export const outboxOps = pgTable("outbox_ops", {
  id: idCol(),
  companyId: companyRef(),
  clientOpId: text("client_op_id").notNull().unique(),
  entity: text("entity").notNull(),
  operation: text("operation").notNull(), // create | update | delete
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("pending"), // pending | applied | failed
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: createdAt(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});
